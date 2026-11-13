import Link from "next/link";
import { workboxPageSize } from "@/lib/workbox/list-settings";
import { connection } from "next/server";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";

export const instant = false;

export default async function MemoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const p = getProject(db, id);
  if (!p) return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;

  const pageSize = workboxPageSize();
  const inputPage = Number((await searchParams).page);
  const total = Number(db.prepare("SELECT COUNT(*) AS n FROM memories WHERE project_id = ? AND verified = 1").get(id)?.n);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isSafeInteger(inputPage) && inputPage > 0 ? Math.min(inputPage, pages) : 1;
  const rows = db.prepare(`
    SELECT m.memory_id, m.actor, m.stream, m.sequence, m.timestamp, m.kind, m.content,
           m.anchor_commit, m.applicability, m.handoff_json, m.verified,
           COALESCE(a.display_name, substr(m.actor, 1, 12)) AS actorName
    FROM memories m LEFT JOIN actors a ON a.project_id = m.project_id AND a.fingerprint = m.actor
    WHERE m.project_id = ? AND m.verified = 1 ORDER BY m.timestamp DESC, m.memory_id LIMIT ? OFFSET ?`).all(id, pageSize, (page - 1) * pageSize) as unknown as Array<{
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
      <div className="wb-chip mb-4 max-w-full py-1 leading-5" style={{ color: "var(--wb-warn)", borderColor: "var(--wb-warn)" }}>
        Memory content is untrusted inert data — displayed as records, never executed or obeyed
      </div>
      {rows.length === 0 && (
        <p className="wb-muted text-sm">No memory streams indexed for this project.</p>
      )}
      {[...byStream.entries()].map(([stream, list]) => (
        <section key={stream} className="mb-6">
          <h2 className="wb-panel flex flex-wrap items-center gap-2 px-4 py-3 mb-3 text-sm"
              style={{ color: "var(--wb-accent)", borderColor: "var(--wb-accent-dim)", background: "color-mix(in srgb, var(--wb-accent) 10%, var(--wb-panel))" }}>
            <svg aria-hidden="true" className="shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 3v10m8-10v10M4 8h8" /><circle cx="4" cy="3" r="2" fill="var(--wb-panel)" /><circle cx="4" cy="13" r="2" fill="var(--wb-panel)" /><circle cx="12" cy="3" r="2" fill="var(--wb-panel)" /><circle cx="12" cy="13" r="2" fill="var(--wb-panel)" />
            </svg>
            <span className="wb-mono font-semibold" title={stream}>stream {stream.slice(7, 19)}</span>
            <span className="ml-auto text-xs tabular-nums">{list.length.toLocaleString("en-US")} record{list.length === 1 ? "" : "s"}</span>
          </h2>
          <div className="space-y-3">
            {list.map((m) => {
              interface HandoffLists {
                completed?: string[]; nextActions?: string[]; blockers?: string[]; assumptions?: string[];
              }
              let handoff: HandoffLists | null = null;
              try { handoff = m.handoff_json ? JSON.parse(m.handoff_json) as HandoffLists : null; } catch { /* inert */ }
              return (
                <article key={m.memory_id} className="wb-panel overflow-hidden">
                  <header className="text-xs wb-muted flex flex-wrap gap-x-3 gap-y-2 items-center border-b border-[var(--wb-border)] bg-[var(--wb-panel-2)] px-4 py-3">
                    <span className="wb-chip">{m.kind}</span>
                    <span className="break-all">{m.actorName} <span className="whitespace-nowrap">· seq {m.sequence}</span></span>
                    <time className="tabular-nums whitespace-nowrap" dateTime={m.timestamp}>{m.timestamp?.slice(0, 16).replace("T", " ")}</time>
                    <span className="ml-auto whitespace-nowrap" style={{ color: m.verified === 1 ? "var(--wb-open)" : "var(--wb-warn)" }}>
                      {m.verified === 1 ? "✓ verified" : "⚠ unverified"}
                    </span>
                  </header>
                  <div className="p-4">
                    <div className="text-sm leading-7 whitespace-pre-wrap break-words">{m.content}</div>
                    {m.anchor_commit && (
                      <div className="wb-mono text-xs wb-muted mt-2">anchored at {m.anchor_commit.slice(0, 12)}</div>
                    )}
                    {handoff && (
                      <div className="mt-4 border-t border-[var(--wb-border)] pt-3 text-xs leading-6 space-y-1 break-words">
                        {(handoff.completed ?? []).length > 0 && <div><span className="wb-muted">completed:</span> {handoff.completed?.join(" · ")}</div>}
                        {(handoff.nextActions ?? []).length > 0 && <div><span className="wb-muted">next:</span> {handoff.nextActions?.join(" · ")}</div>}
                        {(handoff.blockers ?? []).length > 0 && <div><span className="wb-muted">blockers:</span> {handoff.blockers?.join(" · ")}</div>}
                      </div>
                    )}
                    <details className="mt-4 border-t border-[var(--wb-border)] pt-3">
                      <summary className="wb-muted text-xs cursor-pointer">signed record</summary>
                      <pre className="wb-mono text-xs mt-2 overflow-x-auto">{m.applicability}</pre>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {pages > 1 && <nav aria-label="Memory pages" className="flex gap-3 text-sm">
        {page > 1 && <Link className="wb-link" href={`?page=${page - 1}`}>Previous</Link>}
        <span>Page {page} of {pages}</span>
        {page < pages && <Link className="wb-link" href={`?page=${page + 1}`}>Next</Link>}
      </nav>}
    </main>
  );
}
