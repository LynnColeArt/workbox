import { connection } from "next/server";
import Link from "next/link";
import NewProjectDialog from "@/components/new-project-dialog";
import type { ActivityCoverage } from "@/lib/workbox/activity";
import { readDashboard } from "@/lib/workbox/dashboard";
import { openDb } from "@/lib/workbox/db";

export const instant = false;

function countLabel(count: number | null, coverage: ActivityCoverage, source: string) {
  if (count === null) return `${source} unknown`;
  return `${coverage === "complete" ? "" : "At least "}${count} ${source}`;
}

function formatUtc(timestamp: string) {
  return timestamp.slice(0, 16).replace("T", " ");
}

export default async function Dashboard() {
  await connection();
  using db = openDb();
  const { projects, summary, feed, window, visual, coverage, state, exploreHref } = readDashboard(db);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <Link href={exploreHref} className="wb-link text-sm">Explore all projects →</Link>
          <div className="sm:ml-auto"><NewProjectDialog /></div>
        </div>
        <p className="wb-muted text-sm">
          {summary.projects} projects · {summary.events} events ({summary.verified} verified) · {summary.issues} issues · {summary.actors} identities
        </p>
      </header>

      <section aria-labelledby="recently-active" className="space-y-2">
        <h2 id="recently-active" className="wb-muted text-sm font-semibold uppercase tracking-wide">
          Recently active · past 7 days
        </h2>
        <p className="wb-muted text-xs">
          <time dateTime={window.start}>{formatUtc(window.start)}</time>
          {" – "}
          <time dateTime={window.end}>{formatUtc(window.end)}</time> {window.timezone}
        </p>
        {coverage.state !== "complete" && (
          <p className="wb-muted text-sm">Activity history is incomplete. Some counts may be lower than the actual totals.</p>
        )}
        {state === "quiet" && <p className="wb-muted text-sm">No project activity in this window.</p>}
        {projects.length === 0 ? (
          <p className="wb-panel wb-muted p-4 text-sm">
            {state === "incomplete" ? "No project activity could be verified." : "No qualifying activity yet."}
          </p>
        ) : (
          <ul aria-label="Recently active projects" className="wb-panel divide-y divide-[var(--wb-border)]">
            {projects.map((project) => (
              <li key={project.id} className="grid items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_7.5rem_minmax(11rem,auto)_auto]">
                <Link href={project.href} className="wb-link text-sm font-medium wrap-anywhere">{project.name}</Link>
                <div aria-hidden="true" className="order-last flex h-2 w-30 max-w-full overflow-hidden rounded-full bg-[var(--wb-panel-2)] sm:order-0">
                  {visual.maxCount > 0 && ([
                    [project.gitCount, visual.sources.git.color],
                    [project.hubnotCount, visual.sources.hubnot.color],
                  ] as const).map(([count, backgroundColor]) => (
                    <span key={backgroundColor} style={{ width: `${100 * (count ?? 0) / visual.maxCount}%`, backgroundColor }} />
                  ))}
                </div>
                <div className="wb-muted flex flex-wrap gap-x-2 text-xs">
                  <span>{countLabel(project.gitCount, project.coverage.git, visual.sources.git.label)}</span>
                  <span>{countLabel(project.hubnotCount, project.coverage.hubnot, visual.sources.hubnot.label)}</span>
                </div>
                <time dateTime={project.latestAt} title={project.latestAt} className="wb-muted wb-mono text-xs">
                  {project.latestAt.slice(0, 10)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dashboard-feed" className="space-y-2">
        <h2 id="dashboard-feed" className="wb-muted text-sm font-semibold uppercase tracking-wide">What&apos;s happening</h2>
        {feed.length === 0 ? (
          <p className="wb-panel wb-muted p-4 text-sm">No activity recorded yet.</p>
        ) : (
          <ul className="wb-panel divide-y divide-[var(--wb-border)]" aria-label="Activity feed">
            {feed.map((event) => (
              <li key={event.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
                <span className="wb-chip wb-mono wrap-anywhere">{event.kind}</span>
                <p className="min-w-0 text-sm wrap-anywhere">
                  <span className="font-medium">{event.actorName}</span>{" "}
                  <span className="wb-muted">{event.summary} in</span>{" "}
                  <Link href={event.href} className="wb-link">{event.projectName}</Link>
                </p>
                {event.timestamp && (
                  <time dateTime={event.timestamp} className="wb-muted text-xs whitespace-nowrap sm:ml-auto">
                    {formatUtc(event.timestamp)} UTC
                  </time>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
