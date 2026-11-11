import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { HN_BIN } from "../hn/runner";
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

export interface ActivityRecord extends ActivityRow {
  id: string;
}

export type ActivityCoverage = "complete" | "partial" | "unavailable";

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

const gitActivityLimit = 500;
const activityGitEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_NO_LAZY_FETCH: "1",
  GIT_ALLOW_PROTOCOL: "",
  GIT_DIR: undefined,
  GIT_COMMON_DIR: undefined,
  GIT_WORK_TREE: undefined,
  GIT_OBJECT_DIRECTORY: undefined,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
};

function gitDirectories(repoPath: string) {
  const dotGit = resolve(repoPath, ".git");
  const dotGitStat = lstatSync(dotGit, { throwIfNoEntry: false });
  let gitDir = dotGitStat ? dotGit : repoPath;
  if (dotGitStat?.isFile() && dotGitStat.size <= 4_096) {
    const pointer = /^gitdir: (.+)$/.exec(readFileSync(dotGit, "utf8").trim());
    if (!pointer) return null;
    gitDir = resolve(repoPath, pointer[1]);
  }
  if (!lstatSync(gitDir, { throwIfNoEntry: false })?.isDirectory() ||
      !lstatSync(resolve(gitDir, "HEAD"), { throwIfNoEntry: false })?.isFile()) return null;

  const pointerPath = resolve(gitDir, "commondir");
  const pointerStat = lstatSync(pointerPath, { throwIfNoEntry: false });
  if (pointerStat && (!pointerStat.isFile() || pointerStat.size > 4_096)) return null;
  const commonDir = pointerStat ? resolve(gitDir, readFileSync(pointerPath, "utf8").trim()) : gitDir;
  if (!lstatSync(resolve(commonDir, "objects"), { throwIfNoEntry: false })?.isDirectory()) return null;
  return { gitDir, commonDir };
}

function hasShallowHistory(repoPath: string): boolean {
  try {
    const dirs = gitDirectories(repoPath);
    return !dirs || Boolean(lstatSync(resolve(dirs.commonDir, "shallow"), { throwIfNoEntry: false }));
  } catch {
    return true;
  }
}

/** False when indexed events need native visibility verification before use. */
export function isHubnotProjectionVisible(repoPath: string): boolean {
  try {
    const dirs = gitDirectories(repoPath);
    if (!dirs || lstatSync(resolve(dirs.commonDir, "shallow"), { throwIfNoEntry: false })) return false;
    for (const dir of new Set([dirs.gitDir, dirs.commonDir])) {
      const hn = resolve(dir, "hn");
      const metadata = lstatSync(hn, { throwIfNoEntry: false });
      if (!metadata) continue;
      if (!metadata.isDirectory() || lstatSync(resolve(hn, "contribution"), { throwIfNoEntry: false })) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Walk local branches once. Git deduplicates commits shared by branch tips. */
export function readGitActivity(repoPath: string): { rows: ActivityRecord[]; coverage: ActivityCoverage } {
  let out: string;
  try {
    out = execFileSync("git", [
      "-C", repoPath, "--no-replace-objects", "log", "--branches",
      "--format=%H%x00%aI%x00%an%x00%s", "-z", "-n", String(gitActivityLimit + 1),
    ], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 3_000,
      stdio: ["ignore", "pipe", "pipe"],
      env: activityGitEnv,
    });
  } catch {
    return { rows: [], coverage: "unavailable" };
  }
  const fields = out.split("\0");
  const recordCount = Math.floor((fields.length - 1) / 4);
  const rows: ActivityRecord[] = [];
  let partial = (fields.length - 1) % 4 !== 0 || recordCount > gitActivityLimit || hasShallowHistory(repoPath);
  for (let offset = 0; offset < Math.min(recordCount, gitActivityLimit) * 4; offset += 4) {
    const [id, when, author, summary] = fields.slice(offset, offset + 4);
    const ts = toIso(when);
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id) || !ts) {
      partial = true;
      continue;
    }
    rows.push({ id, ts, summary, type: "git", detail: `${author} · ${id.slice(0, 8)}` });
  }
  return { rows, coverage: partial ? "partial" : "complete" };
}

interface ProjectRuntime {
  id: string;
  name: string;
  description: string;
  repoPath: string;
}

const fullEventId = /^sha256:[0-9a-f]{64}$/;
const nativeEvent = z.object({
  ok: z.literal(true),
  data: z.object({
    id: z.string().regex(fullEventId),
    schema: z.literal("hn.consumer/1"),
    history_scope: z.literal("visible_operative_history"),
    event: z.object({
      kind: z.string(),
      timestamp: z.iso.datetime({ offset: true }),
      actorName: z.string(),
      subject: z.string().optional(),
    }),
  }),
});
const nativeDenial = z.object({
  ok: z.literal(false),
  error: z.object({
    origin: z.literal("native"),
    code: z.enum(["not_found", "permission_denied", "admission_pending", "admission_refused"]),
  }),
});
type HubnotEventRead =
  | { kind: "visible"; event: z.infer<typeof nativeEvent>["data"]["event"] }
  | { kind: "denied" | "unknown" };

/** Consult native selected history for one full, independently indexed event. */
export function readVisibleHubnotEvent(repoPath: string, id: string, expectedKind: string): HubnotEventRead {
  if (!fullEventId.test(id)) return { kind: "unknown" };
  const result = spawnSync(HN_BIN, ["event", "show", id, "--json"], {
    cwd: repoPath,
    encoding: "utf8",
    maxBuffer: 512 * 1024,
    timeout: 300,
    killSignal: "SIGKILL",
    windowsHide: true,
    env: activityGitEnv,
  });
  if (result.error || result.status === null) return { kind: "unknown" };
  let envelope: unknown;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    return { kind: "unknown" };
  }
  if (result.status !== 0) return { kind: nativeDenial.safeParse(envelope).success ? "denied" : "unknown" };
  const parsed = nativeEvent.safeParse(envelope);
  if (!parsed.success || parsed.data.data.id !== id || parsed.data.data.event.kind !== expectedKind) {
    return { kind: "unknown" };
  }
  return { kind: "visible", event: parsed.data.data.event };
}

type IndexedEvent = { id: string; kind: string; timestamp: string | null; actorName: string | null };

/** Bound native work per request even when several repositories require checks. */
export function createHubnotActivityBudget() {
  return { remaining: 24 };
}

export function collectHubnotActivity(
  repoPath: string,
  indexed: IndexedEvent[],
  budget = createHubnotActivityBudget(),
): { rows: ActivityRecord[]; coverage: ActivityCoverage } {
  const rows: ActivityRecord[] = [];
  let incomplete = false;
  function record(id: string, event: Omit<IndexedEvent, "id">) {
    const ts = toIso(event.timestamp ?? "");
    if (!ts) {
      incomplete = true;
      return;
    }
    rows.push({ id, ts, summary: humanKind(event.kind), type: "hubnot", detail: event.actorName || "hubnot event" });
  }

  if (isHubnotProjectionVisible(repoPath)) {
    for (const event of indexed) record(event.id, event);
    return { rows, coverage: incomplete ? "partial" : "complete" };
  }

  const lookupLimit = Math.min(indexed.length, budget.remaining, 8);
  incomplete = lookupLimit < indexed.length;
  let resolved = 0;
  for (const hint of indexed.slice(0, lookupLimit)) {
    budget.remaining--;
    const result = readVisibleHubnotEvent(repoPath, hint.id, hint.kind);
    if (result.kind === "unknown") {
      incomplete = true;
      continue;
    }
    resolved++;
    if (result.kind === "visible") record(hint.id, result.event);
  }
  if (resolved === 0) return { rows, coverage: "unavailable" };
  return { rows, coverage: incomplete ? "partial" : "complete" };
}

export function listProjectRuntime(db: DatabaseSync): ProjectRuntime[] {
  return db.prepare(`
    SELECT p.id, p.name, COALESCE(m.description, p.description) AS description, p.repo_path AS repoPath
    FROM projects p LEFT JOIN project_meta m ON m.id = p.id
    ORDER BY p.name COLLATE NOCASE`).all() as unknown as ProjectRuntime[];
}

/**
 * The events table primary key deduplicates verified Hubnot discovery hints.
 * Their order prioritizes recent hints when native checks must be bounded.
 */
export function readIndexedHubnotActivity(db: DatabaseSync, projectIds?: string[]) {
  const rows = new Map<string, IndexedEvent[]>();
  if (projectIds?.length === 0) return rows;
  const scope = projectIds ? "AND e.project_id IN (SELECT value FROM json_each(?))" : "";
  const events = db.prepare(`
    SELECT e.project_id, e.event_id, e.kind, e.timestamp, a.display_name
    FROM events e LEFT JOIN actors a
      ON a.project_id = e.project_id AND a.fingerprint = e.actor
    WHERE e.verified = 1 ${scope}
    ORDER BY e.project_id, e.timestamp DESC, e.event_id
  `).all(...(projectIds ? [JSON.stringify(projectIds)] : [])) as Array<{
    project_id: string; event_id: string; kind: string; timestamp: string | null; display_name: string | null;
  }>;
  for (const e of events) {
    const list = rows.get(e.project_id) ?? [];
    list.push({ id: e.event_id, kind: e.kind, timestamp: e.timestamp, actorName: e.display_name });
    rows.set(e.project_id, list);
  }
  return rows;
}

export function projectActivity(db: DatabaseSync): Map<string, ActivityRow[]> {
  const result = new Map<string, ActivityRow[]>();
  const hubnot = readIndexedHubnotActivity(db);
  const budget = createHubnotActivityBudget();
  for (const project of listProjectRuntime(db).sort(byProjectId)) {
    const { rows } = collectHubnotActivity(project.repoPath, hubnot.get(project.id) ?? [], budget);
    if (rows.length) result.set(project.id, rows.map(({ ts, summary, type, detail }) => ({ ts, summary, type, detail })));
  }
  return result;
}

function byProjectId(a: ProjectRuntime, b: ProjectRuntime) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
  const runtimes = listProjectRuntime(db).sort(byProjectId);
  const hubnot = readIndexedHubnotActivity(db);
  const budget = createHubnotActivityBudget();
  const out: RecentProject[] = [];
  for (const p of runtimes) {
    const gitRows = readGitActivity(p.repoPath).rows;
    const events = collectHubnotActivity(p.repoPath, hubnot.get(p.id) ?? [], budget).rows;
    const all: ActivityRow[] = [...events, ...gitRows];
    const dated = all.filter((r) => r.ts !== "");
    dated.sort((a, b) => b.ts.localeCompare(a.ts));
    const latest = dated[0];
    if (!latest) continue; // no qualifying activity: Explore-only, order after actives
    const gitLast7 = dated.filter((r) => r.type === "git" && r.ts >= since).length;
    const hubLast7 = dated.filter((r) => r.type === "hubnot" && r.ts >= since).length;
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
