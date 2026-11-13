import { z } from "zod";
import { actorId, collaborationError, eventId, nativeCollaboration, operationId, type CollaborationResult } from "../hn/collaboration";
import { openDb } from "./db";
import { indexProject } from "./index";
import { getProject, type ProjectSummary } from "./queries";

export { collaborationError, eventId, nativeCollaboration, type CollaborationResult };
export const signingFields = { actor: actorId, operationId };
import { workboxPageSize } from "./list-settings";

export const paginationFields = {
  limit: z.number().int().min(1).max(200).default(workboxPageSize),
  cursor: z.string().min(1).max(4096).optional(),
};

export type SigningIdentity = { actor: string; name: string };
export type SigningAvailability =
  | { available: true; identity: SigningIdentity }
  | { available: false; reason: string };

export function collaborationProject(project: string) {
  using db = openDb();
  return getProject(db, project);
}

export async function collaborationSigner(project: ProjectSummary): Promise<SigningAvailability> {
  const identity = await nativeCollaboration(project.repoPath, ["identity", "show"], z.object({ actor: actorId, name: z.string() }));
  return identity.ok
    ? { available: true, identity: identity.data.value }
    : { available: false, reason: "Configure an active Hubnot identity for this repository to sign changes." };
}

const mutationResult = z.object({
  issue_id: eventId.optional(), resource_id: eventId.optional(), event_id: eventId,
  replayed: z.boolean(), admission: z.string().optional(),
});

type Mutation = {
  family: "issue" | "discussion" | "discussion-reply";
  args: string[];
  state?: unknown;
  actor: string;
  operationId: string;
};

export async function signCollaboration(
  project: ProjectSummary, mutation: Mutation,
): Promise<CollaborationResult<{ id: string; eventId: string; actor: string; replayed: boolean; indexed: boolean }>> {
  const parsed = z.object(signingFields).safeParse(mutation);
  if (!parsed.success) return collaborationError("invalid_input", "Provide the reviewed signing identity and an operation ID.");
  const { actor, operationId: key } = parsed.data;
  const signer = await collaborationSigner(project);
  if (!signer.available) return collaborationError("signer_unavailable", signer.reason);
  if (signer.identity.actor !== actor) return collaborationError("actor_mismatch", "The active Hubnot identity changed. Review the signer before posting.");

  // Native replay compares the immutable request and retries admission if needed.
  // A lookup alone would not detect reuse of a key for different content.
  const result = await nativeCollaboration(project.repoPath,
    [mutation.family, ...mutation.args, "--actor", actor, "--operation", key], mutationResult, mutation.state);
  if (!result.ok) {
    if (result.error.code === "native_unavailable" || result.error.code === "admission_pending" || result.error.code === "concurrent_update") {
      return collaborationError(result.error.code, "Hubnot could not confirm the write. Retry the same submission with its original operation ID.");
    }
    return result;
  }
  const outcome = result.data.value;
  const id = mutation.family === "issue" ? outcome.issue_id : outcome.resource_id;
  if (!id) return collaborationError("native_unavailable", "Hubnot did not return a resource ID. Retry the original submission.");
  if (outcome.admission === "hidden") {
    return collaborationError("admission_hidden", "Hubnot signed the operation, but repository policy hides it.");
  }
  if (outcome.admission && outcome.admission !== "admitted") {
    return collaborationError("admission_pending", "Hubnot signed the operation. Retry the original submission when admission is complete.");
  }

  let indexed = false;
  try {
    using db = openDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      indexProject(db, project);
      indexed = !!db.prepare(
        "SELECT 1 FROM events WHERE project_id = ? AND event_id = ? AND verified = 1",
      ).get(project.id, outcome.event_id);
      db.exec(indexed ? "COMMIT" : "ROLLBACK");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch {
    // The signed result survives index failures. Replaying is safe.
  }
  return { ok: true, data: { id, eventId: outcome.event_id, actor, replayed: outcome.replayed, indexed } };
}

export function collaborationResponse<T>(result: CollaborationResult<T>) {
  if (result.ok) return Response.json(result);
  const statuses: Record<string, number> = {
    not_found: 404, actor_mismatch: 403, permission_denied: 403, admission_refused: 403, admission_hidden: 403,
    stale_revision: 409, stale_cursor: 409, issue_conflict: 409, resource_conflict: 409, operation_conflict: 409,
    signer_unavailable: 409, admission_pending: 409, concurrent_update: 409, native_unavailable: 503, output_limit: 503,
  };
  return Response.json(result, { status: statuses[result.error.code] ?? 400 });
}

export function canSignCollaborationRequest(request: Request) {
  if (!request.headers.get("content-type")?.split(";")[0].trim().match(/^application\/json$/i)) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    const local = new URL(`http://${host}`);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(local.hostname)) return false;
    if (!origin) return true;
    const source = new URL(origin);
    return ["http:", "https:"].includes(source.protocol) && source.host === local.host && source.origin === origin;
  } catch {
    return false;
  }
}
