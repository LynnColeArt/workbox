import { z } from "zod";
import { runHn } from "../hn/runner";
import { eventId, collaborationError, collaborationProject } from "./collaboration";

const anchor = z.object({ path: z.string().min(1).max(4096).refine(value => !value.includes("\0")), side: z.enum(["LEFT", "RIGHT"]), line: z.number().int().positive(), replyTo: eventId.optional() });
const listing = z.object({ actor: z.string(), comments: z.array(z.object({
  id: eventId, event: z.object({ subject: eventId, actorName: z.string(), actor: z.string(), timestamp: z.string(), body: z.string(), inline: anchor }),
})) });
const input = z.strictObject({ ...anchor.shape, actor: z.string().min(1), body: z.string().trim().min(1).max(16384), operation: z.uuid() });

export function nativeInline(project: string, revision: string): Promise<{ ok: true; data: z.infer<typeof listing> } | ReturnType<typeof collaborationError>>;
export function nativeInline(project: string, revision: string, raw: unknown): Promise<{ ok: true; data: unknown } | ReturnType<typeof collaborationError>>;
export async function nativeInline(project: string, revision: string, raw?: unknown) {
  const repo = collaborationProject(project);
  if (!repo || !eventId.safeParse(revision).success) return collaborationError("not_found", "Proposal revision unavailable.");
  const args = raw === undefined ? ["inline-list"] : ["inline-post"];
  if (raw !== undefined) {
    const parsed = input.safeParse(raw);
    if (!parsed.success) return collaborationError("invalid_input", "Provide a line, signer, and comment.");
    const { path, side, line, actor, body, operation, replyTo } = parsed.data;
    args.push(`--path=${path}`, `--side=${side}`, `--line=${line}`, `--actor=${actor}`, `--body=${body}`, `--operation=${operation}`);
    if (replyTo) args.push(`--reply-to=${replyTo}`);
  }
  const result = await runHn(repo.repoPath, ["proposal", ...args, "--json", revision], 30_000, { localRead: raw === undefined, maxOutputBytes: 4 * 1024 * 1024 });
  if (!result.envelope.ok) return collaborationError("native_unavailable", "Hubnot could not complete the inline review operation. Check the selected revision, line, and signer.");
  if (raw !== undefined) return { ok: true, data: result.envelope.data } as const;
  const parsed = listing.safeParse(result.envelope.data);
  return parsed.success ? { ok: true, data: parsed.data } as const :
    collaborationError("native_unavailable", "Inline review history is unavailable.");
}
