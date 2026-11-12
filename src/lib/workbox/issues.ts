import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  collaborationError, collaborationProject, collaborationSigner, eventId,
  nativeCollaboration, paginationFields, signCollaboration, signingFields,
  type CollaborationResult,
} from "./collaboration";
import { openDb } from "./db";
import type { ProjectSummary } from "./queries";

const title = z.string().max(1024).refine(value => value.trim().length > 0);
const body = z.string().max(65_536);
const commentBody = body.refine(text => text.trim().length > 0 && !text.includes("\0"));
const labels = z.array(z.string().min(1).max(256)).max(64);
const expected = z.array(eventId).min(1).max(200).refine(ids => new Set(ids).size === ids.length);
const state = z.object({
  title: z.string(),
  body: z.string(),
  status: z.enum(["open", "closed"]),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  criteria: z.array(z.object({ id: z.string(), text: z.string() })),
  relations: z.array(z.object({ kind: z.string(), target: z.string() })),
  metadata: z.record(z.string(), z.string()),
});
const nativeHead = z.object({ id: eventId, actor: z.string(), state });
const nativeIssue = z.object({
  id: eventId, creator: z.string(), state: state.nullable(), conflict: z.boolean(),
});
const issueShow = nativeIssue.extend({
  head_ids: z.array(eventId), head_count: z.number(), comment_count: z.number(), revision_count: z.number(),
});
const nativeHistory = z.object({
  id: eventId, actor: z.string(), kind: z.string(), timestamp: z.string(),
  parents: z.array(eventId), state: state.optional(), body: z.string().default(""), intent: z.string().optional(),
});
const page = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), total: z.number() });
const headsPage = page(nativeHead);
const identifier = z.union([eventId, z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)]);

const listInput = z.strictObject({
  action: z.literal("list"), q: z.string().max(1024).optional(), label: z.string().max(256).optional(),
  status: z.enum(["all", "open", "closed"]).default("all"), ...paginationFields,
});
const detailInput = z.strictObject({
  action: z.literal("detail"), issueId: identifier, revisionCursor: paginationFields.cursor, ...paginationFields,
});
const patchFields = { title: title.optional(), body: body.optional(), labels: labels.optional() };
const signedIssue = { ...signingFields, issueId: identifier };
const mutationInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), ...signingFields, title, body: body.default(""), labels: labels.default([]) }),
  z.strictObject({ action: z.literal("comment"), ...signedIssue, body: commentBody }),
  z.strictObject({ action: z.literal("revise"), ...signedIssue, expected: expected.refine(ids => ids.length === 1), ...patchFields }),
  z.strictObject({ action: z.literal("close"), ...signedIssue, expected: expected.refine(ids => ids.length === 1) }),
  z.strictObject({ action: z.literal("reopen"), ...signedIssue, expected: expected.refine(ids => ids.length === 1) }),
  z.strictObject({ action: z.literal("resolve"), ...signedIssue, expected: expected.refine(ids => ids.length > 1),
    basis: eventId, ...patchFields, status: z.enum(["open", "closed"]).optional() }),
]);

const listCursor = z.strictObject({
  query: z.string(), cursor: z.string().nullable(), offset: z.number().int().min(0).max(24), snapshot: z.string().nullable(),
});
const nativePageSize = 25;
const maxIssueHeads = 200;

export function issueHref(project: string, issueId: string) {
  return `/p/${encodeURIComponent(project)}/issue/${encodeURIComponent(issueId)}`;
}

function issueRoot(project: string, identifier: string | number) {
  if (typeof identifier === "string") return identifier;
  using db = openDb();
  return (db.prepare("SELECT issue_id FROM issues WHERE project_id = ? AND number = ?")
    .get(project, identifier) as { issue_id: string } | undefined)?.issue_id;
}

function actorNames(project: string) {
  using db = openDb();
  const actors = db.prepare("SELECT fingerprint, display_name FROM actors WHERE project_id = ?")
    .all(project) as Array<{ fingerprint: string; display_name: string }>;
  const names = new Map(actors.map(actor => [actor.fingerprint, actor.display_name]));
  return (actor: string) => names.get(actor) || actor.slice(0, 12);
}

function localIssueMetadata(project: string, issueId: string) {
  using db = openDb();
  const issue = db.prepare("SELECT number, created_at AS createdAt FROM issues WHERE project_id = ? AND issue_id = ?")
    .get(project, issueId) as { number: number | null; createdAt: string | null } | undefined;
  return issue ?? { number: null, createdAt: null };
}

function nativeArgs(command: string[], limit: number, cursor: string | null | undefined) {
  return [...command, "--limit", String(limit), ...(cursor ? ["--cursor", cursor] : [])];
}

function decodeListCursor(raw: string | undefined, query: string) {
  if (!raw) return { query, cursor: null, offset: 0, snapshot: null };
  try {
    const parsed = listCursor.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    if (parsed.success && parsed.data.query === query) return parsed.data;
  } catch { /* invalid continuation */ }
  return null;
}

export async function readIssueList(project: ProjectSummary, input: z.infer<typeof listInput>) {
  if (!listInput.safeParse(input).success) return collaborationError("invalid_input", "Review the issue filters and page options.");
  const q = input.q?.trim().toLowerCase() ?? "";
  const label = input.label?.toLowerCase() ?? "";
  const numberQuery = /^#?(\d+)$/.exec(q)?.[1];
  const query = createHash("sha256").update(JSON.stringify([project.id, q, label, input.status, input.limit])).digest("hex");
  const start = decodeListCursor(input.cursor, query);
  if (!start) return collaborationError("invalid_input", "This issue cursor does not match the selected filters.");
  let { cursor, offset, snapshot } = start;
  const signer = await collaborationSigner(project);
  const name = actorNames(project.id);
  const items = [];
  // Bound each request even when a narrow filter requires scanning many pages.
  for (let scanned = 0; scanned < 8; scanned++) {
    const read = await nativeCollaboration(project.repoPath,
      nativeArgs(["issue", "list", "--details"], nativePageSize, cursor), page(nativeIssue));
    if (!read.ok) return read;
    if (snapshot && snapshot !== read.data.snapshot) return collaborationError("stale_cursor", "Issues changed. Restart from the first page.");
    snapshot = read.data.snapshot;
    const pageItems = read.data.value.items;
    while (offset < pageItems.length && items.length < input.limit) {
      const row = pageItems[offset++];
      const { number, createdAt } = localIssueMetadata(project.id, row.id);
      const title = row.state?.title ?? (number === null ? "Issue with competing revisions" : `Issue #${number} has competing revisions`);
      if (q && !title.toLowerCase().includes(q) && !(numberQuery && number === Number(numberQuery))) continue;
      if (label && !row.state?.labels.some(item => item.toLowerCase() === label)) continue;
      if (input.status !== "all" && row.state?.status !== input.status) continue;
      items.push({
        issueId: row.id, number, title, status: row.state?.status ?? null, labels: row.state?.labels ?? [],
        conflict: row.conflict, author: name(row.creator), createdAt, href: issueHref(project.id, row.id),
      });
    }
    if (offset === pageItems.length) {
      cursor = read.data.cursor;
      offset = 0;
      if (!cursor) break;
    }
    if (items.length === input.limit) break;
  }
  const nextCursor = cursor || offset ? Buffer.from(JSON.stringify({ query, cursor, offset, snapshot })).toString("base64url") : null;
  return { ok: true, data: { items, nextCursor, signer } } as const;
}

async function readIssueHistory(project: ProjectSummary, issueId: string, kind: "comments" | "revisions", limit: number, cursor?: string | null) {
  return nativeCollaboration(project.repoPath, nativeArgs(["issue", "history", issueId, "--kind", kind], limit, cursor), page(nativeHistory));
}

export async function readIssueDetail(project: ProjectSummary, input: z.infer<typeof detailInput>) {
  if (!detailInput.safeParse(input).success) return collaborationError("invalid_input", "Provide a valid issue ID and page options.");
  const issueId = issueRoot(project.id, input.issueId);
  if (!issueId) return collaborationError("not_found", "Issue not found.");
  const [shown, comments, revisions, signer] = await Promise.all([
    nativeCollaboration(project.repoPath, nativeArgs(["issue", "show", issueId], nativePageSize, null), issueShow),
    readIssueHistory(project, issueId, "comments", input.limit, input.cursor),
    readIssueHistory(project, issueId, "revisions", input.limit, input.revisionCursor),
    collaborationSigner(project),
  ]);
  if (!shown.ok) return shown;
  if (!comments.ok) return comments;
  if (!revisions.ok) return revisions;
  const { snapshot, value: issue } = shown.data;
  const changed = () => collaborationError("stale_cursor", "Issue changed while loading. Reload to see the current revisions.");
  if ([comments, revisions].some(result => result.data.snapshot !== snapshot)) return changed();

  const heads: Array<z.infer<typeof nativeHead>> = [];
  if (issue.conflict) {
    let cursor: string | null = null;
    do {
      const read: CollaborationResult<{ value: z.infer<typeof headsPage>; cursor: string | null; snapshot: string | null }> =
        await nativeCollaboration(project.repoPath, nativeArgs(["issue", "heads", issueId], nativePageSize, cursor), headsPage);
      if (!read.ok) return read;
      if (read.data.snapshot !== snapshot) return changed();
      heads.push(...read.data.value.items);
      cursor = read.data.cursor;
    } while (cursor && heads.length < maxIssueHeads);
  }
  const name = actorNames(project.id);
  const authored = <T extends { actor: string }>(item: T) => ({ ...item, actorName: name(item.actor) });
  const resolve = signer.available && issue.conflict && heads.length === issue.head_count;
  return { ok: true, data: {
    issueId, ...localIssueMetadata(project.id, issueId), href: issueHref(project.id, issueId),
    creator: issue.creator, creatorName: name(issue.creator), state: issue.state, conflict: issue.conflict,
    headIds: issue.conflict ? heads.map(head => head.id) : issue.head_ids, heads: heads.map(authored), headCount: issue.head_count,
    commentCount: issue.comment_count, revisionCount: issue.revision_count, snapshot,
    comments: comments.data.value.items.map(authored), nextCursor: comments.data.cursor,
    revisions: revisions.data.value.items.map(authored), nextRevisionCursor: revisions.data.cursor,
    signer, actions: {
      comment: signer.available, revise: signer.available && !issue.conflict && !!issue.state,
      close: signer.available && issue.state?.status === "open",
      reopen: signer.available && issue.state?.status === "closed",
      resolve,
    },
  } } as const;
}

async function readIssueRevision(project: ProjectSummary, issueId: string, revision: string) {
  let cursor: string | null = null;
  do {
    const read = await readIssueHistory(project, issueId, "revisions", nativePageSize, cursor);
    if (!read.ok) return read;
    const revisionState = read.data.value.items.find(item => item.id === revision)?.state;
    if (revisionState) return { ok: true, data: revisionState } as const;
    cursor = read.data.cursor;
  } while (cursor);
  return collaborationError("stale_revision", "The reviewed revision is unavailable. Reload the issue before saving.");
}

export async function writeIssue(project: ProjectSummary, input: z.infer<typeof mutationInput>) {
  const issueId = input.action === "create" ? null : issueRoot(project.id, input.issueId);
  if (input.action !== "create" && !issueId) return collaborationError("not_found", "Issue not found.");
  let args: string[];
  let issueState: unknown;
  if (input.action === "create") {
    args = ["open"];
    issueState = { title: input.title, body: input.body, labels: input.labels, status: "open" };
  } else if (input.action === "comment") {
    args = ["comment", issueId!, "--body", input.body];
  } else {
    args = [input.action, issueId!, ...input.expected.flatMap(id => ["--expect", id])];
    if (input.action === "revise" || input.action === "resolve") {
      const basis = input.action === "resolve" ? input.basis : input.expected[0];
      if (!input.expected.includes(basis)) return collaborationError("invalid_input", "Choose a reviewed revision as the basis for resolution.");
      const original = await readIssueRevision(project, issueId!, basis);
      if (!original.ok) return original;
      issueState = {
        ...original.data,
        title: input.title ?? original.data.title, body: input.body ?? original.data.body,
        labels: input.labels ?? original.data.labels,
        status: input.action === "resolve" ? input.status ?? original.data.status : original.data.status,
      };
    }
  }
  const result = await signCollaboration(project, {
    family: "issue", args, state: issueState, actor: input.actor, operationId: input.operationId,
  });
  if (!result.ok) return result;
  const id = result.data.id;
  let number: number | null = null;
  if (result.data.indexed) {
    try { number = localIssueMetadata(project.id, id).number; } catch { /* The signed result remains available. */ }
  }
  return { ok: true, data: { ...result.data, issueId: id, number, href: issueHref(project.id, id) } } as const;
}

export type IssueList = Extract<Awaited<ReturnType<typeof readIssueList>>, { ok: true }>["data"];
export type IssueDetails = Extract<Awaited<ReturnType<typeof readIssueDetail>>, { ok: true }>["data"];

export async function runIssueOperation(projectId: string, raw: unknown) {
  const project = collaborationProject(projectId);
  if (!project) return collaborationError("not_found", "Project not found.");
  const list = listInput.safeParse(raw);
  if (list.success) return readIssueList(project, list.data);
  const detail = detailInput.safeParse(raw);
  if (detail.success) return readIssueDetail(project, detail.data);
  const mutation = mutationInput.safeParse(raw);
  if (mutation.success) return writeIssue(project, mutation.data);
  return collaborationError("invalid_input", "Review the required fields for this issue operation.");
}

export async function legacyCreateIssue(projectId: string, raw: unknown) {
  const input = z.object({ title: z.string().trim().pipe(title), body: body.default("") }).safeParse(raw);
  if (!input.success) return collaborationError("invalid_input", "A valid issue title is required.");
  const project = collaborationProject(projectId);
  if (!project) return collaborationError("not_found", "Project not found.");
  const signer = await collaborationSigner(project);
  if (!signer.available) return collaborationError("signer_unavailable", signer.reason);
  return writeIssue(project, {
    action: "create", ...input.data, labels: [], actor: signer.identity.actor, operationId: randomUUID(),
  });
}

export async function legacyCommentIssue(projectId: string, raw: unknown) {
  const input = z.object({ number: z.number().int().positive(), comment: commentBody }).safeParse(raw);
  if (!input.success) return collaborationError("invalid_input", "A valid issue number and comment are required.");
  const project = collaborationProject(projectId);
  if (!project) return collaborationError("not_found", "Project not found.");
  const signer = await collaborationSigner(project);
  if (!signer.available) return collaborationError("signer_unavailable", signer.reason);
  return writeIssue(project, {
    action: "comment", issueId: input.data.number, body: input.data.comment,
    actor: signer.identity.actor, operationId: randomUUID(),
  });
}

export function normalizeIssueIdentifier(raw: string): string | number {
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* leave malformed ID for validation */ }
  if (/^\d+$/.test(decoded) && decoded.length < 16) return Number(decoded);
  return /^[a-f0-9]{64}$/.test(decoded) ? `sha256:${decoded}` : decoded;
}

export function issueResult<T>(result: CollaborationResult<T>) {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
