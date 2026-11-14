import { z } from "zod";
import { runHn } from "../hn/runner";
import { collaborationError, collaborationProject, eventId } from "./collaboration";
import { isGitObjectId, resolveCodeRevision } from "./repo";

const actorId = z.string().regex(/^[0-9a-f]{64}$/);
const target = z.strictObject({ branch: z.string().min(1).max(1024), commit: z.string().refine(isGitObjectId) });
const availability = z.object({
  actor: z.union([actorId, z.literal("")]),
  maintainer: z.boolean(),
  accept: z.boolean(),
  reject: z.boolean().optional(),
  merge: z.boolean(),
  target: z.object({ branch: z.string(), commit: z.string() }),
  merge_blocker: z.string(),
});
const request = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("accept"), actor: actorId, confirmed: z.literal(true) }),
  z.strictObject({ action: z.literal("reject"), actor: actorId, confirmed: z.literal(true),
    reason: z.string().trim().min(1).max(4096).refine(value => !value.includes("\0") && Buffer.byteLength(value) <= 4096) }),
  z.strictObject({ action: z.literal("merge"), actor: actorId, confirmed: z.literal(true), target }),
]);
const receipt = z.object({
  id: eventId, kind: z.enum(["proposal.decision", "proposal.merged"]), subject: eventId,
  actor: actorId.optional(), verdict: z.string().optional(), commit: z.string().refine(isGitObjectId).optional(),
});
const discovery = z.object({ capabilities: z.object({ "native.proposal-maintenance": z.object({ version: z.literal(1), reject: z.boolean().optional() }) }) });

async function supported(repo: string, reject = false) {
  const result = await runHn(repo, ["capabilities", "--json"], 5000, { localRead: true, maxOutputBytes: 1024 * 1024 });
  const parsed = discovery.safeParse(result.envelope.data);
  return result.exitCode === 0 && result.envelope.ok && parsed.success &&
    (!reject || parsed.data.capabilities["native.proposal-maintenance"].reject === true);
}

export async function readProposalMaintenance(repo: string, candidate: string) {
  try {
    if (!await supported(repo)) return null;
    const branch = resolveCodeRevision(repo)?.branch ?? "";
    const result = await runHn(repo, ["proposal", "maintain", candidate, "--action=inspect", `--branch=${branch}`, "--json"],
      5000, { localRead: true, maxOutputBytes: 64 * 1024 });
    const parsed = availability.safeParse(result.envelope.data);
    return result.exitCode === 0 && result.envelope.ok && parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ProposalMaintenance = Awaited<ReturnType<typeof readProposalMaintenance>>;

export async function applyProposalMaintenance(project: string, candidate: string, raw: unknown) {
  const parsed = request.safeParse(raw);
  if (!eventId.safeParse(candidate).success || !parsed.success) {
    return collaborationError("invalid_input", "Confirm the action for an exact revision, signer, and any required reason or merge target.");
  }
  try {
    const repo = collaborationProject(project);
    if (!repo) return collaborationError("not_found", "Project unavailable.");
    if (!await supported(repo.repoPath, parsed.data.action === "reject")) return collaborationError("unsupported", "This Hubnot version does not support proposal actions in Workbox.");
    const input = parsed.data;
    const args = ["proposal", "maintain", candidate, `--action=${input.action}`, `--actor=${input.actor}`, "--json"];
    if (input.action === "reject") args.push(`--reason=${input.reason}`);
    if (input.action === "merge") {
      const branch = resolveCodeRevision(repo.repoPath)?.branch;
      if (branch !== input.target.branch) return collaborationError("stale_revision", "The project’s default branch changed. Refresh the revision.");
      args.push(`--branch=${branch}`, `--commit=${input.target.commit}`);
    }
    const result = await runHn(repo.repoPath, args, 30_000, { localRead: true, maxOutputBytes: 64 * 1024 });
    if (!result.envelope.ok && result.exitCode > 0) {
      const error = result.envelope.error;
      if (error && ["permission_denied", "actor_mismatch", "stale_revision", "concurrent_update", "not_found"].includes(error.code)) {
        return collaborationError(error.code, error.message);
      }
    }
    const data = receipt.safeParse(result.envelope.data);
    if (result.exitCode === 0 && result.envelope.ok && data.success && data.data.subject === candidate &&
        (input.action !== "merge" ? data.data.kind === "proposal.decision" && data.data.verdict === input.action && data.data.actor === input.actor
          : data.data.kind === "proposal.merged" && !!data.data.commit)) {
      return { ok: true, data: data.data } as const;
    }
  } catch {
    // An interrupted command may already have recorded an event.
  }
  return collaborationError("outcome_unconfirmed", "Workbox could not confirm the action. Refresh this revision and inspect its history before retrying.");
}
