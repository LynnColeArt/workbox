import { connection } from "next/server";
import Link from "next/link";
import { getProject, projectContributors, projectOverview } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { readCode, type CodeQuery } from "@/lib/workbox/code-browser";
import { readRepositoryActivity, type RepositoryActivityQuery } from "@/lib/workbox/repository-activity";
import { CodeBrowser } from "@/components/code-browser";
import { RepositoryActivity } from "@/components/repository-activity";
import { listPipelines, readPolicy } from "@/lib/workbox/ci";
import DescriptionEditor from "@/components/description-editor";

export const instant = false;

export default async function CodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<CodeQuery & RepositoryActivityQuery>;
}) {
  await connection();
  const { id } = await params;
  const query = await searchParams;
  using db = openDb();
  const p = getProject(db, id);
  if (!p) return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;

  const repoPath = p.repoPath;
  const code = readCode(db, id, query);
  const now = new Date();
  const isOverview = (query.path === undefined || query.path === "") && query.commit === undefined;
  const activityQuery = code.kind === "unavailable" ? query : { ...query, rev: code.branch ?? undefined, at: code.at };
  const activity = isOverview ? readRepositoryActivity(db, id, activityQuery, now) : null;
  const contributors = projectContributors(db, id);
  const pipelines = listPipelines(repoPath);
  const policy = readPolicy(repoPath);
  const overview = projectOverview(db, id);

  const formatCount = new Intl.NumberFormat("en-US");

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-4">
          {activity && <RepositoryActivity activity={activity} />}
          <CodeBrowser result={code} now={now.getTime()} />
        </section>

        <aside className="space-y-4">
          <div className="wb-panel p-4">
            <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">About</h2>
            <DescriptionEditor projectId={id} initial={p.description} />
            {overview && (
              <div className="text-sm wb-muted space-y-1 tabular-nums">
                <div><strong className="font-semibold text-[var(--wb-text)]">{formatCount.format(overview.eventCount)}</strong> events · <strong className="font-semibold text-[var(--wb-text)]">{formatCount.format(overview.verifiedCount)}</strong> verified</div>
                <div><strong className="font-semibold text-[var(--wb-text)]">{formatCount.format(overview.openIssues)}</strong> open · <strong className="font-semibold text-[var(--wb-text)]">{formatCount.format(overview.totalIssues)}</strong> issues total</div>
              </div>
            )}
          </div>

          <div className="wb-panel p-4">
            <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Contributors</h2>
            <div className="space-y-1.5">
              {contributors.slice(0, 8).map((c) => (
                <div key={c.name} className="flex items-center gap-3 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="wb-muted text-xs ml-auto">{formatCount.format(c.commits)} commit{c.commits === 1 ? "" : "s"}</span>
                </div>
              ))}
              {contributors.length === 0 && <p className="wb-muted text-xs">No commits yet.</p>}
            </div>
          </div>

          <div className="wb-panel p-4">
            <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Governance</h2>
            {policy ? (
              <div className="wb-mono text-xs wb-muted">
                <div>{policy.version}</div>
                <div>{formatCount.format(policy.maintainers.length)} maintainer{policy.maintainers.length === 1 ? "" : "s"}</div>
                <div>{formatCount.format(Object.keys(policy.pipelines).length)} governed pipeline{Object.keys(policy.pipelines).length === 1 ? "" : "s"}</div>
              </div>
            ) : (
              <p className="wb-muted text-xs">No .hn/policy.json — trust thresholds undefined.</p>
            )}
            <div className="wb-mono text-xs wb-muted mt-2">{formatCount.format(pipelines.length)} pipeline definition{pipelines.length === 1 ? "" : "s"}</div>
          </div>

          <div className="wb-panel p-4">
            <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Hubnot chains</h2>
            <div className="wb-mono text-xs wb-muted">
              <div><Link className="wb-link" href={`/p/${id}/issues`}>issues</Link> · <Link className="wb-link" href={`/p/${id}/proposals`}>proposals</Link></div>
              <div><Link className="wb-link" href={`/p/${id}/memories`}>memory</Link> · <Link className="wb-link" href={`/p/${id}/ci`}>CI</Link></div>
              <div><Link className="wb-link" href={`/p/${id}/insights`}>insights</Link></div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
