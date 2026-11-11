import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalChecks, ProposalStageSummary } from "../src/components/proposal-checks";
import type { ProposalStatus } from "../src/lib/hn/proposal-read";
import { getProposalChecks } from "../src/lib/workbox/proposal-checks";

const id = `sha256:${"a".repeat(64)}`;
const actor = "b".repeat(64);
const commit = "c".repeat(40);
const reviews = {
  required: 2, approvals: 1, deficit: 1, satisfied: false, evidence: [id],
  eligible_actors: [actor], trusted_reviewer_pool: [actor], allow_author_approval: false,
};
const evaluation: ProposalStatus = {
  schema: "hn.consumer/1", id, kind: "proposal.open", actor, actor_name: "Author",
  title: "Exact proposal", body: "", base: commit, head: commit, policy: id,
  status: "blocked", readiness: false, evidence: [], current_reviews: {},
  requirements: {
    satisfied: ["code"], missing: ["reviews", "pipeline:Integration smoke", "protected_checks"],
    code: { available: true, matches: true }, reviews,
    pipelines: [{
      name: "Integration smoke", required: 3, passes: 1, deficit: 2, satisfied: false,
      trusted_runners: [actor], requesters: [actor], passed: [], failed: [],
    }],
    protected_checks: {
      ...reviews, applies: true, paths: ["ci/"], changed_paths: ["ci/check.json"],
      required: 3, approvals: 0, deficit: 3, evidence: [],
    },
  },
  lineage: {
    root: id, predecessor: "", successors: [], siblings: [], ancestors: [], descendants: [],
    members: [id], merge_events: [], merged_candidates: [],
    merged: false, superseded: false, closed: false, merge_conflict: false,
  },
  disagreements: {
    observed_approvals: 3, observed_change_requests: 2, qualified_change_requests: 1,
    conflicting_current_verdicts: true,
  },
  decisions: {
    eligible_actors: [actor], required_accepts: 2, accepts: [id], rejects: [],
    accept_deficit: 1, accepted: false, rejected: false, merged: false, merge_events: [],
  },
  observed_preconditions: {
    scope: "selected_history_evidence_and_lineage_only", lineage_terminal: true,
    acceptance: { met: false, evidence_ready: false, not_merged: true },
    merge: { met: false, evidence_ready: false, accepted: false, not_rejected: true, not_merged: true },
  },
};

const checksMarkup = (status: ProposalStatus | null) =>
  renderToStaticMarkup(createElement(ProposalChecks, { checks: getProposalChecks(status) }));

const summaryMarkup = (status: ProposalStatus | null) =>
  renderToStaticMarkup(createElement(ProposalStageSummary, { checks: getProposalChecks(status) }));

test("shows native deficits, named pipelines and protected paths on the exact candidate", () => {
  const checks = getProposalChecks(evaluation);
  assert.equal(checks.kind, "evaluated");
  assert.equal(checks.status.id, id);
  assert.deepEqual(checks.blockers.map((row) => row.key), evaluation.requirements.missing);
  const markup = checksMarkup(evaluation);
  assert.match(markup, /1 of 2 qualified approvals.*1 more needed/);
  assert.match(markup, /Integration smoke.*1 of 3 qualified passes.*2 more needed/);
  assert.match(markup, /Protected checks.*0 of 3 qualified approvals.*3 more needed.*ci\/check\.json/);
  assert.match(markup, /3 approvals observed/);
  assert.match(markup, /2 change requests observed.*1 policy-eligible/);
  assert.match(summaryMarkup(evaluation), /1 of 2 qualified acceptances.*1 more needed/);
});

test("keeps recorded acceptance when evidence is no longer ready", () => {
  const status: ProposalStatus = {
    ...evaluation,
    status: "accepted",
    decisions: { ...evaluation.decisions, accepted: true, accept_deficit: 0, accepts: [id, id] },
    observed_preconditions: {
      ...evaluation.observed_preconditions,
      merge: { ...evaluation.observed_preconditions.merge, accepted: true },
    },
  };
  const markup = summaryMarkup(status);
  assert.match(markup, /Evidence readiness.*Blocked/);
  assert.match(markup, /Maintainer decision.*Accepted/);
  assert.match(markup, /Merge.*Waiting for evidence/);
  assert.doesNotMatch(markup, /Observed merge conditions met/);
});

test("retains evidence readiness for a superseded revision and gates both later stages", () => {
  const status: ProposalStatus = {
    ...evaluation,
    readiness: true, status: "superseded",
    requirements: {
      ...evaluation.requirements,
      missing: [], pipelines: [], protected_checks: null,
      reviews: { ...reviews, approvals: 2, deficit: 0, satisfied: true },
    },
    lineage: { ...evaluation.lineage, superseded: true },
    observed_preconditions: {
      ...evaluation.observed_preconditions,
      lineage_terminal: false,
      acceptance: { ...evaluation.observed_preconditions.acceptance, evidence_ready: true },
      merge: { ...evaluation.observed_preconditions.merge, evidence_ready: true },
    },
  };
  const checks = getProposalChecks(status);
  assert.equal(checks.kind, "evaluated");
  assert.deepEqual(checks.blockers, []);
  assert.match(summaryMarkup(status), /Evidence readiness.*Ready.*Superseded.*Superseded/);
  assert.doesNotMatch(checksMarkup(status), /Protected checks/);
});

test("renders unavailable evaluation and code without a positive readiness claim", () => {
  assert.equal(getProposalChecks(null).kind, "unavailable");
  assert.match(summaryMarkup(null), /Evidence readiness.*Unknown/);
  assert.match(checksMarkup(null), /Hubnot’s evaluation for this revision is unavailable/);
  assert.doesNotMatch(checksMarkup(null), /Satisfied|Observed merge conditions met/);
  const missingCode: ProposalStatus = {
    ...evaluation,
    requirements: {
      ...evaluation.requirements, satisfied: [], missing: ["code", ...evaluation.requirements.missing],
      code: { available: false, matches: false },
    },
  };
  assert.match(checksMarkup(missingCode), /Code match.*code is unavailable locally.*Unknown/);
  assert.match(summaryMarkup(missingCode), /Evidence readiness.*Unknown/);
});

test("shows non-applicable protection and leaves readiness and merge preconditions to Hubnot", () => {
  const status: ProposalStatus = {
    ...evaluation,
    readiness: true, status: "accepted",
    requirements: {
      ...evaluation.requirements,
      missing: [],
      reviews: { ...reviews, approvals: 2, deficit: 0, satisfied: true },
      pipelines: [],
      protected_checks: {
        ...reviews, applies: false, paths: ["ci/"], changed_paths: [],
        satisfied: true, deficit: 0,
      },
    },
    decisions: { ...evaluation.decisions, accepted: true, accept_deficit: 0, accepts: [id, id] },
    observed_preconditions: {
      ...evaluation.observed_preconditions,
      acceptance: { met: true, evidence_ready: true, not_merged: true },
      merge: { met: true, evidence_ready: true, accepted: true, not_rejected: true, not_merged: true },
    },
  };
  const checks = getProposalChecks(status);
  assert.equal(checks.kind, "evaluated");
  assert.deepEqual(checks.blockers, []);
  const markup = checksMarkup(status);
  assert.match(markup, /Protected checks.*changes no protected paths.*Not applicable/);
  assert.match(markup, /2 change requests observed.*1 policy-eligible/);
  assert.match(summaryMarkup(status), /Observed merge conditions met.*Hubnot checks the actor and checkout/);

  const conflicted: ProposalStatus = {
    ...status,
    status: "merge conflict",
    lineage: { ...status.lineage, merged: true, merge_conflict: true },
    decisions: { ...status.decisions, merged: true, merge_events: [id] },
    observed_preconditions: {
      ...status.observed_preconditions,
      lineage_terminal: false,
      acceptance: { ...status.observed_preconditions.acceptance, met: false, not_merged: false },
      merge: { ...status.observed_preconditions.merge, met: false, not_merged: false },
    },
  };
  assert.match(summaryMarkup(conflicted), /Merge conflict.*recorded a merge.*competing merge/);
});
