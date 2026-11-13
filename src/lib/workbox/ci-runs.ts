import type { DatabaseSync } from "node:sqlite";
import { workboxPageSize } from "./list-settings";

export function readCIRuns(db: DatabaseSync, project: string, requestedPage: number) {
  const pageSize = workboxPageSize();
  const where = "e.project_id = ? AND e.verified = 1 AND (e.kind LIKE 'run.%' OR e.kind LIKE 'workflow%')";
  const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM events e WHERE ${where}`).get(project)?.n);
  const totalPages = Math.ceil(total / pageSize);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, Math.max(1, totalPages)) : 1;
  const items = db.prepare(`
    SELECT e.event_id, e.kind, e.timestamp, e.verified,
           COALESCE(a.display_name, substr(e.actor, 1, 12)) AS actorName
    FROM events e LEFT JOIN actors a ON a.project_id = e.project_id AND a.fingerprint = e.actor
    WHERE ${where}
    ORDER BY e.timestamp DESC, e.event_id LIMIT ? OFFSET ?`).all(project, pageSize, (page - 1) * pageSize) as unknown as Array<{
    event_id: string; kind: string; timestamp: string; actorName: string; verified: number;
  }>;
  return { items, page, pageSize, total, totalPages };
}
