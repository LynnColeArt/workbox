import { isFullProposalId, type ProposalIdentity, type ProposalStatus } from "@/lib/hn/proposal-read";
import type { runHn } from "@/lib/hn/runner";
import type { ProposalChecksModel } from "./proposal-checks";

export type ReviewVerdict = "approve" | "request-changes";

type ReviewInput = { proposalId: string; verdict: ReviewVerdict; comment: string };
type ReviewAvailability =
  | { available: true; detail: string }
  | { available: false; detail: string };
type Handoff = { title: string; detail: string; command?: string };

export type ProposalActions = { review: ReviewAvailability; handoffs: Handoff[] };

function reviewAvailability(status: ProposalStatus, identity: ProposalIdentity | null): ReviewAvailability {
  if (!status.observed_preconditions.lineage_terminal || status.decisions.merged || status.decisions.rejected) {
    return { available: false, detail: "Open a live revision to review it in Workbox." };
  }
  if (!status.requirements.code.matches) {
    return { available: false, detail: "Hubnot must verify this revision’s code before you can review it." };
  }
  if (!identity) {
    return { available: false, detail: "Workbox could not verify your local Hubnot identity. Check the identity in the project checkout." };
  }
  const ordinary = status.requirements.reviews.eligible_actors.includes(identity.actor);
  const protectedChecks = status.requirements.protected_checks;
  const protectedReview = protectedChecks?.applies && protectedChecks.eligible_actors.includes(identity.actor);
  if (ordinary && protectedReview) {
    return { available: true, detail: "Your approval can count toward both ordinary reviews and protected checks. Hubnot checks signing authority on submission." };
  }
  if (ordinary || protectedReview) {
    const requirement = ordinary ? "ordinary reviews" : "protected checks";
    return { available: true, detail: `Your approval can count toward ${requirement}. Hubnot checks signing authority on submission.` };
  }
  return {
    available: true,
    detail: "You can submit feedback. This revision’s policy counts approvals from eligible reviewers. Hubnot checks signing authority on submission.",
  };
}

export function getProposalActions(checks: ProposalChecksModel, identity: ProposalIdentity | null): ProposalActions {
  if (checks.kind === "unavailable") {
    return {
      review: { available: false, detail: "Workbox needs Hubnot’s evaluation of this exact revision before enabling review." },
      handoffs: [{
        title: "Recover the evaluation",
        detail: "In the project checkout, inspect this exact revision with Hubnot. Sync missing proposal data and refresh this page.",
        command: "hn proposal status",
      }],
    };
  }
  const { status, blockers } = checks;
  const { decisions, lineage, observed_preconditions: observed, requirements } = status;
  const review = reviewAvailability(status, identity);
  const handoffs: Handoff[] = [];

  if (lineage.merge_conflict) {
    handoffs.push({ title: "Inspect competing merges", detail: "A maintainer needs to resolve the competing merges recorded in this lineage." });
  } else if (decisions.merged) {
    handoffs.push({ title: "Merge recorded", detail: "Hubnot recorded a merge for this exact revision." });
  } else if (lineage.closed || lineage.superseded || !observed.lineage_terminal) {
    handoffs.push({ title: "Inspect related revisions", detail: "Use Related revisions to open another candidate in this lineage." });
  } else if (decisions.rejected) {
    handoffs.push({ title: "Discuss the rejection", detail: "Check Conversation for the recorded decision and discuss a revised proposal with a maintainer." });
  }
  if (handoffs.length > 0) return { review, handoffs };

  const maintainer = identity !== null && decisions.eligible_actors.includes(identity.actor);
  for (const blocker of blockers) {
    if (blocker.key === "code") {
      handoffs.push({
        title: "Recover this revision’s code",
        detail: requirements.code.available
          ? "Ask the proposal author or a maintainer to check the published code against the signed revision."
          : "Sync the project’s Hubnot data in the terminal to retrieve the code for this exact revision.",
        command: requirements.code.available ? undefined : "hn sync",
      });
    } else if (blocker.key === "reviews") {
      handoffs.push({
        title: "Get qualified reviews",
        detail: `${blocker.detail} Ask an eligible reviewer to review this revision.`,
      });
    } else if (blocker.key === "protected_checks") {
      handoffs.push({
        title: "Get protected-check approvals",
        detail: `${blocker.detail} Ask a designated reviewer to inspect the changed protected paths in Checks.`,
      });
    } else if (blocker.key.startsWith("pipeline:")) {
      const pipeline = requirements.pipelines.find(({ name }) => `pipeline:${name}` === blocker.key);
      if (!pipeline) {
        handoffs.push({ title: blocker.label, detail: blocker.detail });
        continue;
      }
      const request = maintainer || (identity && pipeline.requesters.includes(identity.actor))
        ? "Your identity is eligible to request this pipeline."
        : "Ask a maintainer or an authorized requester to request this pipeline.";
      const runner = identity && pipeline.trusted_runners.includes(identity.actor)
        ? "Your identity is listed as a trusted runner."
        : "A trusted runner must supply a passing result for this revision.";
      handoffs.push({
        title: `Get a result for ${pipeline.name}`,
        detail: `${blocker.detail} ${request} ${runner}`,
        command: "hn run request",
      });
    } else {
      handoffs.push({ title: blocker.label, detail: blocker.detail });
    }
  }

  if (observed.acceptance.met && !decisions.accepted) {
    handoffs.push({
      title: "Get maintainer acceptance",
      detail: maintainer
        ? "Your identity is listed as a maintainer. Record the decision in the project terminal if Hubnot verifies your signing authority."
        : "Ask a maintainer to record acceptance for this revision in the project terminal.",
      command: "hn decide",
    });
  }
  if (decisions.accepted && !observed.merge.evidence_ready) {
    handoffs.push({ title: "Restore evidence before merging", detail: "Acceptance is recorded. The current evidence requirements must be met before merging." });
  }
  if (observed.merge.met) {
    handoffs.push({
      title: "Hand off the merge",
      detail: maintainer
        ? "Your identity is listed as a maintainer. Hubnot must verify the signer, target and checkout at merge time."
        : "Ask a maintainer to check the signer, target and checkout with Hubnot in the project terminal.",
      command: "hn merge",
    });
  }
  return { review, handoffs };
}

export function parseReviewInput(body: unknown): ReviewInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { proposalId, verdict, comment } = body as Record<string, unknown>;
  const candidate = typeof proposalId === "string" ? proposalId.trim() : null;
  const choice = typeof verdict === "string" ? verdict.trim() : null;
  if (!candidate || !isFullProposalId(candidate) || (choice !== "approve" && choice !== "request-changes")) return null;
  if (comment != null && typeof comment !== "string") return null;
  return { proposalId: candidate, verdict: choice, comment: comment?.trim() ?? "" };
}

const unavailable = "The review outcome could not be confirmed. Refresh this revision and check Conversation before submitting again.";

export async function writeProposalReview(repoPath: string, input: ReviewInput, run: typeof runHn) {
  const args = ["review", input.proposalId, input.verdict === "approve" ? "--approve" : "--request-changes"];
  if (input.comment) args.push("--body", input.comment);

  try {
    const result = await run(repoPath, args);
    if (result.exitCode === 0 && result.envelope.ok) {
      return { ok: true, data: result.envelope.data } as const;
    }
    if (result.exitCode < 0 || result.envelope.ok || result.envelope.error?.code === "non_json_output") {
      return { ok: false, uncertain: true, message: unavailable } as const;
    }
    const diagnostic = result.stderr.trim().replace(/^hn: /, "");
    const code = result.envelope.error?.code;
    let message = "Hubnot refused this review. Check the revision and your local identity before trying again.";
    if (diagnostic === "proposal code is unavailable; sync before reviewing") {
      message = "This revision’s code is unavailable locally. Sync the project and refresh the revision before reviewing.";
    } else if (diagnostic === "proposal code ref does not match the signed proposal") {
      message = "This revision’s code does not match its signed proposal. Ask the author or a maintainer to inspect the published code.";
    } else if (code === "admission_pending" || code === "admission_refused" || code === "permission_denied" || code === "not_found") {
      message = "Hubnot could not authorize a review for this revision. Check access and refresh the revision.";
    }
    return { ok: false, uncertain: false, message } as const;
  } catch {
    return { ok: false, uncertain: true, message: unavailable } as const;
  }
}
