import { actorRefs, memoryRefs } from "../hn/gitread";
import { openDb, type IndexOutcome } from "./db";
import { readChain } from "./read";
import type { DatabaseSync } from "node:sqlite";

function ensureColumn(db: DatabaseSync, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

/**
 * Index a repo into the read model. Truth remains Git; this is a cache
 * that can be deleted and rebuilt at any time. Verification is per event,
 * at read time — a cached row's verify result is never trusted second-hand.
 */

interface IssueState {
  title: string;
  body: string;
  status: string;
  labels: string[];
  assignees: string[];
}

function asIssueState(v: unknown): IssueState | null {
  // Two payload generations exist in the wild (verified live 2026-11-11):
  //  - nested:  {"issue": {"title", "body", "status", ...}, "intent": ...}
  //  - flat:    {"title", "body", ...} (hubnot repo's 2026-09 events)
  const candidate = (typeof v === "object" && v !== null && (v as Record<string, unknown>).issue !== undefined)
    ? (v as Record<string, unknown>).issue
    : v;
  if (typeof candidate !== "object" || candidate === null) return null;
  const o = candidate as Record<string, unknown>;
  if (typeof o.title !== "string" || o.title.length === 0) return null;
  return {
    title: o.title,
    body: typeof o.body === "string" ? o.body : "",
    status: typeof o.status === "string" ? o.status : "open",
    labels: Array.isArray(o.labels) ? (o.labels as unknown[]).filter((x): x is string => typeof x === "string") : [],
    assignees: Array.isArray(o.assignees) ? (o.assignees as unknown[]).filter((x): x is string => typeof x === "string") : [],
  };
}

function eventActivityKind(kind: string): string | null {
  return kind.startsWith("issue.") ? kind : null;
}

export function indexProject(
  db: DatabaseSync,
  project: { id: string; name: string; description: string; repoPath: string },
): IndexOutcome {
  const outcome: IndexOutcome = { events: 0, verified: 0, unverified: 0, issues: 0, errors: [] as string[] };

  const refs = new Map([...actorRefs(project.repoPath), ...memoryRefs(project.repoPath)]);
  const indexedCommits = new Set(
    db.prepare("SELECT commit_sha FROM events WHERE project_id = ?").all(project.id)
      .map((r) => String((r as { commit_sha: string }).commit_sha)),
  );

  for (const [ref, headSha] of refs as Map<string, string>) {
    const actor = ref.slice("refs/hn/actors/".length);

    // Update actor bookkeeping (may include actors with no new events).
    const knownCommit = (sha: string) => indexedCommits.has(sha);
    const chain = readChain(project.repoPath, ref, knownCommit);
    outcome.errors.push(...chain.walkErrors.map((e) => `${project.id}/${actor}: ${e}`));

    const tipEventId = chain.events.length > 0
      ? chain.events[chain.events.length - 1]!.eventId
      : (db.prepare("SELECT event_id FROM events WHERE project_id = ? AND actor = ? ORDER BY sequence DESC LIMIT 1")
          .get(project.id, actor) as { event_id: string } | undefined)?.event_id
        ?? headSha;

    const displayName = chain.events.length > 0
      ? String((safeParse(chain.events[chain.events.length - 1]!.payloadJson).actorName) ?? actor.slice(0, 12))
      : actor.slice(0, 12);

    const totalForActor = Number(
      (db.prepare("SELECT COUNT(*) AS n FROM events WHERE project_id = ? AND actor = ?")
        .get(project.id, actor) as { n: number }).n,
    ) + chain.events.length;

    db.prepare(`
      INSERT INTO actors (project_id, fingerprint, display_name, public_key, chain_head, event_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, fingerprint) DO UPDATE SET
        display_name=excluded.display_name,
        public_key=excluded.public_key,
        chain_head=excluded.chain_head,
        event_count=excluded.event_count
    `).run(
      project.id,
      actor,
      displayName,
      String(safeParse(chain.events.at(-1)?.payloadJson ?? "{}").publicKey ?? ""),
      tipEventId,
      totalForActor,
    );

    // Project the new events oldest→newest.
    for (const ev of chain.events) {
      const payload = safeParse(ev.payloadJson);
      db.prepare(`INSERT OR IGNORE INTO events
        (project_id, event_id, commit_sha, actor, kind, sequence, timestamp, subject, intent, parents_json, verified, verify_error, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(project.id, ev.eventId, ev.commitSha, ev.actor, ev.kind, ev.sequence, ev.timestamp,
             ev.subject, ev.intent, ev.parentsJson, ev.verified ? 1 : 0, ev.verifyError, ev.payloadJson);

      if (ev.verified) outcome.verified += 1; else outcome.unverified += 1;
      outcome.events += 1;

      // Issue projection: open/revise/comment mutate issue state in chain order.
      if (ev.kind === "issue.open" || ev.kind === "issue.revise") {
        const st = asIssueState(payload);
        if (st) {
          const createdAt = ev.timestamp;
          const existing = db.prepare("SELECT created_at FROM issues WHERE project_id = ? AND issue_id = ?")
            .get(project.id, ev.subject ?? "") as { created_at: string | null } | undefined;
          if (ev.kind === "issue.open" || !existing) {
            db.prepare(`INSERT INTO issues (project_id, issue_id, title, body, status, creator, created_at, updated_at, conflict, labels_json, assignees_json, number)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
                        ON CONFLICT(project_id, issue_id) DO UPDATE SET
                          title=excluded.title, body=excluded.body, status=excluded.status, updated_at=excluded.updated_at, conflict=0,
                          labels_json=excluded.labels_json, assignees_json=excluded.assignees_json`)
              .run(project.id, ev.subject ?? ev.eventId, st.title, st.body, st.status, ev.actor, createdAt, ev.timestamp,
                   JSON.stringify(st.labels), JSON.stringify(st.assignees), nextIssueNumber(db, project.id));
            outcome.issues += ev.kind === "issue.open" ? 1 : 0;
          } else {
            db.prepare(`UPDATE issues SET title=?, body=?, status=?, updated_at=?, conflict=0, labels_json=?, assignees_json=?
                        WHERE project_id=? AND issue_id=?`)
              .run(st.title, st.body, st.status, ev.timestamp, JSON.stringify(st.labels), JSON.stringify(st.assignees), project.id, ev.subject ?? "");
          }
        }
      } else if (ev.kind === "issue.comment" && typeof payload.body === "string") {
        db.prepare(`INSERT OR IGNORE INTO issue_comments
          (project_id, issue_id, event_id, actor, body, timestamp, verified) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(project.id, ev.subject ?? "", ev.eventId, ev.actor, payload.body, ev.timestamp, ev.verified ? 1 : 0);
      }

      // Memory projection: per-stream signed records.
      if (ev.protocol === "memory") {
        const rec = (payload.record ?? {}) as Record<string, unknown>;
        const handoff = (rec.handoff ?? null) as Record<string, unknown> | null;
        db.prepare(`INSERT OR IGNORE INTO memories
          (project_id, memory_id, actor, stream, sequence, timestamp, kind, content, anchor_commit, applicability, lifecycle, handoff_json, verified, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
          .run(project.id, ev.eventId, ev.actor, String(payload.stream ?? ""), ev.sequence, ev.timestamp,
               String(rec.kind ?? "record"), String(rec.content ?? ""),
               typeof (rec.anchor as Record<string, unknown> | undefined)?.commit === "string" ? String((rec.anchor as Record<string, unknown>).commit) : null,
               JSON.stringify(rec.applicability ?? {}),
               handoff ? JSON.stringify(handoff) : null,
               ev.verified ? 1 : 0, ev.payloadJson);
        db.prepare(`INSERT OR IGNORE INTO activity
          (project_id, event_id, kind, actor, actor_name, timestamp, subject, summary)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(project.id, ev.eventId, `memory.${String(rec.kind ?? "record")}`, ev.actor,
               String(payload.actorName ?? actor.slice(0, 12)), ev.timestamp, ev.subject ?? "",
               `recorded memory: ${String(rec.content ?? "").slice(0, 60)}`);
        continue; // memory events carry no issue/activity-issue semantics
      }

      // Activity feed: collaboration kinds only, with a human summary.
      const ak = eventActivityKind(ev.kind);
      if (ak) {
        const title = ev.kind === "issue.open" || ev.kind === "issue.revise"
          ? asIssueState(payload)?.title ?? ""
          : "";
        db.prepare(`INSERT OR IGNORE INTO activity
          (project_id, event_id, kind, actor, actor_name, timestamp, subject, summary)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(project.id, ev.eventId, ak, ev.actor, String(payload.actorName ?? actor.slice(0, 12)),
               ev.timestamp, ev.subject ?? "", activitySummary(ak, ev.actor, title));
      }
    }
  }

  // Conflict detection: a conflict is divergent leaves in an issue's state
  // graph (nodes = issue.open/revise events, edges = parents[]. An event
  // with two parents is a merge of prior states and creates no head.)
  db.exec("UPDATE issues SET conflict = 0 WHERE project_id = " + quote(project.id));
  const stateRows = db.prepare(
    "SELECT event_id, subject, parents_json FROM events WHERE project_id = ? AND kind IN ('issue.open','issue.revise') AND subject IS NOT NULL",
  ).all(project.id) as Array<{ event_id: string; subject: string; parents_json: string }>;
  const byNode = new Map<string, { subject: string; parents: string[] }>();
  for (const row of stateRows) {
    byNode.set(row.event_id, { subject: row.subject, parents: (safeParse(row.parents_json) as unknown as string[]) ?? [] });
  }
  // referenced = any state node appearing as someone's parent
  const referenced = new Set<string>();
  for (const node of byNode.values()) {
    for (const p of node.parents) {
      if (byNode.has(p)) referenced.add(p);
    }
  }
  const leavesBySubject = new Map<string, Set<string>>();
  for (const [nodeId, node] of byNode) {
    if (referenced.has(nodeId)) continue; // has successor state(s)
    let leaves = leavesBySubject.get(node.subject);
    if (!leaves) { leaves = new Set(); leavesBySubject.set(node.subject, leaves); }
    leaves.add(nodeId);
  }
  let conflicts = 0;
  for (const [issueId, leaves] of leavesBySubject) {
    if (leaves.size > 1) {
      db.prepare("UPDATE issues SET conflict = 1 WHERE project_id = ? AND issue_id = ?").run(project.id, issueId);
      conflicts += 1;
    }
  }
  if (conflicts > 0) outcome.errors.push(`${project.id}: ${conflicts} conflicted issue heads (rendered, not resolved)`);

  db.prepare("UPDATE projects SET last_indexed_at = datetime('now') WHERE id = ?").run(project.id);
  return outcome;
}

export function ensureProject(db: DatabaseSync, p: { id: string; name: string; description: string; repoPath: string }): void {
  db.prepare(`INSERT INTO projects (id, repo_path, name, description) VALUES (?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET name=excluded.name, repo_path=excluded.repo_path,
              description=CASE WHEN EXISTS (SELECT 1 FROM project_meta m WHERE m.id = excluded.id) THEN projects.description ELSE excluded.description END`)
    .run(p.id, p.repoPath, p.name, p.description);
}

export function fullIndex(db: DatabaseSync, projects: Array<{ id: string; name: string; description: string; repoPath: string }>): IndexOutcome[] {
  const out: IndexOutcome[] = [];
  for (const p of projects) {
    ensureProject(db, p);
    ensureColumn(db, "issues", "number", "INTEGER");
    out.push(indexProject(db, p));
  }
  return out;
}

/**
 * Stable per-project issue numbers for the ergonomics layer (#1, #2, …).
 * Assigned in chain order; immutable projection of a signed ordering.
 */
export function nextIssueNumber(db: DatabaseSync, projectId: string): number {
  const row = db.prepare("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM issues WHERE project_id = ?").get(projectId) as { next: number };
  return row.next;
}

function activitySummary(kind: string, _actor: string, title: string): string {
  switch (kind) {
    case "issue.open": return `opened “${title}”`;
    case "issue.revise": return `updated “${title}”`;
    case "issue.comment": return "commented";
    default: return kind;
  }
}

function safeParse(json: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(json ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}
