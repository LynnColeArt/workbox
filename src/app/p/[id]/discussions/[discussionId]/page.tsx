import Link from "next/link";
import { connection } from "next/server";
import { MarkdownContent } from "@/components/markdown-editor";
import { renderMarkdown } from "@/lib/workbox/markdown";
import { runDiscussionOperation } from "@/lib/workbox/discussions";
import { DiscussionForm } from "../discussion-form";

export const instant = false;

export default async function DiscussionPage({ params, searchParams }: {
  params: Promise<{ id: string; discussionId: string }>;
  searchParams: Promise<{ cursor?: string; reply?: string }>;
}) {
  await connection();
  const [{ id, discussionId }, { cursor, reply: replyId }] = await Promise.all([params, searchParams]);
  const base = `/p/${encodeURIComponent(id)}/discussions`;
  const endpoint = `/api/projects/${encodeURIComponent(id)}/discussions`;
  const result = await runDiscussionOperation(id, { action: "detail", discussionId, cursor, replyId });
  if (!result.ok || result.data.kind !== "detail") return (
    <main className="mx-auto max-w-6xl space-y-3 px-4 py-6">
      <Link href={base} className="wb-link">Discussions</Link>
      <p role="status">{result.ok ? "Discussion unavailable." : result.error.message}</p>
      {cursor && <Link className="wb-link" href={`${base}/${encodeURIComponent(discussionId)}`}>Return to the first page</Link>}
    </main>
  );
  const { thread, replies, signer, nextCursor, href, contextReply } = result.data;
  const author = (fingerprint: string) => signer.available && signer.identity.actor === fingerprint
    ? signer.identity.name || fingerprint.slice(0, 12) : fingerprint.slice(0, 12);
  const post = thread.state;
  const replyOptions = replies.filter(reply => reply.state).map(reply => ({
    id: reply.id, label: `${author(reply.creator)} · ${reply.state?.body.trim().slice(0, 64) || "Reply"}`,
  }));
  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <Link href={base} className="wb-link">Discussions</Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{post?.title ?? "Discussion has conflicting revisions"}</h1>
        <p className="wb-muted text-sm">
          {[post?.category, post ? post.status === "closed" ? "Closed" : "Open" : "Conflict", author(thread.creator)].filter(Boolean).join(" · ")}
        </p>
      </header>
      {post && <article className="wb-panel p-4"><MarkdownContent html={renderMarkdown(post.body)} /></article>}
      {thread.conflict && <section aria-label="Conflicting revisions" className="space-y-2">
        {thread.heads.map(head => <article className="wb-panel p-4" key={head.id}>
          <h2 className="font-semibold">{head.state.title}</h2>
          <p className="wb-muted text-xs">{author(head.actor)} · {head.id.slice(7, 19)}</p>
          <MarkdownContent html={renderMarkdown(head.state.body)} />
        </article>)}
      </section>}
      {thread.accepted_answer && <section className="wb-panel space-y-2 p-4" aria-label="Accepted answer">
        <h2 className="font-semibold">Accepted answer</h2>
        <p className="wb-muted text-xs">{author(thread.accepted_answer.actor)} · Revision {thread.accepted_answer.id.slice(7, 19)}</p>
        <MarkdownContent html={renderMarkdown(thread.accepted_answer.state.body)} />
      </section>}
      {contextReply && <section id="reply-context" className="wb-panel space-y-2 p-4" aria-label="Referenced reply">
        <h2 className="font-semibold">Referenced reply</h2>
        <p className="wb-muted text-xs">{author(contextReply.creator)} · {contextReply.id.slice(7, 19)}</p>
        {contextReply.state ? <MarkdownContent html={renderMarkdown(contextReply.state.body)} /> :
          <p className="wb-muted">This reply has conflicting revisions.</p>}
      </section>}
      <section className="space-y-3" aria-label="Replies">
        <h2 className="font-semibold">{thread.reply_count ?? replies.length} replies</h2>
        {replies.map(reply => (
          <article className="wb-panel space-y-2 p-4" id={`reply-${reply.id}`} key={reply.id}>
            <p className="wb-muted text-sm">
              {author(reply.creator)}
              {reply.state?.reply_to && <> · Reply to <a className="wb-link" href={replies.some(item => item.id === reply.state?.reply_to) ? `#reply-${reply.state.reply_to}` :
                `${href}?${new URLSearchParams({ ...(cursor ? { cursor } : {}), reply: reply.state.reply_to })}#reply-context`}>{reply.state.reply_to.slice(7, 19)}</a></>}
            </p>
            {reply.state ? <MarkdownContent html={renderMarkdown(reply.state.body)} /> : (
              <details>
                <summary>Conflicting reply revisions</summary>
                {reply.heads.map(head => <section key={head.id}>
                  <p className="wb-muted text-xs">{author(head.actor)} · {head.id.slice(7, 19)}</p>
                  <MarkdownContent html={renderMarkdown(head.state.body)} />
                </section>)}
              </details>
            )}
          </article>
        ))}
        {nextCursor && <Link className="wb-link" href={`${href}?${new URLSearchParams({ cursor: nextCursor })}`}>Next replies</Link>}
      </section>
      {signer.available ? <DiscussionForm endpoint={endpoint} actor={signer.identity}
        action={{ action: "reply", discussionId }} fields={{ body: "" }} replies={replyOptions}
        heading="Write a reply" submitLabel="Post reply"
      /> : <p className="wb-muted">{signer.reason}</p>}
    </main>
  );
}
