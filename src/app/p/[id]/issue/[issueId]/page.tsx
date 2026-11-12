import Link from "next/link";
import { connection } from "next/server";
import { MarkdownContent } from "@/components/markdown-editor";
import { collaborationProject } from "@/lib/workbox/collaboration";
import { normalizeIssueIdentifier, readIssueDetail } from "@/lib/workbox/issues";
import { renderMarkdown } from "@/lib/workbox/markdown";
import { IssueCommentForm, IssueEditForm, IssueStatusForm } from "@/app/p/[id]/issues/issue-forms";

export const instant = false;

type Query = { cursor?: string | string[]; revisionCursor?: string | string[] };

export default async function IssuePage({ params, searchParams }: {
  params: Promise<{ id: string; issueId: string }>;
  searchParams: Promise<Query>;
}) {
  await connection();
  const { id, issueId: rawIssueId } = await params;
  const query = await searchParams;
  const project = collaborationProject(id);
  if (!project) return <main className="p-4"><p>Project not found.</p></main>;
  const issueId = normalizeIssueIdentifier(rawIssueId);
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const revisionCursor = typeof query.revisionCursor === "string" ? query.revisionCursor : undefined;
  const requested = await readIssueDetail(project, { action: "detail", issueId, cursor, revisionCursor, limit: 25 });
  const paginationReset = !requested.ok && requested.error.code === "stale_cursor" && !!(cursor || revisionCursor);
  // Keep the current route mounted when signed changes invalidate its pagination.
  const result = paginationReset ? await readIssueDetail(project, { action: "detail", issueId, limit: 25 }) : requested;
  const list = `/p/${encodeURIComponent(id)}/issues`;
  if (!result.ok) return (
    <main className="mx-auto max-w-6xl space-y-3 px-4 py-6">
      <Link className="wb-link text-sm" href={list}>All issues</Link>
      <p role="alert">{result.error.message}</p>
      {(cursor || revisionCursor) && <Link className="wb-link text-sm" href={`/p/${encodeURIComponent(id)}/issue/${encodeURIComponent(rawIssueId)}`}>Reload the first page</Link>}
    </main>
  );
  const issue = result.data;
  function nextPage(field: "cursor" | "revisionCursor", value: string) {
    const params = new URLSearchParams();
    if (cursor && !paginationReset) params.set("cursor", cursor);
    if (revisionCursor && !paginationReset) params.set("revisionCursor", revisionCursor);
    params.set(field, value);
    return `${issue.href}?${params}#${field === "cursor" ? "comments" : "revisions"}`;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link className="wb-link text-sm" href={list}>All issues</Link>
      {paginationReset && <p role="status" className="wb-muted mt-2 text-sm">The issue changed. Showing the first page of the current conversation and revisions.</p>}
      <h1 className="my-3 break-words text-2xl sm:text-3xl">
        {issue.state?.title ?? "Issue with competing revisions"}{" "}
        {issue.number !== null && <span className="wb-muted font-light">#{issue.number}</span>}
      </h1>
      <p className="wb-muted mb-4 text-sm">
        <strong style={{ color: issue.conflict ? "var(--wb-warn)" : issue.state?.status === "closed" ? "var(--wb-closed)" : "var(--wb-open)" }}>
          {issue.conflict ? "Competing revisions" : issue.state?.status === "closed" ? "Closed" : "Open"}
        </strong>{" · "}{issue.creatorName}
        {issue.createdAt && <> · <time dateTime={issue.createdAt}>{issue.createdAt.slice(0, 10)}</time></>}
      </p>
      {issue.state && (
        <article className="wb-panel mb-4 p-4">
          <MarkdownContent html={renderMarkdown(issue.state.body)} />
          {issue.state.labels.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
            {issue.state.labels.map(label => <span key={label} className="wb-chip">{label}</span>)}
          </div>}
        </article>
      )}
      {issue.conflict && (
        <section className="mb-4 space-y-2" aria-label="Competing issue revisions">
          {issue.heads.map(head => (
            <details className="wb-panel p-3" key={head.id}>
              <summary className="cursor-pointer text-sm">{head.state.title} · {head.actorName} · <code>{head.id.slice(7, 19)}</code></summary>
              <div className="wb-muted my-2 text-xs">{head.state.status === "closed" ? "Closed" : "Open"} · {head.state.labels.join(", ")}</div>
              <MarkdownContent html={renderMarkdown(head.state.body)} />
            </details>
          ))}
          {issue.heads.length < issue.headCount && <p className="wb-muted text-sm">This issue has too many competing revisions to resolve together in Workbox.</p>}
        </section>
      )}
      <IssueEditForm project={id} issue={issue} />
      <IssueStatusForm project={id} issue={issue} />
      <section id="comments" className="mb-6 space-y-3" aria-label="Issue comments">
        <h2 className="font-semibold">{issue.commentCount} {issue.commentCount === 1 ? "comment" : "comments"}</h2>
        {issue.comments.map(comment => (
          <article key={comment.id} id={comment.id} className="wb-panel overflow-hidden">
            <header className="flex flex-wrap gap-2 border-b border-[var(--wb-border)] bg-[var(--wb-panel-2)] px-4 py-2 text-sm">
              <strong>{comment.actorName}</strong>
              <time className="wb-muted" dateTime={comment.timestamp}>{comment.timestamp.slice(0, 16).replace("T", " ")}</time>
              <span className="wb-chip ml-auto" title={comment.id}>Signed</span>
            </header>
            <MarkdownContent className="px-4 py-3" html={renderMarkdown(comment.body)} />
          </article>
        ))}
        {issue.nextCursor && <Link className="wb-link text-sm" href={nextPage("cursor", issue.nextCursor)}>Next comments</Link>}
        {cursor && !paginationReset && <Link className="wb-link ml-3 text-sm" href={`${issue.href}#comments`}>First comments</Link>}
      </section>
      <IssueCommentForm project={id} signer={issue.signer} issueId={issue.issueId} />
      <section id="revisions" className="space-y-3" aria-label="Signed issue revisions">
        <h2 className="font-semibold">Signed revisions</h2>
        <ul className="wb-panel divide-y divide-[var(--wb-border)] text-sm">
          {issue.revisions.map(revision => (
            <li key={revision.id} className="px-4 py-3">
              <details>
                <summary className="cursor-pointer">
                  <span className="wb-chip mr-2">{revision.intent ?? revision.kind}</span>
                  <span className="mr-2">{revision.actorName}</span>
                  <code className="mr-2">{revision.id.slice(7, 19)}</code>
                  <time className="wb-muted" dateTime={revision.timestamp}>{revision.timestamp.slice(0, 16).replace("T", " ")}</time>
                </summary>
                <div className="mt-3 space-y-2">
                  <p className="wb-muted">Revision <code className="break-all">{revision.id}</code></p>
                  {revision.parents.length > 0 && (
                    <ul aria-label="Parent revisions" className="wb-muted">
                      {revision.parents.map(parent => <li key={parent}>Parent <code className="break-all">{parent}</code></li>)}
                    </ul>
                  )}
                  {revision.state && (
                    <>
                      <p className="font-semibold">{revision.state.title}</p>
                      <p className="wb-muted">{revision.state.status === "closed" ? "Closed" : "Open"}</p>
                      <MarkdownContent html={renderMarkdown(revision.state.body)} />
                      {revision.state.labels.length > 0 && (
                        <ul aria-label="Labels in this revision" className="flex flex-wrap gap-2">
                          {revision.state.labels.map(label => <li className="wb-chip" key={label}>{label}</li>)}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
        {issue.nextRevisionCursor && <Link className="wb-link text-sm" href={nextPage("revisionCursor", issue.nextRevisionCursor)}>Next revisions</Link>}
        {revisionCursor && !paginationReset && <Link className="wb-link ml-3 text-sm" href={`${issue.href}#revisions`}>First revisions</Link>}
      </section>
    </main>
  );
}
