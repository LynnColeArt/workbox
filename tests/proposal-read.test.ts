import assert from "node:assert/strict";
import test from "node:test";
import { createProposalReader } from "../src/lib/hn/proposal-read";
import type { RunResult } from "../src/lib/hn/runner";

const repo = "/fixture/project";
const candidate = `sha256:${"a".repeat(64)}`;
const other = `sha256:${"b".repeat(64)}`;
const actor = "c".repeat(64);
const base = "d".repeat(40);
const head = "e".repeat(40);
const consumer = "hn.consumer/1";

function success(data: unknown): RunResult {
  return { exitCode: 0, envelope: { ok: true, data }, stderr: "" };
}

function failure(code: string, exitCode = 1): RunResult {
  return { exitCode, envelope: { ok: false, data: null, error: { code, message: "/private/details" } },
    stderr: "/private/details" };
}

const discovery = {
  schema: consumer,
  capabilities: { "native.event-read": { version: 1 }, "native.proposal-read": { version: 1 } },
};

const event = {
  schema: consumer, history_scope: "visible_operative_history", id: candidate, commit: head, signature: "fixture",
  event: {
    protocol: "hn/0", kind: "proposal.open", actor, actorName: "Fixture author", sequence: 1,
    timestamp: "2026-11-11T10:00:00Z", title: "Exact candidate", base, head,
  },
};

const status = {
  schema: consumer, id: candidate, kind: "proposal.open", actor, actor_name: "Fixture author",
  title: "Exact candidate", body: "", base, head, policy: other, status: "blocked",
  current_reviews: {}, readiness: false, evidence: [],
  requirements: {
    satisfied: ["code"], missing: ["reviews", "pipeline:local-check"], code: { available: true, matches: true },
    reviews: {
      required: 2, approvals: 0, deficit: 2, satisfied: false, evidence: [],
      eligible_actors: [actor], trusted_reviewer_pool: [actor], allow_author_approval: true,
    },
    pipelines: [{
      name: "local-check", required: 1, passes: 0, deficit: 1, satisfied: false,
      trusted_runners: [actor], requesters: [actor], passed: [], failed: [],
    }],
    protected_checks: null,
  },
  lineage: {
    root: candidate, predecessor: "", successors: [], siblings: [], ancestors: [], descendants: [],
    members: [candidate], merge_events: [], merged_candidates: [],
    merged: false, superseded: false, closed: false, merge_conflict: false,
  },
  disagreements: {
    observed_change_requests: 0, qualified_change_requests: 0, observed_approvals: 0, conflicting_current_verdicts: false,
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

function fixture(result: RunResult) {
  return createProposalReader(repo, async (_cwd, [command]) => command === "capabilities" ? success(discovery) : result);
}

test("uses fixed native argv in the selected repo with request-scoped discovery", async () => {
  const calls: string[][] = [];
  const reader = createProposalReader(repo, async (cwd, args, timeout) => {
    assert.equal(cwd, repo);
    assert.ok(timeout && timeout < 30_000);
    calls.push(args);
    switch (args[0]) {
      case "capabilities": return success(discovery);
      case "proposal": return success(status);
      case "event": return success(event);
      default: {
        const data = { actor, name: "Fixture author", public_key: "fixture" };
        const envelope = { schema: "hn.identity/1", ok: true, data };
        return { exitCode: 0, envelope, stderr: "" };
      }
    }
  });
  const [evaluation, visible, identity] = await Promise.all([
    reader.status(candidate), reader.event(candidate), reader.identity(),
  ]);
  assert.deepEqual(evaluation, { ok: true, value: status });
  assert.deepEqual(visible, { ok: true, value: event });
  assert.deepEqual(identity, { ok: true, value: { actor, name: "Fixture author" } });
  assert.deepEqual(calls, [
    ["capabilities", "--json"], ["identity", "show", "--json"],
    ["proposal", "status", candidate, "--json"], ["event", "show", candidate, "--json"],
  ]);
});

test("rejects invalid full IDs without calling the native port", async () => {
  const reader = createProposalReader(repo, async () => assert.fail("Unexpected native call"));
  for (const id of ["--json", "a".repeat(64), "sha256:a", `${candidate}\n`]) {
    assert.deepEqual(await reader.status(id), { ok: false, reason: "invalid_id" });
    assert.deepEqual(await reader.event(id), { ok: false, reason: "invalid_id" });
  }
});

test("unsupported status and missing identity do not hide an independently visible event", async () => {
  const reader = createProposalReader(repo, async (_cwd, [command]) => {
    if (command === "capabilities") return success({
      ...discovery, capabilities: { "native.proposal-read": { version: 2 }, "native.event-read": { version: 1 } },
    });
    if (command === "event") return success(event);
    if (command === "identity") throw new Error("/private/identity-path");
    return assert.fail("Unexpected status read");
  });
  assert.deepEqual(await reader.status(candidate), { ok: false, reason: "unsupported" });
  assert.deepEqual(await reader.event(candidate), { ok: true, value: event });
  assert.deepEqual(await reader.identity(), { ok: false, reason: "unavailable" });
});

test("rejects evaluation for the wrong candidate, kind, scope, evidence, or malformed values", async () => {
  const review = {
    id: candidate, actor, actor_name: "Fixture reviewer", sequence: 2, kind: "review.submit",
    verdict: "approve", policy_eligible: true, protected_policy_eligible: false, subject: other,
  };
  for (const payload of [
    { ...status, id: other },
    { ...status, kind: "review.submit" },
    { ...status, base: "--ext-diff" },
    { ...status, requirements: { ...status.requirements, pipelines: [{ name: "check", deficit: "0" }] } },
    { ...status, observed_preconditions: { ...status.observed_preconditions, scope: "raw_signed_history" } },
    { ...status, current_reviews: { [actor]: review } },
  ]) {
    assert.deepEqual(await fixture(success(payload)).status(candidate), { ok: false, reason: "invalid_response" });
  }
});

test("accepts only exact selected-history proposal and evidence event shapes", async () => {
  for (const payload of [
    { ...event, id: other },
    { ...event, history_scope: "raw_signed_history" },
    { ...event, event: { ...event.event, kind: "issue.open" } },
    { ...event, event: { ...event.event, kind: "proposal.revise" } },
    { ...event, event: { ...event.event, kind: "review.submit", subject: "short", verdict: "approve" } },
  ]) {
    assert.deepEqual(await fixture(success(payload)).event(candidate), { ok: false, reason: "invalid_response" });
  }

  const review = await fixture(success({
    ...event, event: { ...event.event, kind: "review.submit", subject: other, verdict: "approve" },
  })).event(candidate);
  assert.ok(review.ok && review.value.event.kind === "review.submit");
  assert.equal(review.value.event.subject, other);
});

test("returns controlled failure reasons without native diagnostics", async () => {
  for (const [result, reason] of [
    [failure("not_found"), "not_visible"],
    [failure("permission_denied"), "not_visible"],
    [failure("admission_pending"), "not_visible"],
    [failure("repository_error"), "unavailable"],
    [failure("prose_failure", -1), "unavailable"],
    [failure("non_json_output", 0), "invalid_response"],
    [{ ...success(status), exitCode: 1 }, "invalid_response"],
  ] as const) {
    assert.deepEqual(await fixture(result).status(candidate), { ok: false, reason });
    assert.deepEqual(await fixture(result).event(candidate), { ok: false, reason });
  }
});

test("old CLI prose cannot advertise support and invalid identity schema cannot expose data", async () => {
  let invoked = 0;
  const reader = createProposalReader(repo, async () => {
    invoked++;
    return success({ prose: "Older binary output" });
  });
  assert.deepEqual(await reader.status(candidate), { ok: false, reason: "unsupported" });
  assert.deepEqual(await reader.event(candidate), { ok: false, reason: "unsupported" });
  assert.equal(invoked, 1);
  assert.deepEqual(await fixture(success({ actor, name: "Fixture author" })).identity(),
    { ok: false, reason: "invalid_response" });
});
