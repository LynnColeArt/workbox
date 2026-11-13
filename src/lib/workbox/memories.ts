import type { DatabaseSync } from "node:sqlite";
import { workboxPageSize } from "./list-settings";

type MemoryRow = {
  memory_id: string; actor: string; stream: string; sequence: number | null; timestamp: string;
  kind: string; content: string; anchor_commit: string | null; applicability: string;
  handoff_json: string | null; verified: number; actorName: string;
};

export function readMemories(db: DatabaseSync, project: string | null, requestedPage: number) {
  const pageSize = workboxPageSize();
  const filter = "m.verified = 1 AND (@project IS NULL OR m.project_id = @project)";
  const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM memories m WHERE ${filter}`).get({ project })?.n);
  const totalPages = Math.ceil(total / pageSize);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, Math.max(1, totalPages)) : 1;
  const items = db.prepare(`
    SELECT m.memory_id, m.actor, m.stream, m.sequence, m.timestamp, m.kind, m.content,
           m.anchor_commit, m.applicability, m.handoff_json, m.verified,
           COALESCE(a.display_name, substr(m.actor, 1, 12)) AS actorName
    FROM memories m LEFT JOIN actors a ON a.project_id = m.project_id AND a.fingerprint = m.actor
    WHERE ${filter} ORDER BY m.timestamp DESC, m.memory_id, m.project_id
    LIMIT @limit OFFSET @offset`).all({ project, limit: pageSize, offset: (page - 1) * pageSize }) as unknown as MemoryRow[];
  return { items, page, pageSize, total, totalPages };
}
