import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalNextActions } from "../src/components/proposal-next-actions";
import type { ProposalStatus } from "../src/lib/hn/proposal-read";
import { getProposalActions, parseReviewInput, writeProposalReview } from "../src/lib/workbox/proposal-actions";
import { getProposalChecks } from "../src/lib/workbox/proposal-checks";

const candidate = `sha256:${"a".repeat(64)}`;
const sibling = `sha256:${"b".repeat(64)}`;
const actor = "c".repeat(64);
const unqualified = { actor: "d".repeat(64), name: "Local contributor" };
const identity = { actor, name: "Local reviewer" };
const commit = "e".repeat(40);
const status: ProposalStatus = {
  schema: "hn.consumer/1", id: candidate, kind: "proposal.revise", actor: unqualified.actor,
  actor_name: "Author", title: "Exact candidate", body: "", base: commit, head: commit,
  policy: candidate, status: "blocked", readiness: false, evidence: [], current_reviews: {},
  requirements: {
    satisfied: ["code"], missing: ["reviews", "pipeline:team smoke"],
    code: { available: true, matches: true },
    reviews: {
      required: 2, approvals: 1, deficit: 1, satisfied: false, evidence: [candidate],
      eligible_actors: [actor], trusted_reviewer_pool: [actor], allow_author_approval: false,
    },
    pipelines: [{
      name: "team smoke", required: 2, passes: 1, deficit: 1, satisfied: false,
      requesters: [], trusted_runners: [actor], passed: [], failed: [],
    }],
    protected_checks: null,
  },
  lineage: {
    root: sibling, predecessor: sibling, successors: [], siblings: [sibling],
    ancestors: [sibling], descendants: [], members: [sibling, candidate],
    merge_events: [], merged_candidates: [], merged: false, superseded: false, closed: false, merge_conflict: false,
  },
  disagreements: {
    observed_change_requests: 0, qualified_change_requests: 0, observed_approvals: 1, conflicting_current_verdicts: false,
  },
  decisions: {
    eligible_actors: [actor], required_accepts: 1, accepts: [], rejects: [], accept_deficit: 1,
    accepted: false, rejected: false, merged: false, merge_events: [],
  },
  observed_preconditions: {
    scope: "selected_history_evidence_and_lineage_only", lineage_terminal: true,
    acceptance: { met: false, evidence_ready: false, not_merged: true },
    merge: { met: false, evidence_ready: false, accepted: false, not_rejected: true, not_merged: true },
  },
};

test("qualifies ordinary and protected approval separately from review submission", () => {
  const checks = getProposalChecks({
    ...status,
    requirements: {
      ...status.requirements,
      protected_checks: { ...status.requirements.reviews, applies: true, paths: ["ci/"], changed_paths: ["ci/check"] },
    },
  });
  const known = getProposalActions(checks, identity);
  assert.equal(known.review.available, true);
  assert.match(known.review.detail, /both ordinary reviews and protected checks/);
  const feedback = getProposalActions(checks, unqualified);
  assert.equal(feedback.review.available, true);
  assert.match(feedback.review.detail, /submit feedback.*eligible reviewers/);
  const unknown = getProposalActions(checks, null);
  assert.equal(unknown.review.available, false);
  assert.match(unknown.review.detail, /could not verify your local Hubnot identity/);
  assert.deepEqual(known.handoffs.map(({ command }) => command), [undefined, "hn run request"]);
  assert.match(known.handoffs[1].detail, /eligible to request.*listed as a trusted runner/);
  assert.match(feedback.handoffs[1].detail, /authorized requester.*trusted runner/);
});

test("offers role-specific terminal handoffs only as the exact revision advances", () => {
  const acceptedButStale: ProposalStatus = {
    ...status, status: "accepted",
    decisions: { ...status.decisions, accepted: true, accepts: [candidate], accept_deficit: 0 },
    observed_preconditions: {
      ...status.observed_preconditions,
      merge: { ...status.observed_preconditions.merge, accepted: true },
    },
  };
  const stale = getProposalActions(getProposalChecks(acceptedButStale), identity);
  assert.equal(stale.review.available, true);
  assert.ok(stale.handoffs.some(({ title }) => title === "Restore evidence before merging"));
  assert.ok(!stale.handoffs.some(({ command }) => command === "hn merge"));
  const decisionReady: ProposalStatus = {
    ...status, readiness: true, status: "ready for decision",
    requirements: { ...status.requirements, missing: [] },
    observed_preconditions: {
      ...status.observed_preconditions,
      acceptance: { ...status.observed_preconditions.acceptance, met: true, evidence_ready: true },
    },
  };
  const decision = getProposalActions(getProposalChecks(decisionReady), identity);
  assert.deepEqual(decision.handoffs.map(({ command }) => command), ["hn decide"]);
  const acceptedReady: ProposalStatus = {
    ...decisionReady, status: "accepted", decisions: acceptedButStale.decisions,
    observed_preconditions: {
      ...decisionReady.observed_preconditions,
      merge: { ...status.observed_preconditions.merge, met: true, evidence_ready: true, accepted: true },
    },
  };
  const merge = getProposalActions(getProposalChecks(acceptedReady), unqualified);
  assert.deepEqual(merge.handoffs.map(({ command }) => command), ["hn merge"]);
  assert.match(merge.handoffs[0].detail, /Ask a maintainer.*signer, target and checkout/);
});

test("disables review when status or code is unavailable or the revision is superseded", () => {
  const unavailable = getProposalActions(getProposalChecks(null), identity);
  assert.equal(unavailable.review.available, false);
  const missingCode: ProposalStatus = {
    ...status,
    requirements: {
      ...status.requirements, missing: ["code"], code: { available: false, matches: false },
    },
  };
  const recover = getProposalActions(getProposalChecks(missingCode), identity);
  assert.equal(recover.review.available, false);
  assert.equal(recover.handoffs[0].command, "hn sync");
  const superseded: ProposalStatus = {
    ...status, status: "superseded",
    lineage: { ...status.lineage, superseded: true },
    observed_preconditions: { ...status.observed_preconditions, lineage_terminal: false },
  };
  const historical = getProposalActions(getProposalChecks(superseded), identity);
  assert.equal(historical.review.available, false);
  assert.deepEqual(historical.handoffs.map(({ title }) => title), ["Inspect related revisions"]);
  const markup = renderToStaticMarkup(createElement(ProposalNextActions, {
    projectId: "firewalker", checks: getProposalChecks(null), identity,
  }));
  assert.match(markup, /<button[^>]+disabled="">Review/);
});

test("passes the pinned full candidate and note to the native writer exactly once", async () => {
  const input = parseReviewInput({ proposalId: candidate, verdict: "request-changes", comment: "Please revise." });
  assert.ok(input);
  let calls = 0;
  const result = await writeProposalReview("/fixture", input, async (path, args) => {
    calls++;
    assert.equal(path, "/fixture");
    assert.deepEqual(args, ["review", candidate, "--request-changes", "--body", "Please revise."]);
    assert.ok(!args.includes(sibling));
    return { exitCode: 0, envelope: { ok: true, data: { prose: "Recorded review" } }, stderr: "" };
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: true, data: { prose: "Recorded review" } });
  assert.equal(parseReviewInput({ proposalId: candidate.slice(0, 14), verdict: "approve" }), null);
  assert.equal(parseReviewInput({ proposalId: candidate, verdict: "accept" }), null);
  assert.equal(parseReviewInput(null), null);
  assert.deepEqual(parseReviewInput({ proposalId: candidate, verdict: "approve" }), {
    proposalId: candidate, verdict: "approve", comment: "",
  });
});

test("reports a controlled refusal or uncertain outcome without replay or raw diagnostics", async () => {
  const input = parseReviewInput({ proposalId: candidate, verdict: "approve" });
  assert.ok(input);
  const rejected = await writeProposalReview("/fixture", input, async () => ({
    exitCode: 1, envelope: { ok: false, data: null }, stderr: "hn: proposal code is unavailable; sync before reviewing\n",
  }));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.uncertain, false);
  assert.match(rejected.message, /Sync the project and refresh/);
  let calls = 0;
  const unknown = await writeProposalReview("/fixture", input, async () => {
    calls++;
    throw new Error("/private/signer/key");
  });
  assert.equal(calls, 1);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.uncertain, true);
  assert.match(unknown.message, /Refresh this revision and check Conversation/);
  assert.doesNotMatch(unknown.message, /private/);
});
