import { openDb } from "./db";
import { git } from "../hn/gitread";
export { openDb };
import type { DatabaseSync } from "node:sqlite";
import type { FeedEntry, WorkboxProjectOverview } from "./schema";

/**
 * Read layer for the UI. Everything here reads only the local projection;
 * nothing writes. Re-indexing is the only way state changes.
 */

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  repoPath: string;
}

export const projectSummaryColumns = `
  p.id, COALESCE(m.name, p.name) AS name,
  CASE WHEN m.description_curated = 1 THEN m.description ELSE p.description END AS description,
  p.repo_path AS repoPath`;

export function listProjects(db: DatabaseSync): ProjectSummary[] {
  return db.prepare(`
    SELECT ${projectSummaryColumns}
    FROM projects p LEFT JOIN project_meta m ON m.id = p.id
    ORDER BY name, p.id`).all() as unknown as ProjectSummary[];
}

export function getProject(db: DatabaseSync, id: string): ProjectSummary | null {
  const row = db.prepare(`
    SELECT ${projectSummaryColumns}
    FROM projects p LEFT JOIN project_meta m ON m.id = p.id
    WHERE p.id = ?`).get(id) as ProjectSummary | undefined;
  return row ?? null;
}

export interface Contributor {
  name: string;
  commits: number;
}

export function projectContributors(db: DatabaseSync, id: string): Contributor[] {
  const p = getProject(db, id);
  if (!p) return [];
  const r = git(p.repoPath, ["shortlog", "-sn", "HEAD"]);
  if (!r.ok) return [];
  return r.out.split("\n").filter(Boolean).map((line) => {
    const t = line.trim();
    const parts = t.split("\t");
    return { commits: Number(parts[0]) || 0, name: parts.slice(1).join("\t").trim() || "unknown" };
  }).filter((c) => c.name && c.name !== "unknown").sort((a, b) => b.commits - a.commits);
}

export function projectOverview(db: DatabaseSync, id: string): WorkboxProjectOverview | null {
  const p = getProject(db, id);
  if (!p) return null;
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM actors WHERE project_id = ?) AS actorCount,
      (SELECT COUNT(*) FROM events WHERE project_id = ?) AS eventCount,
      (SELECT COUNT(*) FROM events WHERE project_id = ? AND verified = 1) AS verifiedCount,
      (SELECT COUNT(*) FROM issues WHERE project_id = ? AND status = 'open') AS openIssues,
      (SELECT COUNT(*) FROM issues WHERE project_id = ?) AS totalIssues,
      (SELECT MAX(timestamp) FROM events WHERE project_id = ?) AS lastEventAt
  `).get(id, id, id, id, id, id) as {
    actorCount: number; eventCount: number; verifiedCount: number;
    openIssues: number; totalIssues: number; lastEventAt: string | null;
  };
  return { id: p.id, name: p.name, description: p.description, repoPath: p.repoPath, ...counts };
}

export interface IssueListItem {
  issueId: string;
  number: number | null;
  title: string;
  status: string;
  creator: string;
  createdAt: string | null;
  updatedAt: string | null;
  conflict: number;
  comments: number;
}

export function listIssues(db: DatabaseSync, projectId: string): IssueListItem[] {
  return db.prepare(`
    SELECT i.issue_id AS issueId, i.number, i.title, i.status, i.creator, i.created_at AS createdAt,
           i.updated_at AS updatedAt, i.conflict,
           (SELECT COUNT(*) FROM issue_comments c WHERE c.project_id = i.project_id AND c.issue_id = i.issue_id) AS comments
    FROM issues i WHERE i.project_id = ?
    ORDER BY COALESCE(i.number, 999999) ASC`).all(projectId) as unknown as IssueListItem[];
}

export interface IssueDetail extends Omit<IssueListItem, "comments"> {
  body: string;
  labels: string[];
  assignees: string[];
}

export function getIssue(
  db: DatabaseSync,
  projectId: string,
  issueId: string,
): IssueDetail | null {
  interface RawIssue {
    issueId: string; number: number | null; title: string; status: string; creator: string;
    createdAt: string | null; updatedAt: string | null; conflict: number;
    body: string; labels_json: string; assignees_json: string;
  }
  const raw = db.prepare(`
    SELECT i.issue_id AS issueId, i.number, i.title, i.status, i.creator, i.created_at AS createdAt,
           i.updated_at AS updatedAt, i.conflict, i.body, i.labels_json, i.assignees_json
    FROM issues i WHERE i.project_id = ? AND i.issue_id = ?`).get(projectId, issueId) as RawIssue | undefined;
  if (!raw) return null;
  let labels: string[] = [];
  let assignees: string[] = [];
  try { labels = JSON.parse(raw.labels_json) as string[]; } catch { /* keep empty */ }
  try { assignees = JSON.parse(raw.assignees_json) as string[]; } catch { /* keep empty */ }
  return {
    issueId: raw.issueId, number: raw.number, title: raw.title, status: raw.status, creator: raw.creator,
    createdAt: raw.createdAt, updatedAt: raw.updatedAt, conflict: raw.conflict,
    body: raw.body, labels, assignees,
  };
}

export interface CommentRow {
  eventId: string;
  actor: string;
  actorName: string;
  body: string;
  timestamp: string | null;
  verified: number;
}

export function issueComments(db: DatabaseSync, projectId: string, issueId: string): CommentRow[] {
  return db.prepare(`
    SELECT c.event_id AS eventId, c.actor, c.body, c.timestamp, c.verified,
           COALESCE(a.display_name, substr(c.actor, 1, 12)) AS actorName
    FROM issue_comments c LEFT JOIN actors a ON a.project_id = c.project_id AND a.fingerprint = c.actor
    WHERE c.project_id = ? AND c.issue_id = ? ORDER BY c.timestamp ASC`).all(projectId, issueId) as unknown as CommentRow[];
}

export interface ChainRow {
  eventId: string;
  event_id?: string;
  kind: string;
  actor: string;
  actorName: string;
  sequence: number | null;
  timestamp: string | null;
  verified: number;
  intent: string | null;
}

/** Signed event chain touching one issue — the provenance trail. */
export function issueChain(db: DatabaseSync, projectId: string, issueId: string): ChainRow[] {
  return db.prepare(`
    SELECT e.event_id AS eventId, e.kind, e.actor, e.sequence, e.timestamp, e.verified, e.intent,
           COALESCE(a.display_name, substr(e.actor, 1, 12)) AS actorName
    FROM events e LEFT JOIN actors a ON a.project_id = e.project_id AND a.fingerprint = e.actor
    WHERE e.project_id = ? AND e.subject = ?
    ORDER BY e.timestamp ASC`).all(projectId, issueId) as unknown as ChainRow[];
}

export function recentActivity(db: DatabaseSync, limit = 20, projectFilter?: string): FeedEntry[] {
  const base = `
    SELECT a.event_id AS eventId, a.project_id AS projectId, p.name AS projectName,
           a.kind, a.actor_name AS actorName, a.summary, a.timestamp
    FROM activity a JOIN projects p ON p.id = a.project_id
    JOIN events e ON e.project_id = a.project_id AND e.event_id = a.event_id AND e.verified = 1`;
  const rows = projectFilter
    ? db.prepare(`${base} WHERE a.project_id = ? ORDER BY a.timestamp DESC LIMIT ?`).all(projectFilter, limit)
    : db.prepare(`${base} ORDER BY a.timestamp DESC LIMIT ?`).all(limit);
  return (rows as unknown as Array<{
    eventId: string; projectId: string; projectName: string;
    kind: string; actorName: string; summary: string; timestamp: string | null;
  }>).map((r) => ({
    ...r,
    verified: true,
  }));
}

export function actorDirectory(db: DatabaseSync): Array<{ fingerprint: string; displayName: string; projects: string; eventCount: number }> {
  return db.prepare(`
    SELECT a.fingerprint,
           COALESCE(NULLIF(a.display_name, ''), substr(a.fingerprint, 1, 12)) AS displayName,
           GROUP_CONCAT(DISTINCT p.name) AS projects,
           SUM(a.event_count) AS eventCount
    FROM actors a JOIN projects p ON p.id = a.project_id
    GROUP BY a.fingerprint ORDER BY eventCount DESC`).all() as unknown as Array<{
    fingerprint: string; displayName: string; projects: string; eventCount: number;
  }>;
}

export function instanceStats(db: DatabaseSync): { projects: number; events: number; verified: number; issues: number; actors: number } {
  const r = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM projects) AS projects,
      (SELECT COUNT(*) FROM events) AS events,
      (SELECT COUNT(*) FROM events WHERE verified = 1) AS verified,
      (SELECT COUNT(*) FROM issues) AS issues,
      (SELECT COUNT(DISTINCT fingerprint) FROM actors) AS actors
  `).get() as { projects: number; events: number; verified: number; issues: number; actors: number };
  return r;
}
