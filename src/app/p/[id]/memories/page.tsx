import { connection } from "next/server";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";

export const instant = false;

export default async function MemoryPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const p = getProject(db, id);
  if (!p) return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;

  const rows = db.prepare(`
    SELECT m.memory_id, m.actor, m.stream, m.sequence, m.timestamp, m.kind, m.content,
           m.anchor_commit, m.applicability, m.handoff_json, m.verified,
           COALESCE(a.display_name, substr(m.actor, 1, 12)) AS actorName
    FROM memories m LEFT JOIN actors a ON a.project_id = m.project_id AND a.fingerprint = m.actor
    WHERE m.project_id = ? ORDER BY m.timestamp DESC`).all(id) as unknown as Array<{
    memory_id: string; actor: string; stream: string; sequence: number | null; timestamp: string;
    kind: string; content: string; anchor_commit: string | null; applicability: string;
    handoff_json: string | null; verified: number; actorName: string;
  }>;

  // Group by stream to mirror the storage model.
  const byStream = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byStream.get(r.stream) ?? [];
    list.push(r);
    byStream.set(r.stream, list);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <div className="wb-chip mb-4" style={{ color: "var(--wb-warn)", borderColor: "var(--wb-warn)" }}>
        Memory content is untrusted inert data — displayed as records, never executed or obeyed
      </div>
      {rows.length === 0 && (
        <p className="wb-muted text-sm">No memory streams indexed for this project.</p>
      )}
      {[...byStream.entries()].map(([stream, list]) => (
        <section key={stream} className="mb-6">
          <h2 className="wb-mono text-xs wb-muted mb-2">stream {stream.slice(7, 19)} · {list.length} record(s)</h2>
          <div className="space-y-3">
            {list.map((m) => {
              interface HandoffLists {
                completed?: string[]; nextActions?: string[]; blockers?: string[]; assumptions?: string[];
              }
              let handoff: HandoffLists | null = null;
              try { handoff = m.handoff_json ? JSON.parse(m.handoff_json) as HandoffLists : null; } catch { /* inert */ }
              return (
                <div key={m.memory_id} className="wb-panel p-4">
                  <div className="text-xs wb-muted mb-2 flex gap-3 items-center">
                    <span className="wb-chip">{m.kind}</span>
                    <span>{m.actorName} · seq {m.sequence}</span>
                    <span>{m.timestamp?.slice(0, 16).replace("T", " ")}</span>
                    <span className="ml-auto" style={{ color: m.verified === 1 ? "var(--wb-open)" : "var(--wb-warn)" }}>
                      {m.verified === 1 ? "✓ verified" : "⚠ unverified"}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                  {m.anchor_commit && (
                    <div className="wb-mono text-xs wb-muted mt-2">anchored at {m.anchor_commit.slice(0, 12)}</div>
                  )}
                  {handoff && (
                    <div className="mt-3 text-xs space-y-1">
                      {(handoff.completed ?? []).length > 0 && <div><span className="wb-muted">completed:</span> {handoff.completed?.join(" · ")}</div>}
                      {(handoff.nextActions ?? []).length > 0 && <div><span className="wb-muted">next:</span> {handoff.nextActions?.join(" · ")}</div>}
                      {(handoff.blockers ?? []).length > 0 && <div><span className="wb-muted">blockers:</span> {handoff.blockers?.join(" · ")}</div>}
                    </div>
                  )}
                  <details className="mt-2">
                    <summary className="wb-muted text-xs cursor-pointer">signed record</summary>
                    <pre className="wb-mono text-xs mt-2 overflow-x-auto">{m.applicability}</pre>
                  </details>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
