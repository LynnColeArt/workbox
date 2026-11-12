import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { openDb } from "../src/lib/workbox/db";
import type { DashboardRead } from "../src/lib/workbox/dashboard";

const nativeBinary = process.env.WORKBOX_HN_BIN ?? "/tmp/hn";

async function server(env: NodeJS.ProcessEnv) {
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

type Content = { type: string; text?: string; data?: string; mimeType?: string };
type McpReply = { id: number; result?: { content?: Content[]; isError?: boolean }; error?: { message: string } };

function mcp(env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ["--import", "tsx", "mcp/server.ts"], { env });
  const lines = createInterface({ input: child.stdout });
  let nextId = 0;
  async function call<T>(name: string, args: Record<string, unknown> = {}) {
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
    const result = await response;
    assert.ok(result.result?.content, JSON.stringify(result));
    const text = result.result.content.find(item => item.type === "text")?.text;
    assert.ok(text);
    return {
      data: JSON.parse(text) as T,
      image: result.result.content.find(item => item.type === "image"),
      text,
      isError: result.result.isError === true,
    };
  }
  return { child, call };
}

async function stop(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, "close");
  child.kill();
  await closed;
}

function fixture(directory: string, name: string) {
  const root = join(directory, name);
  mkdirSync(root);
  const dbPath = join(directory, name + ".sqlite");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(directory, "empty-git-config"),
    WORKBOX_PROJECTS_ROOT: root,
    WORKBOX_DB_PATH: dbPath,
    WORKBOX_HN_BIN: nativeBinary,
  };
  return { env, root, dbPath };
}

function seedDashboard({env, root, dbPath}: ReturnType<typeof fixture>, quiet = false) {
  const repo = join(root, "source");
  mkdirSync(repo);
  function git(...args: string[]) {
    execFileSync("git", args, {cwd:repo, env, stdio:"ignore", timeout: 10_000});
  }
  if (quiet) {
    env = { ...env, GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" };
  }
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "README.md"), "fixture\n");
  git("add", "README.md");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Dashboard fixture commit");
  using db = openDb(dbPath);
  const insert = db.prepare("INSERT INTO projects (id, name, repo_path, last_indexed_at) VALUES (?, ?, ?, ?)");
  const now = new Date().toISOString();
  for (let index = 1; index <= (quiet ? 1 : 22); index++) {
    const suffix = String(index).padStart(2,"0");
    insert.run(`project-${suffix}`, `Project ${suffix}`, repo, now);
  }
  if (!quiet) insert.run("missing-history", "Missing history", join(root, "absent"), now);
}

async function getPage(origin: string, path: string, signal: AbortSignal) {
  const response = await fetch(origin + path, {signal});
  assert.equal(response.status, 200, path);
  return (await response.text()).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").replace(/<!-- -->/g, "");
}

async function postProject<T>(origin: string, args: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch(origin + "/api/projects", {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(args), signal,
  });
  return await response.json() as T;
}

type Creation = Awaited<ReturnType<typeof import("../src/lib/workbox/create").createProject>>;

function expectError(result: Creation, code: string) {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, code);
}

function checkPng(image?: Content) {
  assert.equal(image?.mimeType, "image/png");
  assert.equal(Buffer.from(image.data ?? "", "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
}

function assertCreation(result: Creation, id: string) {
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.id, id);
  assert.equal(result.data.url, `/p/${id}`);
  assert.equal(result.data.foundingIssue.number, 1);
  return result.data;
}

test("dashboard and MCP share snapshot visuals, public data, and project creation", {
  skip: process.env.WORKBOX_DASHBOARD_PARITY_TEST !== "1" && "Set WORKBOX_DASHBOARD_PARITY_TEST=1 after npm run build.",
  timeout: 60_000,
}, async t => {
  const directory = mkdtempSync(join(tmpdir(), "workbox-dashboard-parity-"));
  const children: ChildProcessWithoutNullStreams[] = [];
  t.after(async () => {
    await Promise.all(children.map(stop));
    rmSync(directory, {recursive:true, force:true});
  });
  const busy = fixture(directory, "busy");
  const browser = await server(busy.env);
  children.push(browser.child);
  const agent = mcp(busy.env);
  children.push(agent.child);
  const dashboard = () => getPage(browser.origin, "/", t.signal);
  const createBrowser = (input: Record<string, unknown>) => postProject<Creation>(browser.origin, input, t.signal);
  const createAgent = async (input: Record<string, unknown>) => {
    const result = await agent.call<Creation>("workbox_create_project", input);
    assert.ok(!result.text.includes(directory));
    assert.equal(result.isError, !result.data.ok);
    return result.data;
  };

  const empty = await agent.call<DashboardRead>("workbox_dashboard");
  checkPng(empty.image);
  assert.equal(empty.data.summary.projects, 0);
  assert.equal(empty.data.projects.length, 0);
  assert.match(await dashboard(), /No qualifying activity/);

  seedDashboard(busy);
  const snapshot = await agent.call<DashboardRead>("workbox_dashboard");
  const {data} = snapshot;
  checkPng(snapshot.image);
  assert.ok(!snapshot.text.includes(directory));
  assert.equal(data.summary.projects, 23);
  assert.equal(data.projects.length, 10);
  assert.equal(data.coverage.git.unavailable, 1);
  assert.equal(Date.parse(data.window.end) - Date.parse(data.window.start), 7 * 86_400_000);
  const markup = await dashboard();
  assert.ok(!markup.includes(directory));
  assert.match(markup, /New Hubnot project/);
  assert.ok(markup.includes(`href="${data.exploreHref}"`));
  assert.match(markup, /Activity history is incomplete/);
  assert.match(markup, /23 projects/);
  const projectList = markup.match(/<ul aria-label="Recently active projects"[^>]*>([\s\S]*?)<\/ul>/)?.[1];
  assert.ok(projectList);
  const rows = [...projectList.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)];
  assert.equal(rows.length, data.projects.length);
  for (const [index, item] of data.projects.entries()) {
    const row = rows[index][1];
    assert.ok(row.includes(`href="${item.href}"`));
    assert.ok(row.includes(`datetime="${item.latestAt}"`) || row.includes(`dateTime="${item.latestAt}"`));
    assert.equal(item.gitCount, 1);
    assert.equal(item.hubnotCount, 0);
    assert.ok(row.includes(`1 ${data.visual.sources.git.label}`));
    assert.ok(row.includes(`0 ${data.visual.sources.hubnot.label}`));
    assert.ok(row.includes(data.visual.sources.git.color));
  }
  assert.doesNotMatch(markup, /href="\/p\/project-22"/);

  const [invalidHttp, invalidMcp] = await Promise.all([
    createBrowser({id: 23}), createAgent({id: 23}),
  ]);
  expectError(invalidHttp, "invalid_input");
  assert.deepEqual(invalidMcp, invalidHttp);

  const quiet = fixture(directory, "quiet");
  seedDashboard(quiet, true);
  const quietBrowser = await server(quiet.env);
  children.push(quietBrowser.child);
  const quietAgent = mcp(quiet.env);
  children.push(quietAgent.child);
  const quietSnapshot = await quietAgent.call<DashboardRead>("workbox_dashboard");
  checkPng(quietSnapshot.image);
  assert.equal(quietSnapshot.data.state, "quiet");
  assert.equal(quietSnapshot.data.coverage.state, "complete");
  assert.equal(quietSnapshot.data.projects.length, 1);
  assert.equal(quietSnapshot.data.projects[0].observedTotal, 0);
  const quietMarkup = await getPage(quietBrowser.origin, "/", t.signal);
  assert.match(quietMarkup, /No project activity in this window/);
  assert.ok(quietMarkup.includes(`href="${quietSnapshot.data.projects[0].href}"`));
  assert.match(quietMarkup, /0 Git commits/);

  const normalized = { id: "new-project", name: "Test project", description: "fixture" };
  const viaBrowser = assertCreation(await createBrowser({ id: " new-project ", name: " Test project ", description: " fixture " }), normalized.id);
  const viaMcp = assertCreation((await quietAgent.call<Creation>("workbox_create_project", normalized)).data, normalized.id);
  assert.equal(viaBrowser.url, viaMcp.url);
  for (const [result, origin, client] of [[viaBrowser, browser.origin, agent], [viaMcp, quietBrowser.origin, quietAgent]] as const) {
    assert.match(await getPage(origin, result.url + "/code", t.signal), /Test project/);
    assert.match(await getPage(origin, result.foundingIssue.url, t.signal), /Project created by Workbox/);
    const issue = await client.call<{ title: string }>("workbox_issue", { project: result.id, number: result.foundingIssue.number });
    assert.equal(issue.data.title, "Project created by Workbox");
  }
  expectError(await createAgent({id:normalized.id}), "conflict");
  const existing = join(busy.root, "already-here");
  mkdirSync(existing);
  writeFileSync(join(existing, "keep.txt"), "existing data");
  const [browserConflict, agentConflict] = await Promise.all([
    createBrowser({id:"already-here"}), createAgent({id:"already-here"}),
  ]);
  expectError(browserConflict, "conflict");
  assert.deepEqual(agentConflict, browserConflict);
  assert.equal(readFileSync(join(existing, "keep.txt"), "utf8"), "existing data");
  const contenders = await Promise.all([
    createBrowser({id:"racing-project"}), createAgent({id:"racing-project"}),
  ]);
  assert.equal(contenders.filter(result => result.ok).length, 1);
  for (const result of contenders) {
    if (result.ok) assertCreation(result, "racing-project");
    else expectError(result, "conflict");
  }
  const populated = await agent.call<DashboardRead>("workbox_dashboard");
  assert.equal(populated.data.summary.verified, 2);
  const populatedPage = await dashboard();
  const feed = populatedPage.match(/<ul[^>]*aria-label="Activity feed"[^>]*>([\s\S]*?)<\/ul>/)?.[1];
  assert.ok(feed);
  assert.deepEqual([...feed.matchAll(/href="([^"]+)"/g)].map(match => match[1]),
    populated.data.feed.map(event => event.href));
});

test("an indexing failure can be recovered through the other entry point", {
  skip: process.env.WORKBOX_DASHBOARD_PARITY_TEST !== "1" && "Set WORKBOX_DASHBOARD_PARITY_TEST=1 after npm run build.",
  timeout: 45_000,
}, async t => {
  const directory = mkdtempSync(join(tmpdir(), "workbox-dashboard-recovery-"));
  const children: ChildProcessWithoutNullStreams[] = [];
  t.after(async () => {
    await Promise.all(children.map(stop));
    rmSync(directory, {recursive:true, force:true});
  });
  const recovery = fixture(directory, "recovery");
  mkdirSync(recovery.dbPath);
  const browser = await server(recovery.env);
  children.push(browser.child);
  const agent = mcp(recovery.env);
  children.push(agent.child);
  const request = {id:"needs-index",name:"Recoverable project"};
  const partial = await postProject<Creation>(browser.origin, request, t.signal);
  expectError(partial, "indexing_failed");
  const path = join(recovery.root, request.id);
  const policy = readFileSync(join(path, ".hn", "policy.json"), "utf8");
  function signedRefs() {
    return execFileSync("git", ["for-each-ref", "--format=%(objectname)", "refs/hn/actors"], {
      cwd:path, env:recovery.env, encoding:"utf8", timeout: 10_000,
    }).trim();
  }
  const original = signedRefs();
  assert.ok(original);
  rmSync(recovery.dbPath, {recursive:true});
  const recovered = assertCreation((await agent.call<Creation>("workbox_create_project", request)).data, request.id);
  assert.equal(signedRefs(), original);
  assert.equal(readFileSync(join(path, ".hn", "policy.json"), "utf8"), policy);
  assert.match(await getPage(browser.origin, recovered.foundingIssue.url, t.signal), /Project created by Workbox/);
});
