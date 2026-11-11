import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalConversation } from "../src/components/proposal-conversation";
import { ProposalDetailHeader } from "../src/components/proposal-detail-header";
import type { createProposalReader, VisibleProposalEvent } from "../src/lib/hn/proposal-read";
import { readProposalConversation } from "../src/lib/workbox/proposal-conversation";
import type { ProposalCandidate } from "../src/lib/workbox/proposal-detail";

const id = (n: number) => `sha256:${n.toString(16).padStart(64, "0")}`;
const project = { id: "fixture/project", name: "Fixture", description: "", repoPath: "/unused" };
const candidate = (n: number, title: string): ProposalCandidate => ({
  id: id(n), title, body: "", base: "a".repeat(40), head: "b".repeat(40),
  kind: n === 1 ? "proposal.open" : "proposal.revise",
  actor: "a".repeat(64), actorName: "Author", status: null,
});
const original = candidate(1, "Original");
const selected = candidate(2, "Selected");
const sibling = candidate(3, "Sibling");

type Event = VisibleProposalEvent["event"];
type Fields = Pick<Event, "actor" | "actorName" | "protocol" | "sequence" | "timestamp">;
type Payload<T = Event> = T extends Event ? Omit<T, keyof Fields> : never;

test("Conversation rechecks visible subjects and keeps late and sibling evidence on their own revisions", async (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("CREATE TABLE events (project_id TEXT, verified INTEGER, event_id TEXT, kind TEXT, subject TEXT, timestamp TEXT)");
  const insert = db.prepare("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)");
  const visible = new Map<string, VisibleProposalEvent>();
  const reads = new Set<string>();
  function add(n: number, payload: Payload, hintSubject?: string) {
    const event = {
      ...payload,
      actor: selected.actor, actorName: "Signer", protocol: "hn/0",
      sequence: n, timestamp: `2026-01-01T00:${String(n).padStart(2, "0")}:00Z`,
    } satisfies Event;
    visible.set(id(n), {
      id: id(n), commit: selected.head, signature: "fixture",
      schema: "hn.consumer/1", history_scope: "visible_operative_history", event,
    });
    insert.run(project.id, 1, id(n), event.kind, hintSubject ?? ("subject" in event ? event.subject : null), event.timestamp);
  }
  const reader: Pick<ReturnType<typeof createProposalReader>, "event"> = {
    async event(eventId) {
      reads.add(eventId);
      const event = visible.get(eventId);
      return event ? { ok: true, value: event } : { ok: false, reason: "not_visible" };
    },
  };

  add(1, { kind: "proposal.open", title: original.title, base: original.base, head: original.head });
  add(2, { kind: "proposal.revise", subject: original.id, base: selected.base, head: selected.head });
  add(3, { kind: "proposal.revise", subject: original.id, base: sibling.base, head: sibling.head });
  add(4, { kind: "review.submit", subject: original.id, verdict: "approve", body: "Late predecessor review" }, selected.id);
  add(5, { kind: "proposal.decision", subject: sibling.id, policy: id(30), verdict: "accept", body: "Sibling decision" });
  add(6, { kind: "run.request", subject: selected.id, pipeline: "build", definition: id(40), commit: selected.head });
  add(7, { kind: "run.result", subject: id(6), pipeline: "build", definition: id(40), commit: selected.head, outcome: "passed" });
  add(8, { kind: "run.result", subject: id(10), pipeline: "hidden", definition: id(40), commit: selected.head, outcome: "passed" }, id(6));
  add(9, { kind: "review.submit", subject: id(20), verdict: "approve", body: "Hidden candidate" }, selected.id);
  insert.run(project.id, 1, id(10), "run.request", selected.id, "2026-01-01T00:10:00Z");
  insert.run(project.id, 0, id(11), "review.submit", selected.id, "2026-01-01T00:11:00Z");
  insert.run("other", 1, id(12), "review.submit", selected.id, "2026-01-01T00:12:00Z");
  insert.run(project.id, 1, id(13), "run.result", id(10), "2026-01-01T00:13:00Z");

  const conversation = await readProposalConversation(db, project, selected, [original, sibling], reader);
  const subjects = Object.fromEntries(conversation.entries.map(({ record, candidateId }) => [record.id, candidateId]));
  assert.equal(subjects[id(4)], original.id);
  assert.equal(subjects[id(5)], sibling.id);
  assert.equal(subjects[id(6)], selected.id);
  assert.equal(subjects[id(7)], selected.id);
  for (const n of [8, 9, 10, 11, 12, 13, 20]) assert.equal(subjects[id(n)], undefined);
  for (const n of [11, 12, 13, 20]) assert.equal(reads.has(id(n)), false);

  const onOriginal = await readProposalConversation(db, project, original, [selected, sibling], reader);
  assert.deepEqual(onOriginal.entries, conversation.entries);
  const markup = renderToStaticMarkup(createElement(ProposalConversation, {
    projectId: project.id, candidate: selected, conversation,
  }));
  assert.match(markup, /Late predecessor review/);
  assert.match(markup, /Sibling decision/);
  assert.match(markup, /Run passed/);
  assert.match(markup, /Other revisions/);
  assert.doesNotMatch(markup, /Hidden candidate/);
  for (const n of [8, 9, 10, 20]) assert.doesNotMatch(markup, new RegExp(id(n)));
});

test("Header provides ordinary keyboard-focusable links and keeps the active view in revision URLs", () => {
  const markup = renderToStaticMarkup(createElement(ProposalDetailHeader, {
    projectId: project.id, candidate: selected, related: [original], view: "files", incomplete: true,
  }));
  assert.match(markup, /<nav aria-label="Proposal views"/);
  assert.match(markup, /aria-current="page"[^>]*>Files changed/);
  assert.match(markup, /<a [^>]*>Conversation<\/a>/);
  assert.match(markup, new RegExp(`sha256%3A${original.id.slice(7)}\\?view=files`));
  assert.match(markup, new RegExp(selected.id));
  assert.match(markup, new RegExp(selected.base));
  assert.match(markup, new RegExp(selected.head));
  assert.doesNotMatch(markup, new RegExp(sibling.id));
});

test("Conversation bounds index enrichment and reports partial signed history", async (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("CREATE TABLE events (project_id TEXT, verified INTEGER, event_id TEXT, kind TEXT, subject TEXT, timestamp TEXT)");
  const insert = db.prepare("INSERT INTO events VALUES (?, 1, ?, 'review.submit', ?, '2026-01-01T00:00:00Z')");
  for (let n = 100; n < 150; n++) insert.run(project.id, id(n), selected.id);
  let reads = 0;
  const result = await readProposalConversation(db, project, selected, [], {
    async event() {
      reads++;
      return { ok: false, reason: "not_visible" };
    },
  });
  assert.equal(result.incomplete, true);
  assert.deepEqual(result.entries, []);
  assert.ok(reads < 50, `Expected a bounded lookup, made ${reads} reads`);
});
