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
  assert.equal((await runDiscussionOperation("fixture", { action: "reply", ...contextual })).ok, false);
});
