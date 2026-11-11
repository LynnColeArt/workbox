import { connection } from "next/server";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { listPipelines, readPolicy } from "@/lib/workbox/ci";
import { CreateForm } from "@/components/create-form";

export const instant = false;

export default async function CIPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const p = getProject(db, id);
  if (!p) return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;

  const pipelines = listPipelines(p.repoPath);
  const policy = readPolicy(p.repoPath);
  const runEvents = db.prepare(`
    SELECT e.event_id, e.kind, e.timestamp, e.actor, e.payload_json, e.verified,
           COALESCE(a.display_name, substr(e.actor, 1, 12)) AS actorName
    FROM events e LEFT JOIN actors a ON a.project_id = e.project_id AND a.fingerprint = e.actor
    WHERE e.project_id = ? AND (e.kind LIKE 'run.%' OR e.kind LIKE 'workflow%')
    ORDER BY e.timestamp DESC LIMIT 20`).all(id) as unknown as Array<{
    event_id: string; kind: string; timestamp: string; actorName: string; payload_json: string; verified: number;
  }>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <CreateForm
        label="New pipeline"
        endpoint={`/api/projects/${id}/pipelines`}
        cta="Commit pipeline"
        fields={[
          { key: "name", placeholder: "Pipeline name (lowercase, e.g. integration-tests)", required: true },
          { key: "stepName", placeholder: "First step name (e.g. build)" },
          { key: "command", placeholder: "Command (e.g. npm test)", required: true },
          { key: "args", placeholder: "Args (space-separated)" },
        ]}
      />
      <section className="mb-8">
        <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Pipelines</h2>
        {pipelines.length === 0 && <p className="wb-muted text-sm">No .hn/pipelines/ definitions in the worktree.</p>}
        <div className="space-y-3">
          {pipelines.map((pl) => (
            <div key={pl.name} className="wb-panel p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-medium">{pl.name}</span>
                {pl.backend && <span className="wb-chip">backend: {pl.backend}</span>}
                <span className="wb-chip">{pl.steps.length} step(s)</span>
              </div>
              <ol className="wb-mono text-xs wb-muted space-y-1">
                {pl.steps.map((s, i) => (
                  <li key={i}>
                    {i + 1}. {s.command} {(s.args ?? []).join(" ")}
                    {s.workingDirectory ? ` (in ${s.workingDirectory})` : ""}
                  </li>
                ))}
              </ol>
              {pl.error && <p className="text-xs" style={{ color: "var(--wb-warn)" }}>{pl.error}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Run events (signed)</h2>
        {runEvents.length === 0 ? (
          <p className="wb-muted text-sm">No run requests/executions yet. A runner with policy trust executes pipeline runs — nothing happens implicitly.</p>
        ) : (
          <div className="wb-panel divide-y wb-mono text-xs" style={{ borderColor: "var(--wb-border)" }}>
            {runEvents.map((e) => (
              <div key={e.event_id} className="px-4 py-2 flex gap-3 items-center" title={e.event_id}>
                <span className="wb-chip">{e.kind}</span>
                <span>{e.actorName}</span>
                <span className="wb-muted">{e.timestamp?.slice(0, 16).replace("T", " ")}</span>
                <span className="ml-auto" style={{ color: e.verified === 1 ? "var(--wb-open)" : "var(--wb-warn)" }}>
                  {e.verified === 1 ? "✓" : "⚠"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Runner trust (policy)</h2>
        {!policy || !policy.exists ? (
          <p className="wb-muted text-sm">No .hn/policy.json — proposals and trusted runs are not configured for this repo.</p>
        ) : (
          <div className="wb-panel p-4">
            <div className="text-xs wb-muted mb-2 wb-mono">{policy.version}</div>
            {Object.entries(policy.pipelines).map(([name,pipe]) => {
              const p2 = pipe as { requiredResults?: number; trustedRunners?: string[]; requesters?: string[] };
              return (
                <div key={name} className="text-sm mb-2">
                  <span className="wb-mono">{name}</span>{" "}
                  <span className="wb-muted">requires {p2.requiredResults ?? "?"} result(s) from trusted runners</span>
                  <div className="wb-mono text-xs wb-muted mt-1">
                    {(p2.trustedRunners ?? []).map((r) => <span key={r} className="wb-chip mr-1">{r.slice(7, 19)}</span>)}
                  </div>
                </div>
              );
            })}
            <details className="mt-2">
              <summary className="wb-muted text-xs cursor-pointer">policy.json</summary>
              <pre className="wb-mono text-xs mt-2 overflow-x-auto">{policy.raw}</pre>
            </details>
          </div>
        )}
      </section>
    </main>
  );
}
