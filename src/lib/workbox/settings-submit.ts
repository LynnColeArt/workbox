import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { runHn } from "../hn/runner";
import { openDb } from "./db";
import { indexProject } from "./index";
import { proposalDetailHref } from "./proposal-detail";
import { getProject } from "./queries";
import { isGitObjectId, resolveCodeRevision } from "./repo";
import { prepareSettingsCandidate } from "./settings-candidate";
import { isPipelineName, previewPipeline, validatePipelineDefinition } from "./settings-preview";

const unavailable = {
  available: false,
  reason: "This Hubnot version cannot safely pin the signer and recover an interrupted proposal submission.",
} as const;
const actorId = z.string().regex(/^[a-f0-9]{64}$/);
const objectId = z.string().refine(isGitObjectId);
const baseSchema = z.object({ branch: z.string().min(1).max(1024), commit: objectId });
const capabilitySchema = z.object({ capabilities: z.object({
  "native.proposal-publication": z.object({ version: z.literal(1) }),
}) });
const receiptSchema = z.object({
  id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  actor: actorId,
  base: objectId,
  head: objectId,
  base_ref: z.string(),
  operation: z.string(),
  ready: z.boolean(),
  title: z.string(),
  body: z.string(),
});
const nativeRead = { maxOutputBytes: 1024 * 1024, localRead: true } as const;

function failure(code: string, message: string) {
  return { ok: false, error: { code, message } } as const;
}

async function native(repoPath: string, args: string[]) {
  try {
    const response = await runHn(repoPath, args, 30_000, nativeRead);
    return response.exitCode < 0 ? null : response;
  } catch {
    return null;
  }
}

export async function settingsProposalAccess(repoPath: string) {
  const discovery = await native(repoPath, ["capabilities", "--json"]);
  if (!discovery || discovery.exitCode !== 0 || !discovery.envelope.ok ||
      !capabilitySchema.safeParse(discovery.envelope.data).success) {
    return { ...unavailable, actor: null };
  }
  const identity = await native(repoPath, ["identity", "show", "--json"]);
  const parsed = z.object({ actor: actorId }).safeParse(identity?.envelope.data);
  if (identity?.exitCode !== 0 || !identity.envelope.ok || !parsed.success) {
    return { available: false, reason: "Select an active Hubnot signing identity before opening a proposal.", actor: null };
  }
  return { available: true, actor: parsed.data.actor };
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function repositoryPath(db: DatabaseSync, projectId: string) {
  return (db.prepare("SELECT repo_path FROM projects WHERE id = ?").get(projectId) as { repo_path: string } | undefined)?.repo_path;
}

function bindSigner(digest: string, actor: string | null) {
  return actor ? hash(["workbox.settings-signer/1", digest, actor]) : digest;
}

export async function previewSettingsPipeline(db: DatabaseSync, projectId: string, input: unknown) {
  const preview = previewPipeline(db, projectId, input);
  if (!preview.ok) return preview;
  const repoPath = repositoryPath(db, projectId);
  if (!repoPath) return failure("not_found", "Repository not found.");
  const proposalSubmission = await settingsProposalAccess(repoPath);
  const { actor } = proposalSubmission;
  return { ok: true, data: { ...preview.data, digest: bindSigner(preview.data.digest, actor), actor, proposalSubmission } } as const;
}

function publicationFailure(code: string | undefined) {
  if (code === "denied" || code === "actor_mismatch") return failure("denied", "Hubnot refused the selected signer or proposal.");
  if (code === "stale_base") return failure("stale_preview", "Refresh the preview before submitting.");
  if (code === "admission_pending") return failure("admission_pending", "The proposal was signed and awaits repository admission. Retry with the same operation after admission.");
  if (code === "invalid_input") return failure("invalid_input", "Hubnot rejected the confirmed proposal input.");
  if (code === "operation_conflict") return failure("operation_conflict", "This operation ID already belongs to a different proposal.");
  return failure("recovery_required", "Workbox could not confirm publication. Retry with the same confirmed preview and operation ID.");
}

export async function submitSettingsProposal(db: DatabaseSync, projectId: string, input: Record<string, unknown>) {
  const { operationId, digest, name, definition } = input;
  if (input.confirmed !== true || typeof operationId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(operationId) ||
      typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest) || !isPipelineName(name) || typeof definition !== "string") {
    return failure("invalid_input", "Confirm the exact preview and include an operation ID.");
  }
  const repoPath = repositoryPath(db, projectId);
  if (!repoPath) return failure("not_found", "Repository not found.");
  const access = await settingsProposalAccess(repoPath);
  if (!access.available || !access.actor) {
    if (access.reason !== unavailable.reason) return failure("denied", access.reason ?? "An active Hubnot signing identity is required.");
    if (actorId.safeParse(input.actor).success) return publicationFailure(undefined);
    const preview = previewPipeline(db, projectId, input);
    if (!preview.ok) return preview;
    return preview.data.digest === digest
      ? failure("unsupported", unavailable.reason)
      : failure("stale_preview", "Refresh the preview before submitting.");
  }
  const actor = access.actor;
  if (input.actor !== actor) return failure("denied", "The current Hubnot signer differs from the confirmed preview.");
  const base = baseSchema.safeParse(input.base);
  if (!base.success) return failure("invalid_input", "Include the base branch and commit from the confirmed preview.");
  const validation = validatePipelineDefinition(definition);
  if (!validation.ok) return failure("invalid_input", "The pipeline definition needs changes.");

  const { branch, commit } = base.data;
  const baseRef = `refs/heads/${branch}`;
  const title = `Update pipeline ${name}`;
  const body = `Workbox Settings preview ${hash([projectId, actor, branch, commit, digest, name, definition])}`;
  const lookupArgs = ["proposal", "operation", "--actor", actor, "--operation", operationId, "--json"];
  let head: string | null = null;
  let priorId: string | undefined;
  for (const attempt of [0, 1]) {
    const lookup = await native(repoPath, lookupArgs);
    if (lookup?.exitCode === 0 && lookup.envelope.ok) {
      const prior = receiptSchema.safeParse(lookup.envelope.data);
      if (!prior.success) return publicationFailure(undefined);
      if (prior.data.actor !== actor || prior.data.base !== commit || prior.data.base_ref !== baseRef ||
          prior.data.operation !== operationId || prior.data.title !== title || prior.data.body !== body) {
        return publicationFailure("operation_conflict");
      }
      head = prior.data.head;
      priorId = prior.data.id;
      break;
    }
    if (!lookup || lookup.exitCode === 0 || lookup.envelope.ok || lookup.envelope.error?.code !== "not_found") {
      return publicationFailure(lookup?.envelope.error?.code);
    }
    if (attempt === 1) return publicationFailure("stale_base");

    const revision = resolveCodeRevision(repoPath);
    if (revision?.branch !== branch || revision.commit !== commit) continue;
    const preview = previewPipeline(db, projectId, input);
    if (!preview.ok) {
      if (preview.error.code === "unchanged") continue;
      return preview;
    }
    if (preview.data.base.branch !== branch || preview.data.base.commit !== commit ||
        bindSigner(preview.data.digest, actor) !== digest) continue;
    head = prepareSettingsCandidate(repoPath, { base: commit, path: preview.data.path, definition, operationId });
    if (!head) return failure("unavailable", "Workbox could not prepare the exact candidate.");
    const current = resolveCodeRevision(repoPath);
    if (current?.branch === branch && current.commit === commit) break;
  }
  if (!head) return publicationFailure(undefined);

  const publishArgs = [
    "proposal", "publish", "--base", commit, "--base-ref", baseRef, "--head", head,
    "--actor", actor, "--operation", operationId, "--title", title, "--body", body, "--json",
  ];
  let published = await native(repoPath, publishArgs);
  for (const wait of [40, 100, 200]) {
    if (published?.envelope.error?.code !== "concurrent_update") break;
    await delay(wait);
    published = await native(repoPath, publishArgs);
  }
  if (published?.exitCode !== 0 || !published.envelope.ok) return publicationFailure(published?.envelope.error?.code);
  const receipt = receiptSchema.safeParse(published.envelope.data);
  if (!receipt.success || receipt.data.actor !== actor || receipt.data.base !== commit || receipt.data.head !== head ||
      !receipt.data.ready || receipt.data.base_ref !== baseRef || receipt.data.operation !== operationId ||
      receipt.data.title !== title || receipt.data.body !== body || (priorId && priorId !== receipt.data.id)) {
    return publicationFailure(undefined);
  }

  const { id } = receipt.data;
  try {
    using index = openDb();
    const project = getProject(index, projectId);
    if (!project) return publicationFailure(undefined);
    index.exec("BEGIN IMMEDIATE");
    const verified = index.prepare("SELECT 1 FROM events WHERE project_id = ? AND event_id = ? AND kind = 'proposal.open' AND verified = 1");
    if (!verified.get(projectId, id)) indexProject(index, project);
    if (!verified.get(projectId, id)) return publicationFailure(undefined);
    index.exec("COMMIT");
  } catch {
    return publicationFailure(undefined);
  }
  return { ok: true, data: { id, base: commit, head, href: proposalDetailHref(projectId, id) } } as const;
}
