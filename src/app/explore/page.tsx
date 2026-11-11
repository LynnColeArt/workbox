import Link from "next/link";
import { connection } from "next/server";
import { ActivityChart } from "@/components/activity-chart";
import { openDb } from "@/lib/workbox/db";
import { exploreHref, readExplore, type ExploreQuery } from "@/lib/workbox/explore";

export const instant = false;

const sourceLabels = { git: "Git", hubnot: "Hubnot" } as const;

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<ExploreQuery>;
}) {
  await connection();
  const query = await searchParams;
  using db = openDb();
  const result = readExplore(db, query);
  const { selection, snapshot, coverage, chart, stale } = result;
  const partial = coverage.git.partial + coverage.git.unavailable + coverage.hubnot.partial + coverage.hubnot.unavailable > 0;

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <h1 className="text-xl font-semibold">Explore</h1>
      <form action="/explore" method="get" role="search" className="flex flex-wrap items-end gap-2">
        {selection.sort === "alpha" && <input type="hidden" name="sort" value="alpha" />}
        {selection.day && <input type="hidden" name="day" value={selection.day} />}
        <label className="min-w-40 flex-1 text-sm">
          <span className="mb-1 block">Search projects</span>
          <input
            name="q"
            defaultValue={selection.q}
            className="w-full rounded border border-[var(--wb-border)] bg-transparent px-3 py-2"
            placeholder="Name or slug"
          />
        </label>
        <button type="submit" className="wb-btn">Search</button>
      </form>

      <ActivityChart model={chart} />
      {partial && (
        <p className="wb-muted text-sm">
          Some Git or Hubnot history is incomplete. Activity counts reflect the records available.
        </p>
      )}

      <section aria-label="Project catalog" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {selection.day && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{selection.day} UTC</span>
              <Link
                className="wb-link"
                href={exploreHref({ ...selection, page: 1, day: null }, snapshot)}
                prefetch={false}
              >
                Clear day
              </Link>
            </div>
          )}
          <nav aria-label="Sort projects" className="ml-auto flex gap-2 text-sm">
            {([
              ["recent", "Recent activity"],
              ["alpha", "A–Z"],
            ] as const).map(([sort, label]) => (
              <Link
                key={sort}
                className="wb-chip aria-[current=true]:border-[var(--wb-accent)] aria-[current=true]:text-[var(--wb-text)]"
                aria-current={selection.sort === sort ? "true" : undefined}
                href={exploreHref({ ...selection, sort, page: 1 }, snapshot)}
                prefetch={false}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {stale ? (
          <div className="wb-panel space-y-2 p-4">
            <p>The activity snapshot has changed.</p>
            <Link href={result.refreshHref} className="wb-link text-sm" prefetch={false}>
              Refresh project results
            </Link>
          </div>
        ) : (
          <>
            <p className="wb-muted text-sm" data-explore-total={result.total}>
              {result.total} {selection.day ? "observed active " : ""}project{result.total === 1 ? "" : "s"}
            </p>
            {result.total === 0 ? (
              <div className="wb-panel space-y-2 p-4 text-sm">
                <p>
                  {selection.day
                    ? "No matching projects have observed activity on this date."
                    : selection.q ? "No projects match your search." : "No indexed projects are available."}
                </p>
                {selection.q && (
                  <Link className="wb-link" href={exploreHref({ ...selection, q: "", page: 1 })} prefetch={false}>
                    Clear search
                  </Link>
                )}
              </div>
            ) : (
              <ul aria-label="Explore projects" className="wb-panel divide-y divide-[var(--wb-border)]">
                {result.projects.map((project) => (
                  <li key={project.id} className="space-y-1 px-4 py-3 text-sm wrap-anywhere">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link className="wb-link font-medium" href={project.href} prefetch={false}>{project.name}</Link>
                      {project.sources.length > 0 && (
                        <ul aria-label="Activity sources" className="flex flex-wrap gap-1">
                          {project.sources.map((source) => <li key={source} className="wb-chip">{sourceLabels[source]}</li>)}
                        </ul>
                      )}
                    </div>
                    {project.description && <p className="wb-muted text-xs">{project.description}</p>}
                    {project.latestAt ? (
                      <p className="wb-muted text-xs">
                        <time dateTime={project.latestAt}>{project.latestAt.slice(0, 16).replace("T", " ")} UTC</time>
                        {project.latestSummary && ` · ${project.latestSummary}`}
                      </p>
                    ) : <p className="wb-muted text-xs">No observed activity</p>}
                  </li>
                ))}
              </ul>
            )}
            {result.totalPages > 1 && (
              <nav aria-label="Explore pages" className="flex flex-wrap gap-2 text-sm">
                {Array.from({ length: result.totalPages }, (_, index) => index + 1).map((page) => (
                  <Link
                    key={page}
                    aria-label={`Page ${page}`}
                    aria-current={page === selection.page ? "page" : undefined}
                    className="wb-chip aria-[current=page]:border-[var(--wb-accent)] aria-[current=page]:text-[var(--wb-text)]"
                    href={exploreHref({ ...selection, page }, snapshot)}
                    prefetch={false}
                  >
                    {page}
                  </Link>
                ))}
              </nav>
            )}
          </>
        )}
      </section>
    </main>
  );
}
