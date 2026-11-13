import { z } from "zod";
import {
  collaborationError, collaborationProject, collaborationSigner, eventId, nativeCollaboration,
  paginationFields, signCollaboration, signingFields,
} from "./collaboration";

function nativeText(limit: number, label: string, required = false) {
  return z.string().refine(value => (!required || value.trim().length > 0) &&
    Buffer.byteLength(value, "utf8") <= limit, `${label} must fit in ${limit} UTF-8 bytes.`);
}
const title = nativeText(1024, "Title", true);
const category = nativeText(256, "Category", true);
const body = nativeText(65_536, "Body");
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

const threadWrite = { ...signingFields, discussionId: eventId };
const expected = eventId;
const conflictHeads = z.array(eventId).min(2).max(200);
const replyBody = body.refine(value => value.trim().length > 0, "Enter a reply.");

const discussionInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("list"), ...paginationFields, category: category.optional(), status: status.optional() }),
  z.strictObject({ action: z.literal("detail"), ...paginationFields, discussionId: eventId, replyId: eventId.optional() }),
  z.strictObject({ action: z.literal("create"), ...signingFields, title, category, body }),
  z.strictObject({
    action: z.literal("reply"), ...signingFields, discussionId: eventId, replyTo: eventId.optional(),
    body: replyBody,
  }),
  z.strictObject({ action: z.literal("revise"), ...threadWrite, expected, title, category, body }),
  z.strictObject({ action: z.enum(["close", "reopen"]), ...threadWrite, expected }),
  z.strictObject({ action: z.literal("answer"), ...threadWrite, expected, replyRevision: eventId.nullable() }),
  z.strictObject({ action: z.literal("editReply"), ...threadWrite, expected, replyId: eventId, body: replyBody }),
  z.strictObject({
    action: z.literal("resolve"), ...threadWrite, expected: conflictHeads, basis: eventId,
    title: title.optional(), category: category.optional(), body: body.optional(),
  }),
  z.strictObject({
    action: z.literal("resolveReply"), ...threadWrite, expected: conflictHeads, basis: eventId,
    replyId: eventId, body: replyBody.optional(),
  }),
]);

export const discussionHref = (project: string, id: string) =>
  `/p/${encodeURIComponent(project)}/discussions/${encodeURIComponent(id)}`;

function pageFlags(input: { limit: number; cursor?: string }) {
  return ["--limit", String(input.limit), ...(input.cursor ? ["--cursor", input.cursor] : [])];
}

type DiscussionInput = z.infer<typeof discussionInput>;
type DiscussionWrite = Exclude<DiscussionInput, { action: "list" | "detail" }>;
type NativeMutation = Pick<Parameters<typeof signCollaboration>[1], "family" | "args" | "state">;

async function revisionState<T extends z.ZodType>(repo: string, family: NativeMutation["family"], id: string, revision: string, schema: T) {
  let cursor: string | undefined;
  do {
    const history = await nativeCollaboration(repo, [family, "history", id, ...pageFlags({ limit: 50, cursor })], page(head(z.unknown())));
    if (!history.ok) return history;
    const matched = history.data.value.items.find(item => item.id === revision);
    if (matched) {
      const state = schema.safeParse(matched.state);
      return state.success ? { ok: true, data: state.data } as const :
        collaborationError("native_unavailable", "Hubnot returned an unsupported revision.");
    }
    cursor = history.data.value.next_cursor;
  } while (cursor);
  return collaborationError("stale_revision", "The selected revision is no longer available. Refresh the discussion.");
}

async function prepareMutation(repo: string, input: DiscussionWrite) {
  const success = (data: NativeMutation) => ({ ok: true, data }) as const;
  switch (input.action) {
    case "create":
      return success({
        family: "discussion", args: ["open"],
        state: { schema: "hn.discussion/1", title: input.title, category: input.category, body: input.body, status: "open" },
      });
    case "reply":
      return success({
        family: "discussion-reply", args: ["open"],
        state: { schema: "hn.discussion-reply/1", discussion_id: input.discussionId, reply_to: input.replyTo, body: input.body },
      });
    case "revise":
      return success({
        family: "discussion",
        args: ["revise", input.discussionId, "--expect", input.expected, "--title", input.title,
          "--category", input.category, "--body", input.body],
      });
    case "close":
    case "reopen":
      return success({ family: "discussion", args: [input.action, input.discussionId, "--expect", input.expected] });
    case "answer":
      return success({
        family: "discussion",
        args: ["answer", input.discussionId, "--expect", input.expected, ...(input.replyRevision ? ["--reply", input.replyRevision] : ["--clear"])],
      });
    case "editReply": {
      const current = await nativeCollaboration(repo, ["discussion-reply", "show", input.replyId], replyView);
      if (!current.ok) return current;
      if (!current.data.value.heads.every(head => head.state.discussion_id === input.discussionId)) {
        return collaborationError("not_found", "Reply is unavailable in this discussion.");
      }
      return success({
        family: "discussion-reply", args: ["edit", input.replyId, "--expect", input.expected, "--body", input.body],
      });
    }
    case "resolve":
    case "resolveReply": {
      if (!input.expected.includes(input.basis) || new Set(input.expected).size !== input.expected.length) {
        return collaborationError("invalid_input", "Choose one of the distinct revisions being resolved.");
      }
      const expectations = input.expected.flatMap(id => ["--expect", id]);
      if (input.action === "resolveReply") {
        const basis = await revisionState(repo, "discussion-reply", input.replyId, input.basis, reply);
        if (!basis.ok) return basis;
        if (basis.data.discussion_id !== input.discussionId) return collaborationError("not_found", "Reply is unavailable in this discussion.");
        return success({
          family: "discussion-reply", args: ["resolve", input.replyId, ...expectations],
          state: { ...basis.data, body: input.body ?? basis.data.body },
        });
      }
      const basis = await revisionState(repo, "discussion", input.discussionId, input.basis, post);
      if (!basis.ok) return basis;
      return success({
        family: "discussion", args: ["resolve", input.discussionId, ...expectations],
        state: { ...basis.data, title: input.title ?? basis.data.title, category: input.category ?? basis.data.category,
          body: input.body ?? basis.data.body },
      });
    }
  }
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
        (!input.category || item.state?.category.trim().toLowerCase() === input.category.trim().toLowerCase()));
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
  const mutation = await prepareMutation(project.repoPath, input);
  if (!mutation.ok) return mutation;
  const result = await signCollaboration(project, { ...mutation.data, actor: input.actor, operationId: input.operationId });
  if (!result.ok) return result;
  const threadHref = discussionHref(project.id, input.action === "create" ? result.data.id : input.discussionId);
  const replyId = input.action === "reply" ? result.data.id :
    input.action === "editReply" || input.action === "resolveReply" ? input.replyId : null;
  const href = replyId ? `${threadHref}?${new URLSearchParams({ reply: replyId })}#reply-context` : threadHref;
  return { ok: true, data: {
    kind: "mutation", ...result.data, href,
  } } as const;
}
