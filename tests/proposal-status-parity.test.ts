import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test, { type TestContext } from "node:test";
import { indexProject } from "../src/lib/workbox/index";
import { getProject } from "../src/lib/workbox/queries";
import { openDb } from "../src/lib/workbox/db";

async function statusFixture(t: TestContext, binary: string) {
  const directory = mkdtempSync(join(tmpdir(), "workbox-proposal-status-"));
  const repo = join(directory, "repo");
  mkdirSync(repo);
  const wrapper = join(directory, "hn");
  const disableStatus = join(directory, "disable-status");
  writeFileSync(wrapper, `#!/bin/sh
if [ "$1" = proposal ] && [ "$2" = status ] && [ -f "$WORKBOX_TEST_DISABLE_STATUS" ]; then
  printf '%s\n' '{"ok":false,"error":{"code":"unavailable"}}'
  exit 1
fi
exec "$WORKBOX_TEST_NATIVE_HN" "$@"
`, { mode: 0o700 });
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(directory, "no-global-config"),
    WORKBOX_DB_PATH: join(directory, "index.db"),
    WORKBOX_HN_BIN: wrapper,
    WORKBOX_TEST_NATIVE_HN: binary,
    WORKBOX_TEST_DISABLE_STATUS: disableStatus,
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8", timeout: 5000 });
  const hn = (...args: string[]) => execFileSync(env.WORKBOX_HN_BIN, args, { cwd: repo, env, encoding: "utf8", timeout: 5000 });
  git("init", "-q", "-b", "trunk");
  git("config", "user.name", "Status Fixture");
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
    const timer = setTimeout(() => reject(new Error("Proposal status fixture server failed to start")), 10_000);
    server.once("error", error => { clearTimeout(timer); reject(error); });
    server.once("exit", code => { clearTimeout(timer); reject(new Error(`Proposal status fixture server exited with ${code}`)); });
    server.stdout.on("data", chunk => {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url && output.includes("Ready in")) { clearTimeout(timer); accept(url); }
    });
  });
  async function rpc(method: string, params?: object) {
    const request = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const child = spawn(process.execPath, ["--import", "tsx", "mcp/server.ts"], { env, timeout: 10_000 });
    const stopped = new Promise<void>(accept => child.once("close", () => accept()));
    const output = createInterface({ input: child.stdout });
    child.stderr.resume();
    try {
      const line = await new Promise<string>((accept, reject) => {
        child.once("error", reject);
        child.stdin.once("error", reject);
        output.once("line", accept);
        output.once("close", () => reject(new Error(`MCP closed without answering ${method}`)));
        child.stdin.end(request + "\n");
      });
      return JSON.parse(line).result;
    } finally {
      output.close();
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await stopped;
    }
  }
  async function agent(name: string, input: Record<string, unknown> = {}) {
    const result = await rpc("tools/call", { name, arguments: { project: "repo", ...input } });
    return { data: JSON.parse(result.content[0].text), isError: result.isError };
  }
  return { repo, dbPath: env.WORKBOX_DB_PATH, origin, git, hn, agent, rpc, disableStatus };
}

test("Workbox and MCP agree on exact failed, restored, and merged revisions", {
  skip: !process.env.WORKBOX_AUTOMATIC_CHECKS_HN,
  timeout: 60_000,
}, async t => {
  const { repo, dbPath, origin, git, hn, agent, rpc, disableStatus } = await statusFixture(
    t, process.env.WORKBOX_AUTOMATIC_CHECKS_HN!,
  );
  const { tools } = await rpc("tools/list");
  for (const name of ["workbox_proposal_status", "workbox_automatic_proposal_checks", "workbox_repository_activity"]) {
    assert.ok(tools.some((tool: { name: string }) => tool.name === name), name);
  }
  assert.equal((await agent("workbox_proposal_status", { candidate: "sha256:123" })).data.error.code, "invalid_input");
  assert.equal((await agent("workbox_proposal_status", { project: "unknown", candidate: "sha256:" + "0".repeat(64) })).data.error.code, "not_found");
  hn("init", "--name", "Fixture");
  const { actor } = JSON.parse(hn("identity", "show", "--json")).data;
  mkdirSync(join(repo, ".hn", "pipelines"), { recursive: true });
  writeFileSync(join(repo, ".hn", "policy.json"), JSON.stringify({
    version: "hn.policy/0", maintainers: [actor],
    proposals: { requiredApprovals: 0, requiredAccepts: 1 },
    pipelines: { readme: { requiredResults: 1, trustedRunners: [actor] } },
  }));
  for (const name of ["readme", "optional"]) {
    writeFileSync(join(repo, ".hn", "pipelines", name + ".json"), JSON.stringify({
      version: "hn.pipeline/0", steps: [{ name: name, command: name === "readme" ? "test" : "false", args: name === "readme" ? ["-s", "README.md"] : [] }],
    }));
  }
  writeFileSync(join(repo, ".hn", "proposal-checks.json"), JSON.stringify({
    version: "hn.proposal-checks/1",
    pipelines: { readme: ["proposal.open", "proposal.revise"], optional: ["proposal.open", "proposal.revise"] },
  }));
  git("add", ".hn");
  git("commit", "-qm", "Repository policy and checks");
  const base = git("rev-parse", "HEAD").trim();
  const remote = join(repo, "..", "remote.git");
  git("init", "-q", "--bare", "--initial-branch=trunk", remote);
  git("remote", "add", "origin", remote);
  git("push", "-q", "origin", "trunk");
  hn("proposal-checks", "init", "refs/heads/trunk", "--json");
  git("switch", "-qc", "topic");

  function commitReadme(content: string) {
    writeFileSync(join(repo, "README.md"), content);
    git("commit", "-qam", "Update README");
    return git("rev-parse", "HEAD").trim();
  }
  const failedHead = commitReadme("");
  const { id: original } = JSON.parse(hn("proposal", "publish", "--base", base, "--base-ref", "refs/heads/trunk",
    "--head", failedHead, "--actor", actor, "--operation", "status-parity", "--title", "README check", "--json")).data;
  const runChecks = () => {
    hn("runner", "automatic-once");
    hn("runner", "automatic-once");
  };
  const index = () => {
    using db = openDb(dbPath);
    indexProject(db, getProject(db, "repo")!);
  };
  const snapshot = () => [git("show-ref"), git("ls-files", "--stage"), git("status", "--porcelain=v1")];
  const lookup = (candidate: string, mode?: string) =>
    agent("workbox_proposal_status", { candidate, ...(mode && { mode }) });
  async function browser(href: string) {
    const response = await fetch(origin + href, { signal: t.signal });
    assert.equal(response.status, 200);
    return (await response.text()).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
  }
  async function compare(candidate: string, head: string, state: string, merged: boolean) {
    const before = snapshot();
    const reply = await lookup(candidate);
    assert.equal(reply.isError, false, JSON.stringify(reply));
    const status = reply.data.data;
    assert.deepEqual(status.requested, { project: "repo", candidate, mode: "exact" });
    assert.equal(status.id, candidate);
    assert.equal(status.head, head);
    assert.equal(status.base, base);
    assert.equal(status.merge.recorded, merged);
    assert.equal(status.revisionState, state);
    const html = await browser(status.href);
    for (const value of [candidate, head, state, ...status.stages.map((stage: { state: string }) => stage.state)]) {
      assert.ok(html.includes(value), value);
    }
    for (const row of status.requirements) assert.ok(html.includes(row.detail), row.detail);
    for (const check of status.automaticChecks.checks) {
      assert.equal(check.candidate, candidate);
      assert.equal(check.commit, head);
      assert.equal(check.attempts.length, 1);
      assert.ok(html.includes(check.attempts[0].result), check.attempts[0].result);
    }
    assert.deepEqual(snapshot(), before);
    return status;
  }

  runChecks();
  index();
  const failed = await compare(original, failedHead, "Current revision", false);
  assert.ok(failed.blockers.some((row: { key: string }) => row.key === "pipeline:readme"));
  const check = (status: typeof failed, pipeline: string) =>
    status.automaticChecks.checks.find((entry: { pipeline: string }) => entry.pipeline === pipeline);
  assert.equal(check(failed, "readme").status, "failed");
  assert.equal(check(failed, "optional").status, "failed");
  assert.equal(check(failed, "optional").required, false);
  assert.ok(!failed.blockers.some((row: { key: string }) => row.key === "pipeline:optional"));

  const restoredHead = commitReadme("Restored\n");
  const restored = hn("proposal", "revise", original, "--base", base, "--head", restoredHead)
    .match(/sha256:[a-f0-9]{64}/)?.[0];
  assert.ok(restored);
  runChecks();
  index();
  const passing = await compare(restored, restoredHead, "Current revision", false);
  assert.equal(check(passing, "readme")?.status, "passed", JSON.stringify(passing.automaticChecks));
  assert.deepEqual(passing.blockers, []);
  assert.equal(passing.decision.deficit, 1);
  const historical = await compare(original, failedHead, "Superseded revision", false);
  assert.deepEqual(historical.automaticChecks, failed.automaticChecks);
  assert.equal((await lookup(original, "lineage")).data.data.id, restored);

  hn("decide", restored, "--accept");
  git("switch", "-q", "trunk");
  hn("merge", restored);
  index();
  const merged = await compare(restored, restoredHead, "Merged revision", true);
  assert.equal(merged.merge.evidenceIncomplete, false);
  const native = JSON.parse(hn("proposal", "status", restored, "--json")).data;
  assert.deepEqual(merged.merge.events, native.decisions.merge_events);
  assert.match(merged.merge.events[0], /^sha256:[a-f0-9]{64}$/);
  const followed = (await lookup(original, "lineage")).data.data;
  assert.equal(followed.id, merged.id);
  const lineageHref = "/p/repo/proposals/" + encodeURIComponent(original) + "?mode=lineage&view=checks";
  const lineagePage = await browser(lineageHref);
  assert.ok(lineagePage.includes(`href="${followed.href}"`));
  assert.match(lineagePage, /Open selected revision/);

  if (process.env.WORKBOX_PLAYWRIGHT_MODULE) {
    const { chromium } = createRequire(import.meta.url)(process.env.WORKBOX_PLAYWRIGHT_MODULE);
    const chrome = await chromium.launch({ executablePath: process.env.WORKBOX_CHROME_BIN, headless: true });
    try {
      const page = await chrome.newPage();
      await page.goto(origin + lineageHref);
      await page.waitForURL(origin + followed.href);
      await page.getByText("Merged revision", { exact: true }).waitFor();
      await page.getByRole("link", { name: "Pull requests", exact: true }).waitFor();
    } finally {
      await chrome.close();
    }
  }


  const trunk = git("rev-parse", "HEAD").trim();
  git("switch", "-qc", "fork");
  const forkHead = commitReadme("Fork\n");
  const { id: fork } = JSON.parse(hn("proposal", "publish", "--base", trunk, "--base-ref", "refs/heads/trunk",
    "--head", forkHead, "--actor", actor, "--operation", "status-parity-fork", "--title", "Fork", "--json")).data;
  assert.ok(fork);
  const choices = ["First successor", "Second successor"].map(label => {
    const head = commitReadme(label + "\n");
    const id = hn("proposal", "revise", fork, "--base", trunk, "--head", head).match(/sha256:[a-f0-9]{64}/)?.[0];
    assert.ok(id);
    return id;
  });
  index();
  const before = snapshot();
  const selection = (await lookup(fork, "lineage")).data.data;
  assert.equal(selection.kind, "choose");
  assert.deepEqual(new Set(selection.choices.map(({ id }: { id: string }) => id)), new Set(choices));
  const chooser = await browser("/p/repo/proposals/" + encodeURIComponent(fork) + "?mode=lineage&view=checks");
  assert.match(chooser, /Choose a revision/);
  for (const choice of selection.choices) assert.ok(chooser.includes(choice.href), choice.href);
  writeFileSync(disableStatus, "");
  const incomplete = (await lookup(restored)).data.data;
  assert.equal(incomplete.id, restored);
  assert.equal(incomplete.incomplete, true);
  assert.equal(incomplete.blockers, null);
  assert.equal(incomplete.merge, null);
  assert.match(await browser(incomplete.href), /evaluation for this revision is unavailable/);
  assert.deepEqual(snapshot(), before);
  rmSync(disableStatus);

  const missing = "sha256:" + "0".repeat(64);
  assert.deepEqual((await lookup(missing)).data, {
    ok: false, error: { code: "unavailable", message: "Proposal revision unavailable." },
  });
  assert.match(await browser("/p/repo/proposals/" + encodeURIComponent(missing)), /Proposal unavailable/);
});
