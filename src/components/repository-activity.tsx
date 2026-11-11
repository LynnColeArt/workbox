import Link from "next/link";
import { ActivityChart } from "./activity-chart";
import type { RepositoryActivityRead } from "../lib/workbox/repository-activity";

export function RepositoryActivity({ activity }: { activity: RepositoryActivityRead }) {
  if (activity.kind !== "activity") {
    return (
      <section className="wb-panel space-y-2 p-4 text-sm">
        <p className="wb-muted">{activity.reason}</p>
        <Link className="wb-link" href={activity.href} prefetch={false}>Refresh repository activity</Link>
      </section>
    );
  }

  const { chart, coverage, metrics, scope, selection, records, total, pages } = activity;
  return (
    <section className="min-w-0 space-y-3" aria-label="Repository activity">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="wb-muted text-sm">
          {scope.kind === "repository" ? "Verified events across this repository"
            : scope.branch ? <>Default branch <strong className="font-semibold">{scope.branch}</strong></>
              : scope.commit ? <>Repository history at <code>{scope.commit.slice(0, 8)}</code></>
                : "Default branch history unavailable"}
        </p>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Activity metric">
          {metrics.map((choice) => (
            <Link
              key={choice.metric}
              href={choice.href}
              prefetch={false}
              className="wb-chip aria-[current=true]:border-[var(--wb-link)] aria-[current=true]:font-semibold"
              aria-current={choice.metric === selection.metric ? "true" : undefined}
            >
              {choice.label}
            </Link>
          ))}
        </nav>
      </div>
      {coverage !== "complete" && (
        <p className="wb-muted text-sm">
          {coverage === "unavailable"
            ? "Activity history is unavailable for this metric."
            : "Some history could not be read. Shown counts are lower bounds."}
        </p>
      )}
      <ActivityChart model={chart} />
      {selection.day && (
        <section className="wb-panel space-y-3 p-4" aria-label="Activity records for selected date">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              <time dateTime={selection.day}>{selection.day}</time> UTC
              {total !== null && <span className="wb-muted text-sm"> · {coverage === "partial" ? "At least " : ""}{total} {chart.unit}</span>}
            </h3>
            <Link className="wb-link text-sm" href={activity.clearDayHref} prefetch={false}>Clear date</Link>
          </div>
          {records.length > 0 ? (
            <ol className="divide-y divide-[var(--wb-border)]">
              {records.map((record) => (
                <li id={record.anchor} key={record.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm target:bg-[var(--wb-panel-2)]">
                  <Link className="wb-link min-w-0 break-words" href={record.href} prefetch={false}>{record.label}</Link>
                  <span className="wb-muted">{record.detail}</span>
                  <time className="wb-muted ml-auto text-xs" dateTime={record.timestamp}>{record.timestamp.slice(11, 16)} UTC</time>
                  <code className="wb-muted text-xs" title={record.id}>{record.id.replace(/^sha256:/, "").slice(0, 8)}</code>
                  {record.kind !== "commit" && record.contextHref && (
                    <Link className="wb-link text-xs" href={record.contextHref} prefetch={false}>Open related record</Link>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="wb-muted text-sm">{total === 0 ? "No activity on this day." : "Activity for this day is unknown."}</p>
          )}
          {activity.totalPages > 1 && (
            <nav className="flex flex-wrap gap-2" aria-label="Activity records pages">
              {pages.map(({ page, href }) => (
                <Link className="wb-btn aria-[current=page]:border-[var(--wb-link)]" key={page} href={href}
                  prefetch={false} aria-label={`Page ${page}`} aria-current={page === selection.activityPage ? "page" : undefined}
                >
                  {page}
                </Link>
              ))}
            </nav>
          )}
        </section>
      )}
    </section>
  );
}
