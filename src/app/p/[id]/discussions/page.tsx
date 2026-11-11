import { connection } from "next/server";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";

export const instant = false;

export default async function DiscussionsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const rows = db.prepare(`
    SELECT e.event_id, e.kind, e.timestamp, e.actor, e.verified, e.payload_json
    FROM events e WHERE e.project_id = ? AND e.kind LIKE 'discussion%'
    ORDER BY e.timestamp DESC LIMIT 50`).all(id) as unknown as Array<{
    event_id: string; kind: string; timestamp: string; actor: string; verified: number; payload_json: string;
  }>;
  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      {rows.length === 0 && (
        <div className="wb-panel p-4">
          <p className="wb-muted text-sm">No discussions indexed.</p>
          <p className="wb-muted text-xs mt-1">Discussions and replies are the same signed-event pattern — they will appear here as soon as one exists.</p>
        </div>
      )}
      <div className="space-y-3">
        {rows.map((e) => (
          <div key={e.event_id} className="wb-panel p-4" title={e.event_id}>
            <div className="flex items-center gap-3 text-sm">
              <span className="wb-chip">{e.kind}</span>
              <span className="wb-muted text-xs wb-mono">{e.actor.slice(7, 19)}</span>
              <span className="wb-muted text-xs ml-auto">{e.timestamp?.slice(0, 16).replace("T", " ")}</span>
              <span style={{ color: e.verified === 1 ? "var(--wb-open)" : "var(--wb-warn)" }}>{e.verified === 1 ? "✓" : "⚠"}</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
