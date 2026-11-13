import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { StatusTag } from "@/components/status-tag";
import { openDb } from "@/lib/workbox/db";
import { readPullRequestDetail } from "@/lib/workbox/github-pull-requests";
import { getProject } from "@/lib/workbox/queries";

export default async function PullRequestDetailPage({ params }: {
  params: Promise<{ id: string; localId: string }>;
}) {
  await connection();
  const { id, localId } = await params;
  using db = openDb();
  const project = getProject(db, id);
  if (!project) notFound();
  const result = await readPullRequestDetail(project.id, project.repoPath, localId);
  if (result.kind === "not_found") notFound();
  const list = `/p/${encodeURIComponent(id)}/pull-requests`;

  if (result.kind === "unavailable") {
    return <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <Link href={list} className="wb-link">Pull requests</Link>
      <p role="status">Imported pull request history is unavailable.</p>
    </main>;
  }

  const { request } = result;
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
    <section aria-labelledby="pr-description" className="wb-panel space-y-2 p-4">
      <h2 id="pr-description" className="font-semibold">Description</h2>
      {request.body ? <p className="whitespace-pre-wrap break-words">{request.body}</p> :
        <p className="wb-muted">{request.body === null ? "Description unavailable in this Hubnot version." : "No description provided."}</p>}
    </section>
    <a href={request.url} className="wb-link text-sm">Original source</a>
  </main>;
}
