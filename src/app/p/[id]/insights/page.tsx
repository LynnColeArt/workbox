import { connection } from "next/server";
import { getProject, actorDirectory } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { readPolicy } from "@/lib/workbox/ci";

export const instant = false;

export default async function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const p = getProject(db, id);
  if (!p) return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;

  const policy = readPolicy(p.repoPath);
  const actors = db.prepare(`
    SELECT a.fingerprint, a.display_name, a.chain_head, a.event_count, a.public_key
    FROM actors a WHERE a.project_id = ? ORDER BY a.event_count DESC`).all(id) as unknown as Array<{
    fingerprint: string; display_name: string; chain_head: string; event_count: number; public_key: string;
  }>;
  const kindCounts = db.prepare(`
    SELECT kind, COUNT(*) AS n FROM events WHERE project_id = ? GROUP BY kind ORDER BY n DESC`).all(id) as unknown as Array<{ kind: string; n: number }>;
  const mem = actorDirectory(db); // instance-wide directory

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <section className="mb-8">
        <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Identities in this project</h2>
        <div className="wb-panel divide-y" style={{ borderColor: "var(--wb-border)" }}>
          {actors.map((a) => (
            <div key={a.fingerprint} className="px-4 py-3 flex items-center gap-3">
              <span className="font-medium text-sm">{a.display_name}</span>
              <span className="wb-mono text-xs wb-muted">{a.fingerprint.slice(7, 23)}…</span>
              <span className="wb-chip ml-auto">{a.event_count} event(s)</span>
            </div>
          ))}
          {actors.length === 0 && <p className="p-4 wb-muted text-sm">No actors indexed.</p>}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Policy</h2>
        {!policy || !policy.exists ? (
          <p className="wb-muted text-sm">No .hn/policy.json in this repo — trust thresholds are undefined (proposals and trusted CI refuse to run).</p>
        ) : (
          <div className="wb-panel p-4 wb-mono text-xs">
            <div className="mb-2">maintainers: {policy.maintainers.map((m) => m.slice(7, 19)).join(", ") || "—"}</div>
            <details>
              <summary className="wb-muted cursor-pointer">policy.json</summary>
              <pre className="mt-2 overflow-x-auto">{policy.raw}</pre>
            </details>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Event mix</h2>
        <div className="wb-panel p-4">
          {kindCounts.map((k) => (
            <div key={k.kind} className="flex items-center gap-3 text-sm mb-1">
              <span className="wb-mono text-xs w-40 truncate" title={k.kind}>{k.kind}</span>
              <div className="h-2 rounded-full" style={{ background: "var(--wb-accent)", width: `${Math.min(40 * k.n, 240)}px` }} />
              <span className="wb-muted text-xs">{k.n}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Cross-instance identities</h2>
        <div className="wb-panel p-4 text-sm wb-muted">
          {mem.length} distinct actor(s) across {new Set(mem.flatMap((m) => m.projects.split(","))).size} project(s) instance-wide.
        </div>
      </section>
    </main>
  );
}
