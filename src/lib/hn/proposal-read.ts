import { z } from "zod";
import { runHn } from "./runner";

const fullId = z.string().length(71).regex(/^sha256:[0-9a-f]{64}$/);
const gitOid = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i);
const actorId = z.string().length(64).regex(/^[0-9a-f]{64}$/);
const proposalKind = z.enum(["proposal.open", "proposal.revise"]);
const reviewVerdict = z.enum(["approve", "request-changes"]);
const decisionVerdict = z.enum(["accept", "reject"]);
const outcome = z.enum(["passed", "failed"]);
const count = z.number().int().nonnegative();
const ids = z.array(fullId);
const actors = z.array(actorId);

export function isFullProposalId(value: unknown): value is string {
  return fullId.safeParse(value).success;
}

const reference = z.object({
  id: fullId,
  actor: actorId,
  actor_name: z.string(),
  sequence: count,
  subject: fullId,
});

const currentReview = reference.extend({
  kind: z.literal("review.submit"),
  verdict: reviewVerdict,
  policy_eligible: z.boolean(),
  protected_policy_eligible: z.boolean(),
});

const resultReference = reference.extend({
  kind: z.literal("run.result"),
  pipeline: z.string().min(1),
  outcome,
  commit: gitOid,
  definition: fullId,
});

const evidenceRequirement = z.object({
  required: count,
  approvals: count,
  deficit: count,
  satisfied: z.boolean(),
  evidence: ids,
  eligible_actors: actors,
  trusted_reviewer_pool: actors,
});

const proposalStatus = z.object({
  schema: z.literal("hn.consumer/1"),
  id: fullId,
  kind: proposalKind,
  actor: actorId,
  actor_name: z.string(),
  title: z.string(),
  body: z.string(),
  base: gitOid,
  head: gitOid,
  policy: fullId,
  status: z.enum(["merge conflict", "merged", "lineage closed", "superseded", "rejected", "accepted", "ready for decision", "blocked"]),
  readiness: z.boolean(),
  evidence: ids,
  current_reviews: z.record(actorId, currentReview),
  requirements: z.object({
    satisfied: z.array(z.string()),
    missing: z.array(z.string()),
    code: z.object({ available: z.boolean(), matches: z.boolean() }),
    reviews: evidenceRequirement.extend({ allow_author_approval: z.boolean() }),
    pipelines: z.array(z.object({
      name: z.string().min(1),
      required: count,
      passes: count,
      deficit: count,
      satisfied: z.boolean(),
      trusted_runners: actors,
      requesters: actors,
      passed: z.array(resultReference),
      failed: z.array(resultReference),
    })),
    protected_checks: evidenceRequirement.extend({
      applies: z.boolean(),
      paths: z.array(z.string()),
      changed_paths: z.array(z.string()),
    }).nullable(),
  }),
  lineage: z.object({
    root: fullId,
    predecessor: z.union([fullId, z.literal("")]),
    successors: ids,
    siblings: ids,
    ancestors: ids,
    descendants: ids,
    members: ids,
    merge_events: ids,
    merged_candidates: ids,
    merged: z.boolean(),
    superseded: z.boolean(),
    closed: z.boolean(),
    merge_conflict: z.boolean(),
  }),
  disagreements: z.object({
    observed_change_requests: count,
    qualified_change_requests: count,
    observed_approvals: count,
    conflicting_current_verdicts: z.boolean(),
  }),
  decisions: z.object({
    eligible_actors: actors,
    required_accepts: count,
    accepts: ids,
    rejects: ids,
    accept_deficit: count,
    accepted: z.boolean(),
    rejected: z.boolean(),
    merged: z.boolean(),
    merge_events: ids,
  }),
  observed_preconditions: z.object({
    scope: z.literal("selected_history_evidence_and_lineage_only"),
    lineage_terminal: z.boolean(),
    acceptance: z.object({ met: z.boolean(), evidence_ready: z.boolean(), not_merged: z.boolean() }),
    merge: z.object({
      met: z.boolean(),
      evidence_ready: z.boolean(),
      accepted: z.boolean(),
      not_rejected: z.boolean(),
      not_merged: z.boolean(),
    }),
  }),
});

const eventFields = z.object({
  protocol: z.literal("hn/0"),
  actor: actorId,
  actorName: z.string(),
  sequence: count,
  timestamp: z.iso.datetime({ offset: true }),
  body: z.string().optional(),
});
const proposalFields = eventFields.extend({ base: gitOid, head: gitOid });
const relatedFields = eventFields.extend({ subject: fullId });
const runFields = relatedFields.extend({
  pipeline: z.string().min(1),
  definition: fullId,
  commit: gitOid,
});

const visibleEvent = z.object({
  schema: z.literal("hn.consumer/1"),
  history_scope: z.literal("visible_operative_history"),
  id: fullId,
  commit: gitOid,
  signature: z.string().min(1),
  event: z.discriminatedUnion("kind", [
    proposalFields.extend({ kind: z.literal("proposal.open"), title: z.string().min(1) }),
    proposalFields.extend({ kind: z.literal("proposal.revise"), subject: fullId }),
    relatedFields.extend({ kind: z.literal("review.submit"), verdict: reviewVerdict }),
    relatedFields.extend({ kind: z.literal("proposal.decision"), verdict: decisionVerdict, policy: fullId, evidence: ids.optional() }),
    relatedFields.extend({ kind: z.literal("proposal.merged"), policy: fullId, commit: gitOid, head: gitOid, evidence: ids.optional() }),
    runFields.extend({ kind: z.literal("run.request") }),
    runFields.extend({ kind: z.literal("run.result"), outcome }),
    relatedFields.extend({ kind: z.literal("run.withdraw") }),
  ]),
});

const publicIdentity = z.object({ actor: actorId, name: z.string() });
const discovery = z.object({
  schema: z.literal("hn.consumer/1"),
  capabilities: z.record(z.string(), z.object({ version: count })),
});
const envelope = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), schema: z.string().optional(), data: z.unknown(), error: z.null().optional() }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string() }) }),
]);

export type ProposalStatus = z.infer<typeof proposalStatus>;
export type VisibleProposalEvent = z.infer<typeof visibleEvent>;
export type ProposalIdentity = z.infer<typeof publicIdentity>;
type ReadFailure = "invalid_id" | "unsupported" | "unavailable" | "not_visible" | "invalid_response";
export type ProposalReadResult<T> = { ok: true; value: T } | { ok: false; reason: ReadFailure };

const nativeTimeoutMs = 10_000;
const visibilityFailures = new Set(["not_found", "permission_denied", "admission_pending", "admission_refused"]);
type Capability = "native.proposal-read" | "native.event-read";

/** Create one reader per request for a server-selected repository. */
export function createProposalReader(repoPath: string, run: typeof runHn = runHn) {
  async function read<T>(
    args: string[],
    schema: z.ZodType<T>,
    options: { identity?: boolean; discovery?: boolean } = {},
  ): Promise<ProposalReadResult<T>> {
    let result;
    try {
      result = await run(repoPath, args, nativeTimeoutMs);
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    if (result.exitCode < 0) return { ok: false, reason: "unavailable" };

    const parsed = envelope.safeParse(result.envelope);
    if (!parsed.success) return { ok: false, reason: "invalid_response" };
    const response = parsed.data;
    if (!response.ok) {
      const code = response.error.code;
      if (code === "non_json_output" || result.exitCode === 0) {
        return { ok: false, reason: "invalid_response" };
      }
      if (options.discovery && code === "prose_failure") return { ok: false, reason: "unsupported" };
      return { ok: false, reason: visibilityFailures.has(code) ? "not_visible" : "unavailable" };
    }
    if (result.exitCode !== 0 || (options.identity && response.schema !== "hn.identity/1")) {
      return { ok: false, reason: "invalid_response" };
    }
    if (options.discovery && z.object({ prose: z.string() }).safeParse(response.data).success) {
      return { ok: false, reason: "unsupported" };
    }
    const data = schema.safeParse(response.data);
    return data.success ? { ok: true, value: data.data } : { ok: false, reason: "invalid_response" };
  }

  let capabilities: Promise<ProposalReadResult<z.infer<typeof discovery>>> | undefined;

  async function readExact<T extends { id: string }>(
    id: string,
    capability: Capability,
    args: string[],
    schema: z.ZodType<T>,
  ): Promise<ProposalReadResult<T>> {
    if (!isFullProposalId(id)) return { ok: false, reason: "invalid_id" };
    capabilities ??= read(["capabilities", "--json"], discovery, { discovery: true });
    const supported = await capabilities;
    if (!supported.ok) return supported;
    if (supported.value.capabilities[capability]?.version !== 1) return { ok: false, reason: "unsupported" };

    const result = await read(args, schema);
    if (result.ok && result.value.id !== id) return { ok: false, reason: "invalid_response" };
    return result;
  }

  return {
    async status(id: string): Promise<ProposalReadResult<ProposalStatus>> {
      const result = await readExact(id, "native.proposal-read", ["proposal", "status", id, "--json"], proposalStatus);
      if (result.ok && Object.entries(result.value.current_reviews).some(
        ([actor, review]) => review.actor !== actor || review.subject !== id,
      )) return { ok: false, reason: "invalid_response" };
      return result;
    },
    event(id: string): Promise<ProposalReadResult<VisibleProposalEvent>> {
      return readExact(id, "native.event-read", ["event", "show", id, "--json"], visibleEvent);
    },
    identity(): Promise<ProposalReadResult<ProposalIdentity>> {
      return read(["identity", "show", "--json"], publicIdentity, { identity: true });
    },
  };
}
