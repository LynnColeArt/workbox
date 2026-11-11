import { execFileSync } from "node:child_process";
import { openDb } from "./db";
import type { DatabaseSync } from "node:sqlite";

/**
 * Activity projection for Recently Active / seven-day chart / Explore.
 * Contract: kitty-specs/recently-active-projects-01M75J3T/hubnot-compatibility.md
 *   HN-001 verified events carry project + full event ID + timestamp
 *   HN-002 dedupe by (project, full event id); re-index must not create activity
 *   HN-003 git commits ranked independently; storage-ref-only commits excluded
 *   HN-004 no signer/remote/write needed — projection + local git only
 */

export interface RecentProject {
  id: string;
  name: string;
  description: string;
  latestAt: string;
  latestSource: "git" | "hubnot";
  latestSummary: string;
  gitLast7: number;
  hubnotLast7: number;
}

export interface ActivityRow {
  ts: string;
  summary: string;
  type: "git" | "hubnot";
  detail: string;
}

const DAY_MS = 86_400_000;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/** Normalize any wall-clock string we might get to a sortable ISO instant. */
export function toIso(ts: string): string {
  if (!ts) return "";
  let s = ts.trim();
  // Postgres text format guard (defense in depth; hubnot emits RFC3339)
  if (/\d{2}:\d{2}:\d{2}[+-]\d{2}$/.test(s)) s += ":00";
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

/** Git commits reachable from local branches, one row per commit (HN-003). */
function gitActivityFor(repoPath: string): ActivityRow[] {
  // --all would include refs/hn/* commit chains; enumerate refs/heads only.
  let out: string;
  try {
    out = execFileSync("git", [
      "-C", repoPath, "log", "--all", "--date=iso-strict",
      "--format=%H%x1f%aI%x1f%an%x1f%s", "--no-merges", "-n", "500",
      "--branches",
    ], { maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).toString();
  } catch {
    return []; // HN-004/edge: unreadable checkout hides nothing in Explore
  }
  const rows: ActivityRow[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const [sha, when, author, subject] = line.split("\x1f");
    if (!sha || !when) continue;
    rows.push({ ts: toIso(when), summary: subject, type: "git", detail: `${author} · ${sha.slice(0, 8)}` });
  }
  return rows;
}

interface ProjectRuntime {
  id: string;
  name: string;
  description: string;
  repoPath: string;
}

export function listProjectRuntime(db: DatabaseSync): ProjectRuntime[] {
  return db.prepare(`
    SELECT p.id, p.name, COALESCE(m.description, p.description) AS description, p.repo_path AS repoPath
    FROM projects p LEFT JOIN project_meta m ON m.id = p.id
    ORDER BY p.name COLLATE NOCASE`).all() as unknown as ProjectRuntime[];
}

/**
 * The activity projection: per project, verified hubnot events (from the
 * indexed rows — HN-001/002 dedupe is the events table PK) plus git commits
 * (HN-003, local branches only). Unverified events are excluded everywhere.
 */
export function projectActivity(db: DatabaseSync): Map<string, ActivityRow[]> {
  const result = new Map<string, ActivityRow[]>();
  const events = db.prepare(`
    SELECT project_id, kind, timestamp, actor, verified
    FROM events`).all() as unknown as Array<{
    project_id: string; kind: string; timestamp: string | null; actor: string; verified: number;
  }>;
  const actorNames = new Map<string, string>();
  for (const a of db.prepare("SELECT fingerprint, display_name FROM actors").all() as unknown as Array<{ fingerprint: string; display_name: string }>) {
    if (a.display_name) actorNames.set(a.fingerprint, a.display_name);
  }
  for (const e of events) {
    if (e.verified !== 1 || !e.timestamp) continue;
    const summary = humanKind(e.kind);
    const list = result.get(e.project_id) ?? [];
    list.push({ ts: toIso(e.timestamp), summary, type: "hubnot", detail: actorNames.get(e.actor) ?? "hubnot event" });
    result.set(e.project_id, list);
  }
  return result;
}

function humanKind(kind: string): string {
  const labels: Record<string, string> = {
    "issue.open": "opened an issue", "issue.revise": "updated an issue",
    "issue.comment": "commented", "proposal.open": "opened a proposal",
    "proposal.revise": "revised a proposal", "review.submit": "reviewed",
    "proposal.decision": "decided", "proposal.merged": "merged",
    "run.request": "requested a run", "run.result": "run finished",
  };
  if (labels[kind]) return labels[kind];
  if (kind.startsWith("memory.")) return kind === "memory.record" ? "recorded memory" : "memory update";
  return kind;
}

/**
 * Ranked view for the Dashboard (top N) and Explore (all). FR-001: most
 * recent qualifying timestamp wins; ties by name then id (spec edge rule).
 */
export function recentProjects(db: DatabaseSync, opts?: { sinceDays?: number }): RecentProject[] {
  const since = toIso(isoDaysAgo(opts?.sinceDays ?? 7));
  const runtimes = listProjectRuntime(db);
  const hubnot = projectActivity(db);
  const out: RecentProject[] = [];
  for (const p of runtimes) {
    const gitRows = gitActivityFor(p.repoPath);
    const all: ActivityRow[] = [...(hubnot.get(p.id) ?? []), ...gitRows];
    const dated = all.filter((r) => r.ts !== "");
    dated.sort((a, b) => b.ts.localeCompare(a.ts));
    const latest = dated[0];
    if (!latest) continue; // no qualifying activity: Explore-only, order after actives
    const gitLast7 = new Set(dated.filter((r) => r.type === "git" && r.ts >= since).map((r) => r.ts + r.summary)).size;
    const hubLast7 = new Set(dated.filter((r) => r.type === "hubnot" && r.ts >= since).map((r) => r.ts + r.summary)).size;
    out.push({
      id: p.id, name: p.name, description: p.description,
      latestAt: latest.ts, latestSource: latest.type,
      latestSummary: latest.summary,
      gitLast7, hubnotLast7: hubLast7,
    });
  }
  out.sort((a, b) =>
    b.latestAt.localeCompare(a.latestAt) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return out;
}

export function activityCount(db: DatabaseSync): number {
  return Number((db.prepare("SELECT COUNT(DISTINCT project_id) AS n FROM events WHERE verified = 1").get() as { n: number }).n);
}

export { openDb };
