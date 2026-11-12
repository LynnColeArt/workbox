import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { openDb } from "../src/lib/workbox/db";
import type { CollaborationResult } from "../src/lib/workbox/collaboration";

const hn = resolve(process.env.WORKBOX_HN_BIN ?? "/tmp/hn");
const project = "fixture";
const skip = process.env.WORKBOX_COLLABORATION_JOURNEYS_TEST !== "1" || !existsSync(hn);

type Write = { id: string; eventId: string; actor: string; indexed: boolean; replayed: boolean; href: string };
type Discussion = {
  thread: {
    state: { body: string };
    heads: { id: string }[];
    accepted_answer?: { id: string; state: { body: string } };
  };
  replies: { id: string; heads: { id: string }[]; state: { body: string } }[];
};

function data<T>(result: CollaborationResult<T>): T {
  assert.ok(result.ok, JSON.stringify(result));
  return result.data;
}

test("production browser endpoints and MCP share discussion changes and native policy denial", { skip, timeout: 60_000 }, async t => {
  const scratch = mkdtempSync(join(tmpdir(), "workbox-collaboration-journeys-"));
  const repository = join(scratch, project);
  const database = join(scratch, "index.sqlite");
  mkdirSync(repository);
  const children: ChildProcessWithoutNullStreams[] = [];
  t.after(async () => {
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const closed = once(child, "close");
      child.kill();
      await closed;
    }));
    rmSync(scratch, { recursive: true, force: true });
  });
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(scratch, "empty-config"),
    GIT_AUTHOR_NAME: "Workbox fixture", GIT_AUTHOR_EMAIL: "workbox@example.invalid",
    GIT_COMMITTER_NAME: "Workbox fixture", GIT_COMMITTER_EMAIL: "workbox@example.invalid",
    WORKBOX_HN_BIN: hn, WORKBOX_DB_PATH: database, WORKBOX_PROJECTS_ROOT: scratch,
  };
  const command = (bin: string, args: string[]) =>
    execFileSync(bin, args, { cwd: repository, env, encoding: "utf8", timeout: 10_000 });
  command("git", ["init", "-q", "-b", "main"]);
  command(hn, ["init", "--name", "Parity signer"]);
  const actor: string = JSON.parse(command(hn, ["identity", "show", "--json"])).data.actor;
  mkdirSync(join(repository, ".hn"), { recursive: true });
  writeFileSync(join(repository, ".hn", "policy.json"), JSON.stringify({
    version: "hn.policy/0", maintainers: [actor], proposals: { requiredAccepts: 1 }, pipelines: {},
    contributions: {
      project: "sha256:" + "1".repeat(64), moderators: [actor], baseline: [],
      rules: ["issue.create", "issue.reply", "discussion.create", "discussion.reply"].map(operation => ({ operation, automatic: true })),
      limits: {
        wireBytes: 16_777_216, decodedBytes: 33_554_432, objects: 4096, events: 2048, depth: 256, milliseconds: 30000,
        window: { bytes: 268_435_456, objects: 32768, events: 16384, requests: 256 },
        retained: { bytes: 1_073_741_824, objects: 131072, events: 65536, requests: 1024 },
      },
    },
  }));
  command("git", ["add", ".hn/policy.json"]);
  command("git", ["commit", "-qm", "Set fixture policy"]);
  command(hn, ["contribution", "authority", "set", "--ref", "refs/heads/main", "--expect", "absent"]);
  {
    using db = openDb(database);
    db.prepare("INSERT INTO projects(id, name, repo_path) VALUES (?, ?, ?)").run(project, "Fixture", repository);
  }

  const server = spawn(process.execPath, [
    resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "0",
  ], { env });
  children.push(server);
  const origin = await new Promise<string>((accept, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Workbox start timed out. " + output)), 10_000);
    server.once("error", error => { clearTimeout(timeout); reject(error); });
    server.once("exit", () => { clearTimeout(timeout); reject(new Error(output)); });
    function capture(chunk: Buffer) {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url && output.includes("Ready in")) { clearTimeout(timeout); accept(url); }
    }
    server.stdout.on("data", capture);
    server.stderr.on("data", capture);
  });
  const agent = spawn(process.execPath, ["--import", "tsx", "mcp/server.ts"], { env });
  children.push(agent);
  const lines = createInterface({ input: agent.stdout })[Symbol.asyncIterator]();
  let seq = 0;
  async function mcp<T>(name: string, fields: Record<string, unknown>) {
    const id = ++seq;
    agent.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: {
      name, arguments: { project, ...fields },
    } }) + "\n");
    const line = await lines.next();
    assert.equal(line.done, false);
    const response = JSON.parse(line.value);
    assert.equal(response.id, id);
    assert.equal(response.error, undefined, JSON.stringify(response));
    return JSON.parse(response.result.content[0].text) as CollaborationResult<T>;
  }
  async function http<T>(resource: "issues" | "discussions", fields: Record<string, unknown>) {
    const response = await fetch(`${origin}/api/projects/${project}/${resource}`, {
      method: "POST", headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin" },
      body: JSON.stringify(fields), signal: t.signal,
    });
    return await response.json() as CollaborationResult<T>;
  }
  const markdown = "  **Exact Markdown**\r\n\r\n> Details\n";
  const create = { actor, operationId: "thread-open", title: "Getting started", category: "Help", body: markdown };
  const thread = data(await http<Write>("discussions", { action: "create", ...create }));
  assert.equal(thread.indexed, true);
  assert.deepEqual(data(await mcp<Write>("workbox_create_discussion", create)), { ...thread, replayed: true });
  const posted = data(await mcp<Write>("workbox_reply_discussion", {
    discussionId: thread.id, body: "Answer in **Markdown**", actor, operationId: "thread-reply",
  }));
  const detail = { discussionId: thread.id };
  const first = data(await http<Discussion>("discussions", { action: "detail", ...detail }));
  assert.equal(first.thread.state.body, markdown);
  assert.equal(first.replies[0].id, posted.id);
  assert.deepEqual(data(await mcp<Discussion>("workbox_discussion_detail", detail)), first);
  const threadPage = await fetch(origin + thread.href, { signal: t.signal });
  assert.match(await threadPage.text(), /<strong>Exact Markdown<\/strong>/);
  const replyPage = await fetch(origin + posted.href, { signal: t.signal });
  assert.match(await replyPage.text(), /Referenced reply/);

  const issue = data(await mcp<Write>("workbox_issue_action", { action: "create", actor, operationId: "issue-open", title: "Policy test", body: markdown }));
  const before = command("git", ["show-ref"]);
  for (const [resource, tool, fields] of [
    ["issues", "workbox_issue_action", { action: "close", issueId: issue.id, expected: [issue.eventId], actor, operationId: "issue-denied" }],
    ["discussions", "workbox_discussion_action", { action: "close", discussionId: thread.id, expected: thread.eventId, actor, operationId: "thread-denied" }],
  ] as const) {
    const denied = await http(resource, fields);
    assert.ok(!denied.ok);
    assert.equal(denied.error.code, "permission_denied");
    assert.deepEqual(await mcp(tool, fields), denied);
  }
  assert.equal(command("git", ["show-ref"]), before);
});
