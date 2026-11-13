import { ProposalFilesChanged } from "@/components/proposal-files-changed";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { StatusTag } from "@/components/status-tag";
import { openDb } from "@/lib/workbox/db";
import { readPullRequestDetail } from "@/lib/workbox/github-pull-requests";
import { getProject } from "@/lib/workbox/queries";

export default async function PullRequestDetailPage({ params, searchParams }: {
  params: Promise<{ id: string; localId: string }>;
  searchParams: Promise<{ file?: string | string[] }>;
}) {
  await connection();
  const { id, localId } = await params;
  using db = openDb();
  const project = getProject(db, id);
  if (!project) notFound();
  const { file } = await searchParams;
  const result = await readPullRequestDetail(project.id, project.repoPath, localId, typeof file === "string" ? file : undefined);
  if (result.kind === "not_found") notFound();
  const list = `/p/${encodeURIComponent(id)}/pull-requests`;

  if (result.kind === "unavailable") {
    return <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <Link href={list} className="wb-link">Pull requests</Link>
      <p role="status">Imported pull request history is unavailable.</p>
    </main>;
  }

  const { request, comparison, history, fileHistory } = result;
  const status = request.state === "open" ? "open" : "closed";
  return <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
    <Link href={`${list}?status=${status}`} className="wb-link">Pull requests</Link>
    <header className="space-y-2">
      <h1 className="break-words text-2xl font-semibold">{request.title} <span className="wb-muted">#{request.number}</span></h1>
      <div className="wb-muted flex flex-wrap items-center gap-2 text-sm">
        <StatusTag status={request.state} />
        {request.author && <span>{request.author}</span>}
        {request.created_at && <time dateTime={request.created_at}>{request.created_at.slice(0, 10)}</time>}
      </div>
    </header>
    <section aria-labelledby="pr-files" className="wb-panel space-y-3 p-4">
      <h2 id="pr-files" className="font-semibold">Files changed</h2>
      <ProposalFilesChanged comparison={comparison} detailHref={request.href} />
      {fileHistory && fileHistory.commits.length > 0 && <div>
        <h3 className="font-semibold">Commits touching this path</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {fileHistory.commits.map(commit => <li key={commit.oid}>
            <Link className="wb-link" href={`/p/${encodeURIComponent(id)}/code?at=${commit.oid}&commit=${commit.oid}`}>{commit.subject}</Link>
            <span className="wb-muted"> · {commit.author}</span>
          </li>)}
        </ul>
        {fileHistory.truncated && <p className="wb-muted">Showing the most recent 100 commits for this path.</p>}
      </div>}
    </section>
    <section aria-labelledby="pr-commits" className="wb-panel space-y-3 p-4">
      <h2 id="pr-commits" className="font-semibold">Commits and authors</h2>
      <dl className="grid gap-1 text-sm">
        {([["Base", request.base_commit], ["Head", request.head_commit], ["Merge", request.merge_commit]] as const)
          .filter(([, oid]) => oid).map(([label, oid]) => (
            <div key={label} className="flex flex-wrap gap-2"><dt>{label}</dt><dd><code className="break-all">{oid}</code></dd></div>
          ))}
      </dl>
      {history ? <ul className="divide-y divide-[var(--wb-border)]">
        {history.commits.map(commit => <li key={commit.oid} className="py-2">
          <Link className="wb-link break-words" href={`/p/${encodeURIComponent(id)}/code?at=${commit.oid}&commit=${commit.oid}`}>{commit.subject}</Link>
          <div className="wb-muted text-sm">{commit.author} · <time dateTime={commit.date}>{commit.date.slice(0, 10)}</time> · <code>{commit.oid.slice(0, 12)}</code></div>
        </li>)}
      </ul> : <p className="wb-muted">Commit history is unavailable from the local Git objects.</p>}
      {history?.truncated && <p className="wb-muted">Showing the most recent 100 commits.</p>}
    </section>
    <section aria-labelledby="pr-description" className="wb-panel space-y-2 p-4">
      <h2 id="pr-description" className="font-semibold">Description</h2>
      {request.body ? <p className="whitespace-pre-wrap break-words">{request.body}</p> :
        <p className="wb-muted">{request.body === null ? "Description unavailable in this Hubnot version." : "No description provided."}</p>}
    </section>
    <a href={request.url} className="wb-link text-sm">Original source</a>
  </main>;
}
