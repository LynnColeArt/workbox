import Link from "next/link";
import { connection } from "next/server";
import { openDb } from "@/lib/workbox/db";
import { getProject } from "@/lib/workbox/queries";
import { readGitHubPullRequests } from "@/lib/workbox/github-pull-requests";

export const instant = false;

export default async function PullRequestsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[]; status?: string | string[] }>;
}) {
  await connection();
  const { id } = await params;
  const { page, status: requestedStatus } = await searchParams;
  const parsedPage = typeof page === "string" ? Number(page) : 1;
  const githubPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  using db = openDb();
  const project = getProject(db, id);
  if (!project) return <main className="mx-auto max-w-6xl px-4 py-4">Project not indexed.</main>;
  const status = requestedStatus === "closed" ? "closed" : "open";
  const github = await readGitHubPullRequests(project.repoPath, githubPage, status);
  const githubHref = (page: number) => `?status=${status}&page=${page}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <h1 className="mb-4 text-lg font-semibold">Pull requests</h1>
        <section className="wb-panel mb-4 overflow-hidden" aria-label="GitHub pull requests">
          {github.kind === "unavailable" ? (
            <p className="wb-muted px-4 pb-4 text-sm">Imported pull request history is unavailable.</p>
          ) : (
            <>
              <nav aria-label="Pull request status" className="flex gap-4 p-4">
                <Link className="wb-link" href="?status=open" aria-current={status === "open" ? "page" : undefined}>Open ({github.open})</Link>
                <Link className="wb-link" href="?status=closed" aria-current={status === "closed" ? "page" : undefined}>Closed ({github.closed})</Link>
              </nav>
              {github.requests.length === 0 && <p className="wb-muted px-4 pb-4 text-sm">{github.open + github.closed === 0 ? <>No pull requests have been imported. <Link className="wb-link" href={`/p/${encodeURIComponent(id)}/settings/migrations`}>Open Migrations</Link></> : "No pull requests match this filter."}</p>}
              <ul className="divide-y divide-[var(--wb-border)]">
                {github.requests.map(pr => (
                  <li key={JSON.stringify(pr.source)} className="space-y-1 px-4 py-3">
                    <a href={pr.url} className="font-medium hover:underline">{pr.title}</a>
                    <p className="wb-muted text-sm">#{pr.number} · <span className="wb-chip" style={{ color: pr.state === "open" ? "var(--wb-open)" : pr.state === "merged" ? "var(--wb-closed)" : "var(--wb-warn)" }}>{pr.state === "merged" ? "Merged" : pr.state === "open" ? "Open" : "Closed"}</span>{pr.author && ` · ${pr.author}`}</p>
                  </li>
                ))}
              </ul>
              {(github.page > 1 || github.nextPage) && (
                <nav className="flex gap-4 p-4 text-sm" aria-label="GitHub pull request pages">
                  {github.page > 1 && <Link href={githubHref(github.page - 1)}>Previous</Link>}
                  <span>Page {github.page} of {github.totalPages}</span>
                  {github.nextPage && <Link href={githubHref(github.nextPage)}>Next</Link>}
                </nav>
              )}
            </>
          )}
        </section>
    </main>
  );
}
