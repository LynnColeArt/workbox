import assert from "node:assert/strict";
import test from "node:test";
import type { ProposalStatus, VisibleProposalEvent, createProposalReader } from "../src/lib/hn/proposal-read";
import { openDb } from "../src/lib/workbox/db";
import { listProposalLineages, proposalDetailHref, resolveProposalDetail } from "../src/lib/workbox/proposal-detail";

const root = `sha256:${"a".repeat(64)}`;
const first = `sha256:${"b".repeat(64)}`;
const second = `sha256:${"c".repeat(64)}`;
const hidden = `sha256:${"d".repeat(64)}`;
const evidence = `sha256:${"e".repeat(64)}`;
const actor = "f".repeat(64);
const base = "a".repeat(40);
const head = "b".repeat(40);
const project = { id: "firewalker", name: "Firewalker", repoPath: "/fixture", description: "" };
const unavailable = { ok: false, reason: "unavailable" } as const;
const notVisible = { ok: false, reason: "not_visible" } as const;

function evaluation(id: string, lineage: Partial<ProposalStatus["lineage"]> = {}): ProposalStatus {
  return {
    id,
    kind: id === root ? "proposal.open" : "proposal.revise",
    title: `Visible ${id.slice(-2)}`,
    body: "",
    base,
    head,
    actor,
    actor_name: "Fixture actor",
    lineage: {
      root,
      predecessor: id === root ? "" : root,
      successors: [],
      siblings: [],
      ancestors: [],
      descendants: [],
      members: [root, first, second],
      merged_candidates: [],
      merge_events: [],
      merged: false,
      closed: false,
      superseded: false,
      merge_conflict: false,
      ...lineage,
    },
    decisions: { rejected: false },
  } as ProposalStatus;
}

function visibleRevision(id: string): VisibleProposalEvent {
  return {
    schema: "hn.consumer/1",
    history_scope: "visible_operative_history",
    id,
    commit: head,
    signature: "fixture",
    event: {
      protocol: "hn/0",
      kind: "proposal.revise",
      subject: hidden,
      actor,
      actorName: "Fixture actor",
      base,
      head,
      sequence: 1,
      timestamp: "2026-11-11T00:00:00Z",
    },
  };
}

function nativeReader(
  statuses: Record<string, ProposalStatus>,
  events: Record<string, VisibleProposalEvent> = {},
  calls: string[] = [],
  denied: string[] = [],
): ReturnType<typeof createProposalReader> {
  return {
    async status(id) {
      calls.push(`status:${id}`);
      if (denied.includes(id)) return notVisible;
      return statuses[id] ? { ok: true, value: statuses[id] } : unavailable;
    },
    async event(id) {
      calls.push(`event:${id}`);
      if (denied.includes(id)) return notVisible;
      return events[id] ? { ok: true, value: events[id] } : unavailable;
    },
    async identity() { return unavailable; },
  };
}

test("exact links remain pinned while a lineage entry offers visible live siblings", async () => {
  using db = openDb(":memory:");
  const reader = nativeReader({
    [root]: evaluation(root, { successors: [first, second], superseded: true }),
    [first]: evaluation(first, { siblings: [second] }),
    [second]: evaluation(second, { siblings: [first] }),
  });
  const exact = await resolveProposalDetail(db, project, root, "exact", reader);
  assert.equal(exact.kind, "candidate");
  assert.equal(exact.candidate.id, root);
  assert.deepEqual(exact.related.map(({ id }) => id), [first, second]);

  const chooser = await resolveProposalDetail(db, project, root, "lineage", reader);
  assert.equal(chooser.kind, "choose");
  assert.deepEqual(chooser.candidates.map(({ id }) => id), [first, second]);
  assert.equal(chooser.incomplete, false);

  assert.equal(proposalDetailHref("a/b", root), `/p/a%2Fb/proposals/${encodeURIComponent(root)}`);
  assert.equal(proposalDetailHref(project.id, first, { mode: "lineage", view: "checks" }),
    `/p/firewalker/proposals/${encodeURIComponent(first)}?mode=lineage&view=checks`);
});

test("a lineage entry selects the only established current candidate", async () => {
  using db = openDb(":memory:");
  const reader = nativeReader({
    [root]: evaluation(root, { members: [root, first], successors: [first], superseded: true }),
    [first]: evaluation(first, { members: [root, first] }),
  });
  const result = await resolveProposalDetail(db, project, root, "lineage", reader);
  assert.equal(result.kind, "candidate");
  assert.equal(result.candidate.id, first);
  assert.deepEqual(result.related.map(({ id }) => id), [root]);
});

test("a visible successor with unavailable evaluation exposes only its own verified identity", async () => {
  using db = openDb(":memory:");
  const calls: string[] = [];
  const reader = nativeReader({}, { [first]: visibleRevision(first) }, calls, [hidden]);
  const result = await resolveProposalDetail(db, project, first, "lineage", reader);
  assert.equal(result.kind, "candidate");
  assert.equal(result.candidate.id, first);
  assert.equal(result.candidate.status, null);
  assert.deepEqual(result.related, []);
  assert.equal(result.incomplete, true);
  assert.deepEqual(calls, [`status:${first}`, `event:${first}`]);
  assert.ok(!JSON.stringify(result).includes(hidden));
  assert.deepEqual(await resolveProposalDetail(db, project, hidden, "exact", reader), { kind: "unavailable" });
  assert.deepEqual(await resolveProposalDetail(db, project, "invalid", "exact", reader), { kind: "unavailable" });
});

function addIndexHint(db: ReturnType<typeof openDb>, id: string, kind: string, timestamp: string, verified = 1, predecessor: string | null = null) {
  db.prepare(`
    INSERT INTO events (project_id, event_id, commit_sha, actor, kind, timestamp, verified, payload_json, subject)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(project.id, id, head, actor, kind, timestamp, verified, '{"title":"INDEX TITLE MUST NOT LEAK"}', predecessor);
}

test("the index supplies bounded candidate hints and verified native evidence controls list rows", async () => {
  using db = openDb(":memory:");
  db.prepare("INSERT INTO projects (id, repo_path, name) VALUES (?, ?, ?)").run(project.id, project.repoPath, project.name);
  addIndexHint(db, root, "proposal.open", "2026-11-11T00:00:00Z");
  addIndexHint(db, first, "proposal.revise", "2026-11-11T00:01:00Z", 1, root);
  addIndexHint(db, hidden, "proposal.open", "2026-11-11T00:02:00Z");
  addIndexHint(db, evidence, "proposal.decision", "2026-11-11T00:03:00Z");
  addIndexHint(db, second, "proposal.revise", "2026-11-11T00:04:00Z", 0);
  const calls: string[] = [];
  const reader = nativeReader({
    [root]: evaluation(root),
    [first]: evaluation(first),
  }, {}, calls, [hidden]);
  const result = await listProposalLineages(db, project, 0, reader);
  assert.deepEqual(result.candidates.map(({ id, title }) => ({ id, title })), [{ id: first, title: "Visible bb" }]);
  assert.equal(result.incomplete, false);
  assert.equal(result.nextOffset, null);
  assert.deepEqual(calls, [`status:${hidden}`, `status:${first}`]);
  assert.ok(!JSON.stringify(result).includes("INDEX TITLE MUST NOT LEAK"));
});

test("native failures show partial discovery and continuation stays bounded", async () => {
  using db = openDb(":memory:");
  db.prepare("INSERT INTO projects (id, repo_path, name) VALUES (?, ?, ?)").run(project.id, project.repoPath, project.name);
  for (let i = 0; i < 13; i++) {
    addIndexHint(db, `sha256:${i.toString(16).padStart(64, "0")}`, "proposal.open", "2026-11-11T00:00:00Z");
  }
  const calls: string[] = [];
  const reader = nativeReader({}, {}, calls);
  assert.deepEqual(await listProposalLineages(db, project, 0, reader), { candidates: [], incomplete: true, nextOffset: 10 });
  assert.equal(calls.length, 20);
  assert.deepEqual(await listProposalLineages(db, project, 10, reader), { candidates: [], incomplete: true, nextOffset: null });
  assert.equal(calls.length, 26);
});


test("candidate revisions share a pagination slot and do not repeat on later pages", async () => {
  using db = openDb(":memory:");
  db.prepare("INSERT INTO projects (id, repo_path, name) VALUES (?, ?, ?)").run(project.id, project.repoPath, project.name);
  addIndexHint(db, root, "proposal.open", "2026-11-11T00:00:00Z");
  addIndexHint(db, first, "proposal.revise", "2026-11-11T02:00:00Z", 1, root);
  addIndexHint(db, second, "proposal.revise", "2026-11-11T03:00:00Z", 1, first);
  const independent = Array.from({ length: 12 }, (_, i) => `sha256:${i.toString(16).padStart(64, "0")}`);
  for (const id of independent) addIndexHint(db, id, "proposal.open", "2026-11-11T01:00:00Z");
  const reader = nativeReader({
    ...Object.fromEntries(independent.map((id) => [id, evaluation(id, { root: id, members: [id] })])),
    [root]: evaluation(root),
    [first]: evaluation(first),
    [second]: evaluation(second),
  });
  const firstPage = await listProposalLineages(db, project, 0, reader);
  assert.equal(firstPage.candidates.length, 10);
  assert.equal(firstPage.candidates[0].id, second);
  assert.equal(firstPage.nextOffset, 10);
  const lastPage = await listProposalLineages(db, project, 10, reader);
  assert.deepEqual(lastPage.candidates.map(({ id }) => id), independent.slice(0, 3).reverse());
  assert.equal(lastPage.nextOffset, null);
});

function revisionChain(db: ReturnType<typeof openDb>, length: number) {
  db.prepare("INSERT INTO projects (id, repo_path, name) VALUES (?, ?, ?)").run(project.id, project.repoPath, project.name);
  const revisions = [root];
  addIndexHint(db, root, "proposal.open", "2026-11-11T00:00:00Z");
  for (let i = 1; i < length; i++) {
    const id = `sha256:${i.toString(16).padStart(64, "0")}`;
    addIndexHint(db, id, "proposal.revise", `2026-11-11T00:${String(i).padStart(2, "0")}:00Z`, 1, revisions[i - 1]);
    revisions.push(id);
  }
  return revisions;
}

test("a visible original is still listed behind three denied revisions", async () => {
  using db = openDb(":memory:");
  const revisions = revisionChain(db, 4);
  const calls: string[] = [];
  const page = await listProposalLineages(db, project, 0, nativeReader({ [root]: evaluation(root) }, {}, calls, revisions.slice(1)));
  assert.deepEqual(page.candidates.map(({ id }) => id), [root]);
  assert.equal(page.nextOffset, null);
  assert.equal(calls.length, 4);
  for (const denied of revisions.slice(1)) assert.ok(!JSON.stringify(page).includes(denied));
});

test("an opaque numeric continuation reaches an older visible revision even when the root is denied", async () => {
  using db = openDb(":memory:");
  const revisions = revisionChain(db, 7);
  const older = revisions[1];
  const denied = revisions.filter((id) => id !== older);
  const reader = nativeReader({ [older]: evaluation(older, { members: [older] }) }, {}, [], denied);
  const initial = await listProposalLineages(db, project, 0, reader);
  assert.deepEqual(initial, { candidates: [], incomplete: true, nextOffset: 0, nextHintOffset: 3 });
  const continuation = await listProposalLineages(db, project, initial.nextOffset!, reader, initial.nextHintOffset);
  assert.deepEqual(continuation.candidates.map(({ id }) => id), [older]);
  assert.equal(continuation.nextOffset, null);
});

test("a 34-member indexed lineage occupies a single slot", async () => {
  using db = openDb(":memory:");
  const revisions = revisionChain(db, 34);
  const latest = revisions.at(-1)!;
  const calls: string[] = [];
  const reader = nativeReader({
    [root]: evaluation(root),
    [latest]: evaluation(latest, { members: revisions }),
  }, {}, calls);
  const page = await listProposalLineages(db, project, 0, reader);
  assert.deepEqual(page.candidates.map(({ id }) => id), [latest]);
  assert.equal(page.nextOffset, null);
  assert.deepEqual(calls, [`status:${latest}`]);
});

test("cyclic indexed hints terminate and share a bounded partial discovery slot", async () => {
  using db = openDb(":memory:");
  db.prepare("INSERT INTO projects (id, repo_path, name) VALUES (?, ?, ?)").run(project.id, project.repoPath, project.name);
  addIndexHint(db, first, "proposal.revise", "2026-11-11T00:01:00Z", 1, second);
  addIndexHint(db, second, "proposal.revise", "2026-11-11T00:02:00Z", 1, first);
  const calls: string[] = [];
  const page = await listProposalLineages(db, project, 0, nativeReader({ [second]: evaluation(second) }, {}, calls));
  assert.deepEqual(page.candidates.map(({ id }) => id), [second]);
  assert.equal(page.incomplete, true);
  assert.equal(page.nextOffset, null);
  assert.deepEqual(calls, [`status:${second}`]);
});
