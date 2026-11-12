import type { SigningIdentity } from "@/lib/workbox/collaboration";
import type { runDiscussionOperation } from "@/lib/workbox/discussions";
import { DiscussionForm } from "./discussion-form";

type Detail = Extract<Awaited<ReturnType<typeof runDiscussionOperation>>, { data: { kind: "detail" } }>["data"];
type Common = { endpoint: string; actor: SigningIdentity; thread: Detail["thread"] };

export function ThreadActions({ endpoint, actor, thread }: Common) {
  const discussionId = thread.id;
  const state = thread.state;
  const revision = thread.heads[0]?.id;
  if (thread.conflict) return (
    <section className="space-y-2" aria-label="Resolve discussion revisions">
      {thread.heads.map(head => (
        <details key={head.id}>
          <summary className="wb-link cursor-pointer">Resolve using revision {head.id.slice(7, 19)}</summary>
          <DiscussionForm endpoint={endpoint} actor={actor}
            action={{ action: "resolve", discussionId, basis: head.id, expected: thread.heads.map(item => item.id) }}
            fields={{ title: head.state.title, category: head.state.category, body: head.state.body }}
            submitLabel="Resolve discussion" />
        </details>
      ))}
    </section>
  );
  if (!state || !revision) return null;
  const expected = revision;
  return (
    <details>
      <summary className="wb-link cursor-pointer">Manage discussion</summary>
      <div className="space-y-3 pt-2">
        <DiscussionForm endpoint={endpoint} actor={actor}
          action={{ action: "revise", discussionId, expected }}
          fields={{ title: state.title, category: state.category, body: state.body }} submitLabel="Save discussion" />
        <DiscussionForm endpoint={endpoint} actor={actor}
          action={{ action: state.status === "open" ? "close" : "reopen", discussionId, expected }}
          submitLabel={state.status === "open" ? "Close discussion" : "Reopen discussion"} />
        {state.accepted_reply_revision && <DiscussionForm endpoint={endpoint} actor={actor}
          action={{ action: "answer", discussionId, expected, replyRevision: null }} submitLabel="Clear accepted answer" />}
      </div>
    </details>
  );
}

export function ReplyActions({ endpoint, actor, thread, reply }: Common & { reply: Detail["replies"][number] }) {
  const discussionId = thread.id;
  const replyId = reply.id;
  const replyRevision = reply.heads[0]?.id;
  const threadRevision = thread.heads[0]?.id;
  if (!replyRevision) return null;
  return (
    <details>
      <summary className="wb-link cursor-pointer text-sm">Manage reply</summary>
      <div className="space-y-3 pt-2">
        {reply.conflict ? reply.heads.map(head => (
          <details key={head.id}>
            <summary className="wb-link cursor-pointer">Resolve using revision {head.id.slice(7, 19)}</summary>
            <DiscussionForm endpoint={endpoint} actor={actor}
              action={{ action: "resolveReply", discussionId, replyId, basis: head.id, expected: reply.heads.map(item => item.id) }}
              fields={{ body: head.state.body }} submitLabel="Resolve reply" />
          </details>
        )) : reply.state && <DiscussionForm endpoint={endpoint} actor={actor}
          action={{ action: "editReply", discussionId, replyId, expected: replyRevision }}
          fields={{ body: reply.state.body }} submitLabel="Save reply" />}
        {!thread.conflict && !reply.conflict && thread.state?.accepted_reply_revision !== replyRevision && threadRevision &&
          <DiscussionForm endpoint={endpoint} actor={actor}
            action={{ action: "answer", discussionId, expected: threadRevision, replyRevision }}
            submitLabel="Mark this revision as the answer" />}
      </div>
    </details>
  );
}
