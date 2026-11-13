import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test, { type TestContext } from "node:test";
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

test("Settings browser endpoint and MCP share trigger reads, exact draft review, and signing", {
  skip: !process.env.WORKBOX_AUTOMATIC_CHECKS_HN,
  timeout: 45_000,
}, async t => {
  const { repo, git, hn, browser, agent } = await settingsFixture(t, process.env.WORKBOX_AUTOMATIC_CHECKS_HN);
  hn("init", "--name", "Fixture");
  const { actor } = JSON.parse(hn("identity", "show", "--json")).data;
  mkdirSync(join(repo, ".hn"), { recursive: true });
  writeFileSync(join(repo, ".hn", "policy.json"), JSON.stringify({
    version: "hn.policy/0", maintainers: [actor],
    proposals: { trustedReviewers: [actor], requiredApprovals: 1, requiredAccepts: 1 },
  }));
  git("add", ".hn");
  git("commit", "-qm", "Repository policy");
  const before = git("show-ref");
  const read = (await browser({ action: "triggers_read" })).data;
  assert.ok(read.ok);
  assert.deepEqual(read, (await agent("workbox_proposal_triggers")).data);
  const draft = {
    configuration: { version: "hn.proposal-checks/1", pipelines: { test: ["proposal.open", "proposal.revise"] } },
    name: "test",
    definition: JSON.stringify({ version: "hn.pipeline/0", steps: [{ name: "Test", command: "true" }] }),
  };
  const invalid = { configuration: draft.configuration };
  assert.deepEqual((await browser({ action: "triggers_preview", ...invalid })).data,
    (await agent("workbox_review_proposal_triggers", invalid)).data);
  const preview = (await browser({ action: "triggers_preview", ...draft })).data;
  assert.ok(preview.ok, JSON.stringify(preview));
  assert.deepEqual(preview, (await agent("workbox_review_proposal_triggers", draft)).data);
  assert.equal(git("show-ref"), before);
  const { base, digest, files } = preview.data;
  const input = { ...draft, base, digest, actor, operationId: "trigger-parity-0001", confirmed: true };
  assert.equal((await browser({ action: "triggers_submit", ...input }, "https://outside.invalid")).status, 403);
  const submission = (await browser({ action: "triggers_submit", ...input })).data;
  assert.ok(submission.ok, JSON.stringify(submission));
  assert.deepEqual(submission, (await agent("workbox_submit_proposal_triggers", input)).data);
  for (const file of files) assert.equal(git("show", submission.data.head + ":" + file.path), file.after);
  assert.deepEqual((await browser({ action: "triggers_read" })).data, read);
});
