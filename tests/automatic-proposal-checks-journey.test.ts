import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
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
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8", timeout: 30_000 });
  const hn = (...args: string[]) => execFileSync(env.WORKBOX_HN_BIN, args, { cwd: repo, env, encoding: "utf8", timeout: 30_000 });
  git("init", "-q", "-b", "main");
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

test("browser and MCP follow a proposal from submission through a synced revision", {
  skip: !process.env.WORKBOX_AUTOMATIC_CHECKS_HN || !process.env.WORKBOX_PLAYWRIGHT_MODULE,
  timeout: 150_000,
}, async t => {
  const { repo, dbPath, origin, git, hn, agent, browser } = await settingsFixture(t, process.env.WORKBOX_AUTOMATIC_CHECKS_HN);
  hn("init", "--name", "Fixture");
  const { actor } = JSON.parse(hn("identity", "show", "--json")).data;
  mkdirSync(join(repo, ".hn", "pipelines"), { recursive: true });
  writeFileSync(join(repo, ".hn", "policy.json"), JSON.stringify({
    version: "hn.policy/0", maintainers: [actor],
    proposals: { trustedReviewers: [actor], requiredApprovals: 1, requiredAccepts: 1, allowAuthorApproval: true },
  }));
  writeFileSync(join(repo, ".hn", "pipelines", "test.json"), JSON.stringify({
    version: "hn.pipeline/0", steps: [{ name: "Go test", command: "go", args: ["test", "./..."] }, { name: "Go build", command: "go", args: ["build", "./..."] }],
  }));
  writeFileSync(join(repo, ".hn", "proposal-checks.json"), JSON.stringify({
    version: "hn.proposal-checks/1", pipelines: { test: ["proposal.open", "proposal.revise"] },
  }));
  writeFileSync(join(repo, "go.mod"), "module example.invalid/fixture\n\ngo 1.26\n");
  writeFileSync(join(repo, "main.go"), "package main\n\nfunc main() {}\n");
  git("add", ".hn", "go.mod", "main.go");
  git("commit", "-qm", "Repository policy and checks");
  const base = git("rev-parse", "HEAD").trim();
  const remote = join(repo, "..", "remote.git");
  git("init", "-q", "--bare", "--initial-branch=main", remote);
  git("remote", "add", "origin", remote);
  git("push", "-q", "origin", "main");
  const peer = join(repo, "..", "peer");
  git("clone", "-q", remote, peer);
  const peerGit = (...args: string[]) => git("-C", peer, ...args);
  const peerHn = (...args: string[]) => execFileSync(process.env.WORKBOX_AUTOMATIC_CHECKS_HN!, args, { cwd: peer, encoding: "utf8" });
  peerGit("config", "user.name", "Synced contributor");
  peerGit("config", "user.email", "peer@example.invalid");
  peerHn("init", "--name", "Synced contributor");
  hn("proposal-checks", "init", "refs/heads/main", "--json");
  const { chromium } = createRequire(import.meta.url)(process.env.WORKBOX_PLAYWRIGHT_MODULE!);
  const chrome = await chromium.launch({ executablePath: process.env.WORKBOX_CHROME_BIN, headless: true });
  t.after(() => chrome.close());
  const page = await chrome.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(origin + "/p/repo/settings");
  await page.getByRole("button", { name: "Load active triggers" }).click();
  const trigger = page.getByRole("checkbox", { name: "New revision" });
  await trigger.waitFor();
  assert.equal(await trigger.isChecked(), true);
  await trigger.uncheck();
  await page.getByRole("button", { name: "Review trigger changes" }).click();
  await page.getByRole("button", { name: "Open trigger proposal" }).waitFor();
  const active = (await browser({ action: "triggers_read" })).data;
  assert.deepEqual(active, (await agent("workbox_proposal_triggers")).data);
  assert.deepEqual(active.data.configuration.pipelines.test, ["proposal.open", "proposal.revise"]);

  git("switch", "-qc", "topic");
  git("commit", "--allow-empty", "-qm", "Browser candidate");
  await page.goto(origin + "/p/repo/proposals");
  await page.getByRole("button", { name: "New proposal" }).click();
  await page.getByPlaceholder("Proposal title").fill("Browser proposal");
  await page.getByPlaceholder("Head branch (descending from main)").fill("topic");
  await page.getByRole("button", { name: "Sign & open proposal" }).click();
  await page.waitForURL(/\/p\/repo\/proposals\/sha256/);
  const opening = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-1)!);
  hn("runner", "automatic-once");
  const check = async (candidate: string, head: string) => {
    const result = await agent("workbox_automatic_proposal_checks", { candidate });
    assert.equal(result.isError, false, JSON.stringify(result));
    const [entry] = result.data.data.value.checks;
    assert.equal(entry.candidate, candidate);
    assert.equal(entry.commit, head);
    assert.equal(entry.status, "passed");
    assert.equal(entry.attempts.length, 1);
    return entry;
  };
  await check(opening, git("rev-parse", "HEAD").trim());

  peerGit("switch", "-qc", "synced-topic");
  peerGit("commit", "--allow-empty", "-qm", "CLI candidate");
  const cliHead = peerGit("rev-parse", "HEAD").trim();
  const cli = JSON.parse(peerHn("identity", "show", "--json")).data.actor;
  const cliProposal = JSON.parse(peerHn("proposal", "publish", "--base", base, "--base-ref", "refs/heads/main",
    "--head", cliHead, "--actor", cli, "--operation", "synced-opening", "--title", "Synced proposal", "--json")).data.id;
  peerHn("sync");
  hn("runner", "automatic-once");
  const earlier = await check(cliProposal, cliHead);

  peerGit("commit", "--allow-empty", "-qm", "CLI revision");
  const head = peerGit("rev-parse", "HEAD").trim();
  const revised = peerHn("proposal", "revise", cliProposal, "--base", base, "--head", head);
  const candidate = revised.match(/sha256:[a-f0-9]{64}/)?.[0];
  assert.ok(candidate, revised);
  peerHn("sync");
  hn("runner", "automatic-once");
  const current = await check(candidate, head);
  assert.notEqual(current.id, earlier.id);
  assert.notEqual(current.attempts[0].result, earlier.attempts[0].result);
  hn("runner", "automatic-once");
  assert.deepEqual(await check(candidate, head), current);
  peerHn("sync");
  const synced = JSON.parse(peerHn("proposal-checks", "status", candidate, "--json")).data;
  assert.equal(synced.availability, "no_authority");
  assert.equal(synced.checks[0].attempts[0].result, current.attempts[0].result);
  {
    using db = openDb(dbPath);
    indexProject(db, getProject(db, "repo")!);
  }
  await page.goto(origin + "/p/repo/proposals/" + encodeURIComponent(candidate) + "?view=checks");
  const checks = page.getByRole("region", { name: "Automatic proposal checks" });
  await checks.getByText(current.attempts[0].result, { exact: true }).waitFor();

  await page.goto(origin + "/p/repo/settings");
  await page.getByRole("button", { name: "Load active triggers" }).click();
  await page.getByRole("checkbox", { name: "New revision" }).uncheck();
  await page.getByRole("button", { name: "Review trigger changes" }).click();
  await page.getByRole("button", { name: "Open trigger proposal" }).click();
  const link = page.getByRole("link", { name: "View proposal", exact: true });
  const href = await link.getAttribute("href");
  assert.ok(href);
  const triggerProposal = decodeURIComponent(new URL(href, origin).pathname.split("/").at(-1)!);
  assert.deepEqual((await browser({ action: "triggers_read" })).data, active);
  hn("review", triggerProposal, "--approve");
  hn("decide", triggerProposal, "--accept");
  git("switch", "-q", "main");
  hn("merge", triggerProposal);
  const updated = (await browser({ action: "triggers_read" })).data;
  assert.deepEqual(updated.data.configuration.pipelines.test, ["proposal.open"]);
  assert.deepEqual(updated, (await agent("workbox_proposal_triggers")).data);
  assert.notEqual(updated.data.source, active.data.source);
});
