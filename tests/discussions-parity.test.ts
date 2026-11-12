import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { discussionTools } from "../mcp/discussions";
import { HN_BIN } from "../src/lib/hn/runner";
import { runDiscussionOperation } from "../src/lib/workbox/discussions";
import { openDb } from "../src/lib/workbox/db";

test("discussion reads and replies share native state, paging and operation replay", {
  skip: !existsSync(HN_BIN) && "Hubnot binary unavailable",
}, async t => {
  const dir = mkdtempSync(join(tmpdir(), "workbox-discussion-parity-"));
  const old = process.env.WORKBOX_DB_PATH;
  process.env.WORKBOX_DB_PATH = join(dir, "index.sqlite");
  t.after(() => {
    if (old === undefined) delete process.env.WORKBOX_DB_PATH;
    else process.env.WORKBOX_DB_PATH = old;
    rmSync(dir, { recursive: true, force: true });
  });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync(HN_BIN, ["init", "--name", "Discussion fixture"], { cwd: dir });
  const actor = JSON.parse(execFileSync(HN_BIN, ["identity", "show", "--json"], { cwd: dir, encoding: "utf8" })).data.actor;
  using db = openDb();
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run("fixture", "Fixture", dir);

  const byMcp = (name: string, input: Record<string, unknown>) => {
    const tool = discussionTools.find(tool => tool.name === name);
    assert.ok(tool);
    return tool.call({ project: "fixture", ...input });
  };
  const openInput = { title: "Help with setup", category: "Questions", body: "  **Markdown**\n", actor, operationId: "open-thread" };
  const browser = await runDiscussionOperation("fixture", { action: "create", ...openInput }, true);
  assert.ok(browser.ok && browser.data.kind === "mutation");
  assert.equal(browser.data.indexed, true);
  assert.deepEqual(await byMcp("workbox_create_discussion", openInput), { ok: true, data: { ...browser.data, replayed: true } });
  const discussionId = browser.data.id;
  const first = await byMcp("workbox_reply_discussion", { discussionId, actor, operationId: "reply-one", body: "First reply" });
  assert.ok(first.ok);
  const replyTo = (first.data as { id: string }).id;
  const contextual = { discussionId, actor, operationId: "reply-two", replyTo, body: "Second reply" };
  const posted = await runDiscussionOperation("fixture", { action: "reply", ...contextual }, true);
  assert.ok(posted.ok && posted.data.kind === "mutation");
  assert.deepEqual(await byMcp("workbox_reply_discussion", contextual), { ok: true, data: { ...posted.data, replayed: true } });

  const oversized = { schema: "hn.discussion/1", title: "T".repeat(513), category: "S".repeat(129),
    body: " ".repeat(60_001) + "Markdown", status: "open" };
  execFileSync(HN_BIN, ["discussion", "open", "--input", "-", "--json"], {
    cwd: dir, input: JSON.stringify(oversized),
  });
  const nativeList = await runDiscussionOperation("fixture", { action: "list" });
  assert.ok(nativeList.ok && nativeList.data.kind === "list");
  assert.equal(nativeList.data.items.find(item => item.state?.title === oversized.title)?.state?.body, oversized.body);
  const filters = { category: "questions", status: "open" };
  assert.deepEqual(await byMcp("workbox_list_discussions", filters),
    await runDiscussionOperation("fixture", { action: "list", ...filters }));
  const firstPage = await runDiscussionOperation("fixture", { action: "detail", discussionId, limit: 1 });
  assert.ok(firstPage.ok && firstPage.data.kind === "detail");
  assert.equal(firstPage.data.thread.state?.body, openInput.body);
  assert.equal(firstPage.data.thread.reply_count, 2);
  assert.ok(firstPage.data.nextCursor);
  const next = { discussionId, limit: 1, cursor: firstPage.data.nextCursor };
  const secondPage = await runDiscussionOperation("fixture", { action: "detail", ...next });
  assert.deepEqual(await byMcp("workbox_discussion_detail", next), secondPage);
  assert.ok(secondPage.ok && secondPage.data.kind === "detail");
  assert.ok([...firstPage.data.replies, ...secondPage.data.replies].some(reply => reply.state?.reply_to === replyTo));
  const context = await runDiscussionOperation("fixture", { action: "detail", discussionId, replyId: replyTo, limit: 1 });
  assert.ok(context.ok && context.data.kind === "detail");
  assert.equal(context.data.contextReply?.id, replyTo);
  assert.match(posted.data.href, /reply=.*#reply-context$/);
  const update = async (action: string, operationId: string, fields: Record<string, unknown>) => {
    const request = { action, operationId, discussionId, actor, ...fields };
    const result = await byMcp("workbox_discussion_action", request);
    assert.ok(result.ok, JSON.stringify(result));
    const outcome = result.data as { id: string; eventId: string; indexed: boolean; replayed: boolean };
    assert.equal(outcome.indexed, true);
    assert.deepEqual(await runDiscussionOperation("fixture", request, true),
      { ok: true, data: { ...outcome, replayed: true } });
    return outcome.eventId;
  };

  const initialReply = [...firstPage.data.replies, ...secondPage.data.replies].find(reply => reply.id === replyTo);
  assert.ok(initialReply);
  const replyRevision = initialReply.heads[0].id;
  const answer = await update("answer", "mark-answer", { expected: discussionId, replyRevision });
  await update("editReply", "edit-reply", { expected: replyRevision, replyId: replyTo, body: "Edited reply" });
  const answered = await runDiscussionOperation("fixture", { action: "detail", discussionId });
  assert.ok(answered.ok && answered.data.kind === "detail");
  assert.equal(answered.data.thread.accepted_answer?.id, replyRevision);
  assert.equal(answered.data.thread.accepted_answer?.state.body, "First reply");
  assert.equal(answered.data.replies.find(reply => reply.id === replyTo)?.state?.body, "Edited reply");

  const cleared = await update("answer", "clear-answer", { expected: answer, replyRevision: null });
  const revised = await update("revise", "revise-thread", { expected: cleared, title: "Updated", category: "Help", body: openInput.body });
  const closed = await update("close", "close-thread", { expected: revised });
  await update("reopen", "reopen-thread", { expected: closed });
  const stale = await byMcp("workbox_discussion_action", {
    action: "close", discussionId, actor, operationId: "stale", expected: cleared,
  });
  assert.ok(!stale.ok);
  assert.equal(stale.error.code, "stale_revision");
  const fresh = await runDiscussionOperation("fixture", { action: "detail", discussionId });
  assert.ok(fresh.ok && fresh.data.kind === "detail");
  assert.equal(fresh.data.thread.state?.category, "Help");
  assert.equal(fresh.data.thread.state?.status, "open");
  assert.equal(fresh.data.thread.accepted_answer, undefined);
  assert.equal((await runDiscussionOperation("fixture", { action: "reply", ...contextual })).ok, false);
});
