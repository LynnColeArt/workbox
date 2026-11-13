import { connection } from "next/server";
import { z } from "zod";
import { git } from "@/lib/hn/gitread";
import { actorId, eventId, nativeCollaboration } from "@/lib/hn/collaboration";
import {
  canSignCollaborationRequest, collaborationError, collaborationProject, collaborationResponse, collaborationSigner,
} from "@/lib/workbox/collaboration";
import { proposalDetailHref } from "@/lib/workbox/proposal-detail";
import { openDb } from "@/lib/workbox/db";
import { indexProject } from "@/lib/workbox/index";

export const instant = false;

const oid = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const exact = z.object({ actor: actorId, base: oid, head: oid });
const input = z.object({
  title: z.string().trim().min(1).max(1024),
  body: z.string().refine(value => !value.includes("\0") && Buffer.from(value).toString("utf8") === value && Buffer.byteLength(value) <= 65_536).default(""),
  head: z.string().trim().min(1).max(1024),
  operationId: z.string().uuid(),
  exact: exact.optional(),
  prepare: z.boolean().optional(),
});
const receipt = exact.extend({ id: eventId, title: z.string(), body: z.string(), operation: z.string(), ready: z.boolean() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const response = collaborationResponse<unknown>;
  if (!canSignCollaborationRequest(request)) return response(collaborationError("permission_denied", "Sign from local Workbox."));
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response(collaborationError("invalid_input", "Provide a proposal title, head branch and operation ID."));
  const project = collaborationProject(id);
  if (!project) return response(collaborationError("not_found", "Repository not found."));
  const { title, body, head, operationId } = parsed.data;
  const signer = await collaborationSigner(project);
  if (!signer.available) return response(collaborationError("signer_unavailable", signer.reason));
  const actor = signer.identity.actor;
  const baseRef = "refs/heads/main";
  const headRef = `refs/heads/${head}`;
  const readCommits = () => exact.safeParse({
    actor, base: git(project.repoPath, ["show-ref", "--verify", "--hash", baseRef]).out.trim(),
    head: git(project.repoPath, ["show-ref", "--verify", "--hash", headRef]).out.trim(),
  }).data;
  if (parsed.data.prepare) {
    const commits = readCommits();
    if (!commits || commits.base === commits.head || !git(project.repoPath, [
      "merge-base", "--is-ancestor", commits.base, commits.head,
    ]).ok) return response(collaborationError("invalid_input", "Choose a local branch with changes descended from main."));
    return response({ ok: true, data: { exact: commits } });
  }

  const commits = parsed.data.exact;
  if (!commits) return response(collaborationError("invalid_input", "Prepare the exact proposal before signing."));
  if (actor !== commits.actor) return response(collaborationError("actor_mismatch", "The original signing identity is required to retry."));
  const flags = ["--actor", actor, "--operation", operationId];
  const previous = await nativeCollaboration(project.repoPath, ["proposal", "operation", ...flags], receipt);
  if (!previous.ok) {
    if (previous.error.code !== "not_found") return response(previous);
    const current = readCommits();
    if (current?.base !== commits.base || current?.head !== commits.head) {
      return response(collaborationError("stale_base", "A selected branch moved. Review the draft and submit again."));
    }
    if (commits.base === commits.head || !git(project.repoPath, [
      "merge-base", "--is-ancestor", commits.base, commits.head,
    ]).ok) return response(collaborationError("invalid_input", "Choose a local branch with changes descended from main."));
  }
  const published = await nativeCollaboration(project.repoPath, [
    "proposal", "publish", ...flags, "--base-ref", baseRef, "--base", commits.base, "--head", commits.head,
    "--title", title, "--body", body,
  ], receipt);
  if (!published.ok) return response(published);
  const result = published.data.value;
  if (!result.ready) return response(collaborationError("admission_pending", "Hubnot signed the proposal and is waiting for admission."));
  try {
    using db = openDb();
    indexProject(db, project);
  } catch {
    return response(collaborationError("recovery_required", "The proposal was signed. Retry to refresh the Workbox index."));
  }
  return response({ ok: true, data: { id, proposalId: result.id, url: proposalDetailHref(id, result.id, { mode: "lineage" }) } });
}
