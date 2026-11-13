import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { openDb } from "../src/lib/workbox/db";

const projectId = "parity-01";
const day = new Date().toISOString().slice(0, 10);
const date = `${day}T00:00:00Z`;

function makeFixture(directory: string) {
  const repository = join(directory, "repository");
  const empty = join(directory, "empty");
  const dbPath = join(directory, "index.sqlite");
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(directory, "empty-git-config"),
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
    WORKBOX_DB_PATH: dbPath,
  };
  function git(cwd: string, ...args: string[]) {
    return execFileSync("git", args, { cwd, env, encoding: "utf8", timeout: 10_000 }).trim();
  }
  for (const location of [repository, empty]) {
    mkdirSync(location);
    git(location, "init", "--quiet", "--initial-branch=main");
  }
  git(repository, "config", "user.name", "Fixture Author");
  git(repository, "config", "user.email", "fixture@example.invalid");
  mkdirSync(join(repository, "docs"));
  writeFileSync(join(repository, "README.md"), "fixture readme\n");
  writeFileSync(join(repository, "docs", "guide.md"), "main version\n");
  git(repository, "add", ".");
  git(repository, "commit", "-qm", "Introduce guide");
  const main = git(repository, "rev-parse", "HEAD");
  git(repository, "switch", "-qc", "alternate");
  writeFileSync(join(repository, "docs", "guide.md"), "alternate version\n");
  git(repository, "add", ".");
  git(repository, "commit", "-qm", "Revise guide on alternate");
  const alternate = git(repository, "rev-parse", "HEAD");
  using db = openDb(dbPath);
  const addProject = db.prepare("INSERT INTO projects (id, name, repo_path, last_indexed_at) VALUES (?, ?, ?, ?)");
  for (let index = 1; index <= 43; index++) {
    const suffix = String(index).padStart(2, "0");
    addProject.run(`parity-${suffix}`, `Parity Project ${suffix}`, index <= 22 ? repository : empty, date);
  }
  const addEvent = db.prepare(`INSERT INTO events
    (project_id, event_id, commit_sha, actor, kind, timestamp, subject, verified, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  function event(project: string, number: number, kind: string, verified: number, subject?: string) {
    const eventId = `sha256:${number.toString(16).padStart(64, "0")}`;
    addEvent.run(project, eventId, main, "fixture-actor", kind, date, subject ?? null, verified, "{}");
    return eventId;
  }
  const issue = event(projectId, 1, "issue.open", 1);
  db.prepare("INSERT INTO issues (project_id, issue_id, title, creator, number) VALUES (?, ?, ?, ?, ?)").run(projectId, issue, "Fixture issue", "fixture-actor", 1);
  event(projectId, 2, "proposal.open", 1);
  event(projectId, 3, "run.result", 1);
  event("parity-43", 4, "issue.open", 0);
  return { env, main, alternate };
}

async function startServer(env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [
    resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "0",
  ], { env });
  const origin = await new Promise<string>((accept, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Workbox startup timed out. " + output));
    }, 10_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Workbox exited with ${code}. ${output}`)); });
    child.stdout.on("data", chunk => {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url && output.includes("Ready in")) { clearTimeout(timer); accept(url); }
    });
    child.stderr.on("data", chunk => { output += chunk; });
  });
  return { child, origin };
}

type McpContent = { type: string; text?: string; data?: string; mimeType?: string };
type McpReply = { id: number; result?: { content?: McpContent[]; isError?: boolean }; error?: { message: string } };

function startMcp(env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ["--import", "tsx", "mcp/server.ts"], { env });
  const lines = createInterface({ input: child.stdout });
  let nextId = 0;
  async function call(name: string, args: Record<string, unknown>) {
    const id = ++nextId;
    const response = new Promise<McpReply>((accept, reject) => {
      const timer = setTimeout(() => { lines.off("line", receive); reject(new Error("MCP request timed out")); }, 15_000);
      function receive(line: string) {
        const value = JSON.parse(line) as McpReply;
        if (value.id === id) { clearTimeout(timer); lines.off("line", receive); accept(value); }
      }
      lines.on("line", receive);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) + "\n");
    const value = await response;
    assert.equal(value.result?.isError, false, JSON.stringify(value));
    assert.ok(value.result?.content);
    return value.result.content;
  }
  return { child, call };
}

async function stop(child: ChildProcessWithoutNullStreams | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, "close");
  child.kill();
  await closed;
}

function visibleHtml(html: string) {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
}

type Bucket = { day: string; count: number | null; href: string; partial?: boolean };
type Chart = { title: string; timezone: string; unit: string; buckets: Bucket[] };
type Explore = {
  selection: { page: number; day: string | null; sort: string };
  snapshot: string; chart: Chart; href: string; total: number; totalPages: number; stale: boolean;
  projects: { id: string; href: string; name: string; sources: string[] }[];
};
type Code = {
  kind: string; at: string; href: string;
  entries: { name: string; href: string; lastChange?: { subject: string; when: string; href: string } }[];
  changes: { path: string }[];
};
type Calendar = {
  kind: string; selection: { metric: string; day: string | null };
  snapshot: string; chart: Chart; href: string; total: number;
  records: { href: string; label: string }[];
};

function readResult<T>(content: McpContent[]): T {
  const text = content.find(item => item.type === "text")?.text;
  assert.ok(text);
  return JSON.parse(text) as T;
}

function checkImage(content: McpContent[]) {
  const image = content.find(item => item.type === "image");
  assert.equal(image?.mimeType, "image/png");
  assert.equal(Buffer.from(image.data ?? "", "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
}

function htmlHref(value: string) {
  return value.replaceAll("&", "&amp;");
}

function assertHref(html: string, href: string) {
  assert.ok(html.includes(`href="${htmlHref(href)}"`), href);
}

function chartDays(html: string, chart: Chart) {
  assert.ok(html.includes(`aria-label="${chart.title}"`));
  for (const bucket of chart.buckets) {
    assertHref(html, bucket.href);
    const count = bucket.count === null ? "Unknown" : `${bucket.partial ? "At least " : ""}${bucket.count} ${chart.unit}`;
    assert.ok(html.includes(`${bucket.day} · ${count}`), bucket.day);
  }
}

test("production browser and MCP agree on Explore, Code, and activity drill-downs", {
  skip: process.env.WORKBOX_EXPLORE_PARITY_TEST !== "1" && "Set WORKBOX_EXPLORE_PARITY_TEST=1 after npm run build.",
  timeout: 60_000,
}, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "workbox-explore-parity-"));
  const children: ChildProcessWithoutNullStreams[] = [];
  t.after(async () => {
    await Promise.all(children.map(stop));
    rmSync(directory, { recursive: true, force: true });
  });
  const { env, main, alternate } = makeFixture(directory);
  const server = await startServer(env);
  children.push(server.child);
  const { child, call: send } = startMcp(env);
  async function call(name: string, args: Record<string, unknown>) {
    const content = await send(name, args);
    assert.ok(content.every(item => !item.text?.includes(directory)));
    return content;
  }
  children.push(child);
  async function html(href: string) {
    const response = await fetch(server.origin + href, { signal: t.signal });
    assert.equal(response.status, 200, href);
    const markup = await response.text();
    assert.ok(!markup.includes(directory), href);
    return visibleHtml(markup);
  }
  function checkProjectRows(page: string, result: Explore) {
    const list = page.match(/<section[^>]*aria-label="Project catalog"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    assert.ok(list);
    const links = Array.from(list.matchAll(/href="(\/p\/[^"]+)"/g), match => match[1]);
    assert.deepEqual(links, result.projects.map(project => project.href));
  }

  const explore = await call("workbox_explore", { sort: "alpha" });
  const first = readResult<Explore>(explore);
  checkImage(explore);
  assert.equal(first.total, 43);
  assert.equal(first.totalPages, 5);
  assert.equal(first.projects.length, 10);
  assert.equal(first.chart.buckets.length, 7);
  assert.equal(first.chart.timezone, "UTC");
  assert.equal(first.chart.buckets.at(-1)?.count, 22);
  assert.equal(first.chart.buckets[0]?.count, 0);
  const firstPage = await html(first.href);
  checkProjectRows(firstPage, first);
  chartDays(firstPage, first.chart);
  for (const [page, size] of [[2, 10], [3, 10], [4, 10], [5, 3]]) {
    const result = readResult<Explore>(await call("workbox_explore", { sort: "alpha", page, snapshot: first.snapshot }));
    assert.equal(result.projects.length, size);
    checkProjectRows(await html(result.href), result);
  }
  const selected = readResult<Explore>(await call("workbox_explore", { sort: "alpha", day, page: 3, snapshot: first.snapshot }));
  assert.equal(selected.total, 22);
  assert.equal(selected.projects.length, 2);
  checkProjectRows(await html(selected.href), selected);
  const searched = readResult<Explore>(await call("workbox_explore", { q: "parity-43", sort: "recent" }));
  assert.equal(searched.total, 1);
  assert.equal(searched.chart.buckets.at(-1)?.count, 0);
  chartDays(await html(searched.href), searched.chart);

  {
    using changedDb = openDb(env.WORKBOX_DB_PATH);
    changedDb.prepare("UPDATE projects SET description = ? WHERE id = ?").run("Updated fixture", projectId);
    const stale = readResult<Explore>(await call("workbox_explore", { sort: "alpha", snapshot: first.snapshot }));
    assert.equal(stale.stale, true);
    assert.match(await html(first.href), /activity snapshot has changed/);
  }

  const unknown = readResult<Code>(await call("workbox_code", { project: "unindexed-project" }));
  assert.equal(unknown.kind, "unavailable");
  assert.match(await html(unknown.href), /Project not indexed/);

  const directoryRead = readResult<Code>(await call("workbox_code", { project: projectId }));
  assert.equal(directoryRead.kind, "directory");
  assert.equal(directoryRead.at, main);
  const rootPage = await html(directoryRead.href);
  const table = rootPage.match(/<table[^>]*aria-label="Repository files"[^>]*>([\s\S]*?)<\/table>/)?.[1];
  assert.ok(table);
  for (const row of directoryRead.entries) {
    assertHref(table, row.href);
    assert.ok(row.lastChange);
    assert.equal(row.lastChange.subject, "Introduce guide");
    assert.ok(table.includes(row.lastChange.when));
    assertHref(table, row.lastChange.href);
  }
  const nested = readResult<Code>(await call("workbox_code", { project: projectId, rev: "alternate", path: "docs" }));
  assert.equal(nested.at, alternate);
  assert.equal(nested.entries[0]?.lastChange?.subject, "Revise guide on alternate");
  assert.match(await html(nested.href), /guide\.md[\s\S]*Revise guide on alternate/);
  const commit = readResult<Code>(await call("workbox_code", { project: projectId, rev: "alternate", at: alternate, commit: alternate }));
  assert.equal(commit.kind, "commit");
  assert.deepEqual(commit.changes.map(change => change.path), ["docs/guide.md"]);
  assert.match(await html(commit.href), /Changed files[\s\S]*docs\/guide\.md/);

  for (const metric of ["commits", "issues", "proposals", "ci"]) {
    const output = await call("workbox_repository_activity", { project: projectId, metric, day });
    const activity = readResult<Calendar>(output);
    checkImage(output);
    assert.equal(activity.kind, "activity");
    assert.equal(activity.selection.metric, metric);
    assert.equal(activity.selection.day, day);
    assert.equal(activity.chart.buckets.at(-1)?.count, 1);
    assert.equal(activity.total, 1);
    const markup = await html(activity.href);
    chartDays(markup, activity.chart);
    assertHref(markup, activity.records[0].href);
  }
});
