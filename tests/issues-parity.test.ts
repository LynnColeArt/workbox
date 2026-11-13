import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import type { CollaborationResult } from "../src/lib/workbox/collaboration";
import type { IssueDetails, IssueList } from "../src/lib/workbox/issues";
import { openDb } from "../src/lib/workbox/db";

const hn = resolve(process.env.WORKBOX_HN_BIN ?? "/tmp/hn");
const skip = process.env.WORKBOX_ISSUES_PARITY_TEST !== "1" || !existsSync(hn);
const project = "fixture";
type Written = { eventId: string; issueId: string; number: number; indexed: boolean; replayed: boolean; href: string };

function data<T>(result: CollaborationResult<T>) {
  assert.ok(result.ok, JSON.stringify(result));
  return result.data;
}

test("signed issue lifecycle, synced conflicts and Markdown match production browser and MCP", { skip, timeout: 60_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "workbox-issue-parity-"));
  const children: ChildProcessWithoutNullStreams[] = [];
  t.after(async () => {
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const closed = once(child, "close");
      child.kill();
      await closed;
    }));
    rmSync(directory, { recursive: true, force: true });
  });
  const repository = join(directory, "repo");
  const peer = join(directory, "peer");
  mkdirSync(repository);
  const dbPath = join(directory, "index.sqlite");
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(directory, "empty-git-config"),
    GIT_AUTHOR_NAME: "Issue parity",
    GIT_AUTHOR_EMAIL: "issues@example.invalid",
    GIT_COMMITTER_NAME: "Issue parity",
    GIT_COMMITTER_EMAIL: "issues@example.invalid",
    WORKBOX_DB_PATH: dbPath,
    WORKBOX_HN_BIN: hn,
  };
  function command(cwd: string, bin: string, args: string[], input?: string) {
    return execFileSync(bin, args, { cwd, env, encoding: "utf8", timeout: 10_000, input });
  }
  command(repository, "git", ["init", "-q", "-b", "main"]);
  command(repository, "git", ["commit", "--allow-empty", "-qm", "Start"]);
  command(repository, hn, ["init", "--name", "Issue owner"]);
  {
    using db = openDb(dbPath);
    db.prepare("INSERT INTO projects(id, name, repo_path) VALUES(?, ?, ?)").run(project, "Issue fixture", repository);
  }

  const browser = spawn(process.execPath, [
    resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "0",
  ], { env });
  children.push(browser);
  const origin = await new Promise<string>((accept, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Workbox did not start. " + output)), 10_000);
    browser.once("error", error => { clearTimeout(timer); reject(error); });
    browser.once("exit", () => { clearTimeout(timer); reject(new Error(output)); });
    browser.stderr.on("data", chunk => { output += chunk; });
    browser.stdout.on("data", chunk => {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url && output.includes("Ready in")) { clearTimeout(timer); accept(url); }
    });
  });

  const agent = spawn(process.execPath, ["--import", "tsx", "mcp/server.ts"], { env });
  children.push(agent);
  const replies = createInterface({ input: agent.stdout })[Symbol.asyncIterator]();
  let id = 0;
  async function mcp<T>(name: string, args: Record<string, unknown>) {
    const request = ++id;
    agent.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: request, method: "tools/call", params: { name, arguments: args } }) + "\n");
    const line = await replies.next();
    assert.equal(line.done, false);
    const reply = JSON.parse(line.value);
    assert.equal(reply.id, request);
    assert.equal(reply.error, undefined, JSON.stringify(reply));
    return JSON.parse(reply.result.content[0].text) as T;
  }

  async function post<T>(input: Record<string, unknown>, path = `/api/projects/${project}/issues`, headers: Record<string, string> = {}) {
    const response = await fetch(origin + path, {
      method: "POST", headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(input), signal: t.signal,
    });
    return { status: response.status, result: await response.json() as T };
  }
  const http = async <T>(input: Record<string, unknown>) => (await post<CollaborationResult<T>>(input)).result;
  const action = (input: Record<string, unknown>) => mcp<CollaborationResult<Written>>("workbox_issue_action", { project, ...input });
  const show = (issueId: string | number) => http<IssueDetails>({ action: "detail", issueId });
  async function markup(path: string) {
    const response = await fetch(origin + path, { signal: t.signal });
    assert.equal(response.status, 200);
    return (await response.text()).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
  }
  const initial = data(await http<IssueList>({ action: "list" }));
  assert.ok(initial.signer.available);
  const { actor } = initial.signer.identity;
  const source = "  **Keep this**\r\n\r\n- Markdown\n";
  const create = { action: "create", actor, operationId: "issue-open", title: "Issue lifecycle", body: source, labels: [" bug "] };
  const opened = data(await http<Written>(create));
  assert.ok(opened.indexed);
  assert.equal(opened.number, 1);
  assert.deepEqual(data(await action(create)), { ...opened, replayed: true });
  assert.deepEqual(
    await post({ source }, "/api/markdown").then(value => value.result),
    await mcp("workbox_preview_markdown", { source }),
  );
  const list = { q: "#1", label: " bug ", status: "open", limit: 1 };
  const filtered = await http<IssueList>({ ...list, action: "list" });
  assert.deepEqual(filtered, await mcp("workbox_list_issues", { project, ...list }));
  assert.equal(data(filtered).items[0].issueId, opened.issueId);
  const filteredMarkup = await markup(`/p/${project}/issues?q=%231&label=%20bug%20&status=open`);
  assert.match(filteredMarkup, /Issue lifecycle/);
  assert.match(filteredMarkup, /aria-label="Clear label filter:  bug "/);
  assert.match(filteredMarkup, /href="[^"]*q=%231&amp;label=&amp;status=open"/);
  assert.equal(data(filtered).filters.label, " bug ");
  assert.match(await markup(opened.href), /<strong>Keep this<\/strong>/);
  const detail = data(await show(opened.issueId));
  assert.equal(detail.state?.body, source);
  assert.deepEqual(detail.state?.labels, [" bug "]);
  assert.deepEqual(await mcp("workbox_issue_detail", { project, issueId: opened.number }), { ok: true, data: detail });

  const comment = { action: "comment", issueId: opened.issueId, body: source, actor, operationId: "issue-comment" };
  const denied = { ...comment, actor: "0".repeat(64) };
  assert.deepEqual(await http(denied), await action(denied));
  assert.equal((await post(comment, undefined, { origin: "https://foreign.example" })).status, 403);
  const posted = data(await action(comment));
  assert.deepEqual(data(await http<Written>(comment)), { ...posted, replayed: true });
  assert.equal(data(await show(opened.issueId)).comments[0].body, source);
  const revise = { action: "revise", issueId: opened.issueId, actor, operationId: "issue-revise",
    expected: [opened.eventId], title: "Revised issue", labels: ["fixed"] };
  const revised = data(await http<Written>(revise));
  assert.deepEqual(data(await action(revise)), { ...revised, replayed: true });
  const close = { action: "close", issueId: opened.issueId, actor, operationId: "issue-close", expected: [revised.eventId] };
  const stale = { ...close, expected: [opened.eventId] };
  const refusal = await http(stale);
  assert.deepEqual(refusal, await action(stale));
  assert.ok(!refusal.ok && refusal.error.code === "stale_revision");
  const closed = data(await action(close));
  assert.equal(data(await show(opened.issueId)).state?.status, "closed");
  const reopened = data(await http<Written>({ ...close, action: "reopen", operationId: "issue-reopen", expected: [closed.eventId] }));
  assert.equal(data(await show(opened.issueId)).state?.status, "open");

  command(directory, "git", ["clone", "-q", "--no-local", repository, peer]);
  command(peer, "git", ["fetch", "-q", repository, "+refs/hn/actors/*:refs/hn/actors/*"]);
  command(peer, hn, ["init", "--name", "Peer"]);
  const peerActor = JSON.parse(command(peer, hn, ["identity", "show", "--json"])).data.actor;
  const synced = JSON.parse(command(peer, hn, ["issue", "open", "--json", "Synced issue"])).data.issue_id;
  command(peer, hn, ["issue", "revise", opened.issueId, "--expect", reopened.eventId, "--input", "-", "--json"],
    JSON.stringify({ title: "Peer revision", body: "Peer proposal", labels: ["peer"] }));
  data(await http<Written>({ ...revise, operationId: "local-revision", expected: [reopened.eventId], title: "Local revision" }));
  command(repository, "git", ["fetch", "-q", peer, `refs/hn/actors/${peerActor}:refs/hn/actors/${peerActor}`]);
  assert.equal(data(await show(synced)).state?.title, "Synced issue");
  const competing = data(await show(opened.issueId));
  assert.equal(competing.heads.length, 2);
  assert.deepEqual(await mcp("workbox_issue_detail", { project, issueId: opened.issueId }), { ok: true, data: competing });
  assert.match(await markup(opened.href), /Resolve competing revisions/);
  const resolved = data(await action({
    action: "resolve", actor, issueId: opened.issueId, operationId: "resolved",
    expected: competing.headIds, basis: competing.heads[0].id, title: "Reviewed resolution",
  }));
  assert.equal(resolved.indexed, true);
  assert.equal(data(await show(opened.issueId)).headIds[0], resolved.eventId);
  assert.match(await markup(opened.href), /Reviewed resolution/);

  const legacy = await post<{ ok: boolean; data: { number: number; url: string } }>({ title: "Old caller" });
  assert.ok(legacy.result.ok);
  const number = legacy.result.data.number;
  assert.ok(number > 0, JSON.stringify(legacy));
  assert.match(legacy.result.data.url, /\/issue\/sha256:/);
  assert.deepEqual(await mcp("workbox_comment_issue", { project, number, comment: "Old comment" }),
    { commented: true, project, number, commentCount: 1 });
  assert.match(await markup(legacy.result.data.url), /Old comment/);
});
