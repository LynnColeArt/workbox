import Link from "next/link";
import { connection } from "next/server";
import { openDb } from "@/lib/workbox/db";
import { getProject } from "@/lib/workbox/queries";
import { readGitHubPullRequests } from "@/lib/workbox/github-pull-requests";

export const instant = false;

export default async function PullRequestsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await connection();
  const { id } = await params;
  const { page } = await searchParams;
  const parsedPage = typeof page === "string" ? Number(page) : 1;
  const githubPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  using db = openDb();
  const project = getProject(db, id);
  if (!project) return <main className="mx-auto max-w-6xl px-4 py-4">Project not indexed.</main>;
  const github = await readGitHubPullRequests(project.repoPath, githubPage);
  const githubHref = (page: number) => `?page=${page}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <h1 className="mb-4 text-lg font-semibold">Pull requests</h1>
      {github.kind === "no_source" ? (
        <p className="wb-muted text-sm">This repository has no GitHub origin.</p>
      ) : (
        <section className="wb-panel mb-4 overflow-hidden" aria-label="GitHub pull requests">
          {github.kind === "unavailable" ? (
            <p className="wb-muted px-4 pb-4 text-sm">Public GitHub history is currently unavailable.</p>
          ) : (
            <>
              {github.requests.length === 0 && <p className="wb-muted px-4 pb-4 text-sm">No GitHub pull requests on this page.</p>}
              <ul className="divide-y divide-[var(--wb-border)]">
                {github.requests.map(pr => (
                  <li key={pr.number} className="space-y-1 px-4 py-3">
                    <a href={pr.url} className="font-medium hover:underline">{pr.title}</a>
                    <p className="wb-muted text-sm">#{pr.number} · {pr.state}{pr.author && ` · ${pr.author}`}</p>
                  </li>
                ))}
              </ul>
              {(githubPage > 1 || github.nextPage) && (
                <nav className="flex gap-4 p-4 text-sm" aria-label="GitHub pull request pages">
                  {githubPage > 1 && <Link href={githubHref(githubPage - 1)}>Previous</Link>}
                  {github.nextPage && <Link href={githubHref(github.nextPage)}>Next</Link>}
                </nav>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
