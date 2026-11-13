import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test, { type TestContext } from "node:test";
import { indexProject } from "../src/lib/workbox/index";
import { getProject } from "../src/lib/workbox/queries";
import { openDb } from "../src/lib/workbox/db";

async function settingsFixture(t: TestContext, binary?: string) {
  const directory = mkdtempSync(join(tmpdir(), "workbox-settings-parity-"));
  const repo = join(directory, "repo");
  mkdirSync(repo);
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(directory, "no-global-config"),
    WORKBOX_DB_PATH: join(directory, "index.db"),
    WORKBOX_HN_BIN: binary ?? join(directory, "unavailable-hn"),
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8", timeout: 5000 });
  const hn = (...args: string[]) => execFileSync(env.WORKBOX_HN_BIN, args, { cwd: repo, env, encoding: "utf8", timeout: 5000 });
  git("init", "-q", "-b", "trunk");
  git("config", "user.name", "Settings Fixture");
  git("config", "user.email", "settings-fixture@example.invalid");
  writeFileSync(join(repo, "README.md"), "Fixture\n");
  git("add", "README.md");
  git("commit", "-qm", "Seed");
  {
    using db = openDb(env.WORKBOX_DB_PATH);
    db.prepare("INSERT INTO projects (id, repo_path, name) VALUES (?, ?, ?)").run("repo", repo, "Fixture");
  }
  const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "0"], { env });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const stopped = once(server, "close");
      server.kill();
      await stopped;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  const origin = await new Promise<string>((accept, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Settings fixture server failed to start")), 10_000);
    server.once("error", error => { clearTimeout(timer); reject(error); });
    server.once("exit", code => { clearTimeout(timer); reject(new Error(`Settings fixture server exited with ${code}`)); });
    server.stdout.on("data", chunk => {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url && output.includes("Ready in")) { clearTimeout(timer); accept(url); }
    });
  });
  const path = origin + "/api/projects/repo/settings";
  async function browser(input?: Record<string, unknown>, requestOrigin = origin) {
    const response = await fetch(path, input ? {
      method: "POST", headers: { "content-type": "application/json", origin: requestOrigin },
      body: JSON.stringify(input), signal: t.signal,
    } : { signal: t.signal });
    return { status: response.status, data: await response.json() };
  }
  async function agent(name: string, input: Record<string, unknown> = {}) {
    const request = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { project: "repo", ...input } } });
    const child = spawn(process.execPath, ["--import", "tsx", "mcp/server.ts"], { env, timeout: 10_000 });
    const stopped = new Promise<void>(accept => child.once("close", () => accept()));
    const output = createInterface({ input: child.stdout });
    child.stderr.resume();
    try {
      const line = await new Promise<string>((accept, reject) => {
        child.once("error", reject);
        child.stdin.once("error", reject);
        output.once("line", accept);
        output.once("close", () => reject(new Error(`MCP closed without answering ${name}`)));
        child.stdin.end(request + "\n");
      });
      const result = JSON.parse(line).result;
      return { data: JSON.parse(result.content[0].text), isError: result.isError };
    } finally {
      output.close();
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await stopped;
    }
  }
  return { repo, dbPath: env.WORKBOX_DB_PATH, origin, git, hn, browser, agent };
}

test("proposal detail and MCP display the same exact check and signed attempt", {
  skip: !process.env.WORKBOX_AUTOMATIC_CHECKS_HN,
  timeout: 45_000,
}, async t => {
  const { repo, dbPath, origin, git, hn, agent } = await settingsFixture(t, process.env.WORKBOX_AUTOMATIC_CHECKS_HN);
  hn("init", "--name", "Fixture");
  const { actor } = JSON.parse(hn("identity", "show", "--json")).data;
  mkdirSync(join(repo, ".hn", "pipelines"), { recursive: true });
  writeFileSync(join(repo, ".hn", "policy.json"), JSON.stringify({
    version: "hn.policy/0", maintainers: [actor],
    proposals: { trustedReviewers: [actor], requiredApprovals: 1, requiredAccepts: 1 },
  }));
  writeFileSync(join(repo, ".hn", "pipelines", "test.json"), JSON.stringify({
    version: "hn.pipeline/0", steps: [{ name: "Test", command: "true" }],
  }));
  writeFileSync(join(repo, ".hn", "proposal-checks.json"), JSON.stringify({
    version: "hn.proposal-checks/1", pipelines: { test: ["proposal.open"] },
  }));
  git("add", ".hn");
  git("commit", "-qm", "Repository policy and checks");
  const base = git("rev-parse", "HEAD").trim();
  const remote = join(repo, "remote.git");
  git("init", "-q", "--bare", remote);
  git("remote", "add", "origin", remote);
  git("push", "-q", "origin", "trunk");
  hn("proposal-checks", "init", "refs/heads/trunk", "--json");
  git("switch", "-qc", "topic");
  git("commit", "--allow-empty", "-qm", "Candidate");
  const head = git("rev-parse", "HEAD").trim();
  const { id: candidate } = JSON.parse(hn("proposal", "publish", "--base", base, "--base-ref", "refs/heads/trunk", "--head", head,
    "--actor", actor, "--operation", "automatic-parity", "--title", "Automatic parity", "--json")).data;
  hn("proposal-checks", "observe", "--json");
  {
    using db = openDb(dbPath);
    indexProject(db, getProject(db, "repo")!);
  }
  const checkPath = origin + "/p/repo/proposals/" + encodeURIComponent(candidate) + "?view=checks";
  async function compare(status: string) {
    const reply = await agent("workbox_automatic_proposal_checks", { candidate });
    assert.equal(reply.isError, false, JSON.stringify(reply));
    const check = reply.data.data.value.checks[0];
    assert.equal(check.candidate, candidate);
    assert.equal(check.commit, head);
    assert.equal(check.status, status);
    const response = await fetch(checkPath);
    assert.equal(response.status, 200);
    const html = (await response.text()).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
    assert.match(html, /Automatic proposal checks/);
    assert.ok(html.includes(check.definition));
    assert.ok(html.includes(check.configuration));
    assert.ok(html.includes(check.commit));
    for (const attempt of check.attempts) assert.ok(html.includes(attempt.result));
    return check;
  }
  await compare("queued");
  hn("runner", "automatic-once");
  const completed = await compare("passed");
  assert.equal(completed.attempts.length, 1);
  assert.match(completed.attempts[0].result, /^sha256:[a-f0-9]{64}$/);
});
