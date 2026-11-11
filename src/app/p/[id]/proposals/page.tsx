import { connection } from "next/server";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";

export const instant = false;

export default async function ProposalsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const p = getProject(db, id);
  if (!p) return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;

  const proposals = db.prepare(`
    SELECT e.event_id, e.kind, e.timestamp, e.actor, e.payload_json, e.verified,
           COALESCE(a.display_name, substr(e.actor, 1, 12)) AS actorName
    FROM events e LEFT JOIN actors a ON a.project_id = e.project_id AND a.fingerprint = e.actor
    WHERE e.project_id = ? AND e.kind LIKE 'proposal.%'
    ORDER BY e.timestamp DESC LIMIT 50`).all(id) as unknown as Array<{
    event_id: string; kind: string; timestamp: string; actorName: string; payload_json: string; verified: number;
  }>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      {proposals.length === 0 && (
        <div className="wb-panel p-4">
          <p className="wb-muted text-sm">No proposals indexed.</p>
          <p className="wb-muted text-xs mt-1">
            Proposals are signed candidates evaluated against .hn/policy.json — trust thresholds decide, not buttons.
          </p>
        </div>
      )}
      <div className="space-y-3">
        {proposals.map((e) => {
          let subject = "";
          let title = "";
          try {
            const pj = JSON.parse(e.payload_json) as Record<string, unknown>;
            subject = typeof pj.subject === "string" ? pj.subject.slice(7, 19) : "";
            title = typeof pj.title === "string" ? pj.title : "";
          } catch { /* rendering only */ }
          return (
            <div key={e.event_id} className="wb-panel p-4" title={e.event_id}>
              <div className="flex items-center gap-3">
                <span className="wb-chip">{e.kind}</span>
                <span className="text-sm">{title}</span>
                <span className="wb-mono text-xs wb-muted">{subject}</span>
                <span className="wb-muted text-xs ml-auto">{e.actorName} · {e.timestamp?.slice(0, 16).replace("T", " ")}</span>
                <span style={{ color: e.verified === 1 ? "var(--wb-open)" : "var(--wb-warn)" }}>{e.verified === 1 ? "✓" : "⚠"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
