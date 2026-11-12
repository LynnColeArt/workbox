import { z } from "zod";
import {
  collaborationError, collaborationProject, collaborationSigner, eventId, nativeCollaboration,
  paginationFields, signCollaboration, signingFields,
} from "./collaboration";

const title = z.string().trim().min(1).max(512);
const category = z.string().trim().min(1).max(128);
const body = z.string().max(60_000);
const status = z.enum(["open", "closed"]);
const post = z.looseObject({ title: z.string(), category: z.string(), body: z.string(), status, accepted_reply_revision: eventId.optional() });
const reply = z.looseObject({ discussion_id: eventId, reply_to: eventId.optional(), body: z.string() });
const head = <T extends z.ZodType>(state: T) => z.object({ id: eventId, actor: z.string(), state });
const resource = <T extends z.ZodType>(state: T) => z.object({
  id: eventId, creator: z.string(), heads: z.array(head(state)), conflict: z.boolean(), state: state.nullish(),
});
const threadView = resource(post).extend({
  reply_count: z.number().optional(), accepted_answer: head(reply).optional(),
});
const replyView = resource(reply);
const page = <T extends z.ZodType>(item: T) => z.object({
  items: z.array(item), snapshot: z.string(), next_cursor: z.string().optional(),
});

const discussionInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("list"), ...paginationFields, category: category.optional(), status: status.optional() }),
  z.strictObject({ action: z.literal("detail"), ...paginationFields, discussionId: eventId, replyId: eventId.optional() }),
  z.strictObject({ action: z.literal("create"), ...signingFields, title, category, body }),
  z.strictObject({
    action: z.literal("reply"), ...signingFields, discussionId: eventId, replyTo: eventId.optional(),
    body: body.refine(value => value.trim().length > 0, "Enter a reply."),
  }),
]);

export const discussionHref = (project: string, id: string) =>
  `/p/${encodeURIComponent(project)}/discussions/${encodeURIComponent(id)}`;

function pageFlags(input: { limit: number; cursor?: string }) {
  return ["--limit", String(input.limit), ...(input.cursor ? ["--cursor", input.cursor] : [])];
}

export async function runDiscussionOperation(projectId: string, raw: unknown, mayWrite = false) {
  const parsed = discussionInput.safeParse(raw);
  if (!parsed.success) return collaborationError("invalid_input", parsed.error.issues[0]?.message ?? "Invalid discussion request.");
  const project = collaborationProject(projectId);
  if (!project) return collaborationError("not_found", "Repository not found.");
  const input = parsed.data;

  if (input.action === "list") {
    let cursor = input.cursor;
    for (let scanned = 0; scanned < 10; scanned += 1) {
      const listing = await nativeCollaboration(project.repoPath, ["discussion", "list", ...pageFlags({ ...input, cursor })], page(threadView));
      if (!listing.ok) return listing;
      const { items, next_cursor, snapshot } = listing.data.value;
      const results = items.filter(item => (!input.status || item.state?.status === input.status) &&
        (!input.category || item.state?.category.toLowerCase() === input.category.toLowerCase()));
      if (results.length || !next_cursor || scanned === 9) return { ok: true, data: {
        kind: "list", items: results.map(item => ({ ...item, href: discussionHref(project.id, item.id) })),
        nextCursor: next_cursor ?? null, snapshot, signer: await collaborationSigner(project),
      } } as const;
      cursor = next_cursor;
    }
    return collaborationError("native_unavailable", "Discussion listing is unavailable.");
  }

  if (input.action === "detail") {
    const [thread, replies, signer, context] = await Promise.all([
      nativeCollaboration(project.repoPath, ["discussion", "show", input.discussionId], threadView),
      nativeCollaboration(project.repoPath, ["discussion", "replies", input.discussionId, ...pageFlags(input)], page(replyView)),
      collaborationSigner(project),
      input.replyId ? nativeCollaboration(project.repoPath, ["discussion-reply", "show", input.replyId], replyView) : null,
    ]);
    if (!thread.ok) return thread;
    if (!replies.ok) return replies;
    if (context && (!context.ok || !context.data.value.heads.every(head => head.state.discussion_id === input.discussionId))) {
      return collaborationError("not_found", "Reply is unavailable in this discussion.");
    }
    return { ok: true, data: {
      kind: "detail", contextReply: context?.data.value ?? null, thread: thread.data.value, replies: replies.data.value.items,
      nextCursor: replies.data.value.next_cursor ?? null, snapshot: replies.data.value.snapshot,
      signer, href: discussionHref(project.id, input.discussionId),
    } } as const;
  }

  if (!mayWrite) return collaborationError("permission_denied", "Sign from the local Workbox instance.");
  const mutation = input.action === "create"
    ? {
        family: "discussion" as const, args: ["open"],
        state: { schema: "hn.discussion/1", title: input.title, category: input.category, body: input.body, status: "open" },
      }
    : {
        family: "discussion-reply" as const, args: ["open"],
        state: { schema: "hn.discussion-reply/1", discussion_id: input.discussionId, reply_to: input.replyTo, body: input.body },
      };
  const result = await signCollaboration(project, { ...mutation, actor: input.actor, operationId: input.operationId });
  if (!result.ok) return result;
  const root = input.action === "create" ? result.data.id : input.discussionId;
  return { ok: true, data: {
    kind: "mutation", ...result.data, href: discussionHref(project.id, root),
  } } as const;
}
