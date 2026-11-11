import { openDb } from "@/lib/workbox/db";
import { connection } from "next/server";
import { getProject, listIssues, projectOverview } from "@/lib/workbox/queries";


export const instant = false;

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const overview = projectOverview(db, id);
  if (!overview) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p className="wb-muted">Project “{id}” is not indexed. Run Sync from the dashboard.</p>
      </main>
    );
  }
  const issues = listIssues(db, id);
  const open = issues.filter((i) => i.status === "open");
  const closed = issues.filter((i) => i.status !== "open");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">{overview.name}</h1>
        <p className="wb-muted text-sm">{overview.description}</p>
      </div>

      <div className="wb-panel px-4 py-3 mb-6 flex flex-wrap gap-x-6 gap-y-1 text-xs wb-muted wb-mono">
        <span>{overview.actorCount} identities</span>
        <span>{overview.eventCount} events · <span style={{ color: "var(--wb-open)" }}>{overview.verifiedCount} verified</span></span>
        <span>{open.length} open · {closed.length} closed</span>
        <span className="truncate" title={overview.repoPath}>{overview.repoPath}</span>
      </div>

      <section>
        <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Issues</h2>
        <div className="wb-panel divide-y" style={{ borderColor: "var(--wb-border)" }}>
          {issues.length === 0 && <p className="p-4 wb-muted text-sm">No issues indexed for this project.</p>}
          {issues.map((i) => (
            <div key={i.issueId} className="flex items-start gap-3 px-4 py-2.5">
              <span className="mt-1" title={i.status} style={{ color: i.status === "open" ? "var(--wb-open)" : "var(--wb-closed)" }}>
                {i.status === "open" ? "●" : "✔"}
              </span>
              <div className="min-w-0">
                <a className="wb-link text-sm" href={`/p/${id}/issue/${i.issueId}`}>{i.title}</a>
                {i.conflict === 1 && (
                  <span className="wb-chip ml-2" style={{ color: "var(--wb-warn)", borderColor: "var(--wb-warn)" }}>conflict</span>
                )}
                <div className="wb-muted text-xs">
                  #{i.issueId.slice(7, 19)} · opened {i.createdAt?.slice(0, 10)} · {i.comments} comment{i.comments === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
