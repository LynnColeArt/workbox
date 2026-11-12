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

test("Settings HTTP and MCP agree and unsupported submission leaves Git intact", {
  skip: process.env.WORKBOX_SETTINGS_PARITY_TEST !== "1",
  timeout: 40_000,
}, async t => {
  const { origin, git, browser, agent } = await settingsFixture(t);

  assert.deepEqual((await browser()).data, (await agent("workbox_repo_settings")).data);
  assert.equal((await browser({ action: "update", name: "Denied" }, "https://other.invalid")).status, 403);
  assert.equal((await browser({ action: "update", name: "Browser rename" })).status, 200);
  assert.equal((await agent("workbox_update_repo_details", { description: "Agent description" })).isError, false);
  const updated = (await browser()).data;
  assert.equal(updated.data.details.name, "Browser rename");
  assert.equal(updated.data.details.description, "Agent description");
  assert.deepEqual(updated, (await agent("workbox_repo_settings")).data);

  const before = [git("show-ref"), git("status", "--porcelain=v1"), git("ls-files", "--stage")];
  const draft = { name: "check", definition: '{"version":"hn.pipeline/0","steps":[{"name":"check","command":"true"}]}' };
  const preview = (await browser({ action: "preview", ...draft })).data;
  assert.equal(preview.ok, true);
  assert.deepEqual(preview, (await agent("workbox_preview_pipeline", draft)).data);
  const invalid = { ...draft, definition: "{}" };
  assert.deepEqual((await browser({ action: "preview", ...invalid })).data, (await agent("workbox_preview_pipeline", invalid)).data);
  const { digest, actor, base } = preview.data;
  const submission = { ...draft, digest, actor, base, operationId: "settings-fixture-001", confirmed: true };
  const unavailable = await browser({ action: "submit", ...submission });
  assert.equal(unavailable.status, 501);
  assert.equal(unavailable.data.error.code, "unsupported");
  assert.deepEqual(unavailable.data, (await agent("workbox_submit_pipeline_proposal", submission)).data);
  assert.deepEqual((await browser({ action: "submit", ...submission })).data, unavailable.data);
  assert.deepEqual(before, [git("show-ref"), git("status", "--porcelain=v1"), git("ls-files", "--stage")]);

  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "Advance base");
  const advancedRefs = git("show-ref");
  const stale = await browser({ action: "submit", ...submission });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error.code, "stale_preview");
  assert.deepEqual(stale.data, (await agent("workbox_submit_pipeline_proposal", submission)).data);
  assert.equal(git("show-ref"), advancedRefs);

  const page = await fetch(origin + "/p/repo/settings", { signal: t.signal });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Repository details/);
});

test("Settings submits one exact native proposal across browser and MCP retries", {
  skip: process.env.WORKBOX_SETTINGS_NATIVE_TEST !== "1",
  timeout: 45_000,
}, async t => {
  assert.ok(process.env.WORKBOX_HN_BIN, "Set WORKBOX_HN_BIN to the proposal publication binary");
  const { repo, dbPath, origin, git, hn, browser, agent } = await settingsFixture(t, process.env.WORKBOX_HN_BIN);
  hn("init", "--name", "Settings Fixture");
  const { actor } = JSON.parse(hn("identity", "show", "--json")).data as { actor: string };
  const initialDraft = { name: "check", definition: '{"version":"hn.pipeline/0","steps":[{"name":"check","command":"true"}]}' };
  const initialPreview = (await browser({ action: "preview", ...initialDraft })).data;
  assert.equal(initialPreview.ok, true);
  const withoutPolicy = {
    ...initialDraft, actor, base: initialPreview.data.base, digest: initialPreview.data.digest,
    operationId: "settings-no-policy-001", confirmed: true,
  };
  const beforePolicy = git("show-ref");
  const policyRequired = await browser({ action: "submit", ...withoutPolicy });
  assert.equal(policyRequired.status, 409);
  assert.equal(policyRequired.data.error.code, "policy_required");
  assert.deepEqual((await agent("workbox_submit_pipeline_proposal", withoutPolicy)).data, policyRequired.data);
  assert.equal(git("show-ref"), beforePolicy);

  mkdirSync(join(repo, ".hn"), { recursive: true });
  writeFileSync(join(repo, ".hn", "policy.json"), JSON.stringify({
    version: "hn.policy/0",
    maintainers: [actor],
    proposals: { requiredApprovals: 1, requiredAccepts: 1, trustedReviewers: [actor] },
  }));
  git("add", ".hn/policy.json");
  git("commit", "-qm", "Repository policy");
  const baseCommit = git("rev-parse", "HEAD").trim();

  // Work on a different checkout so changing the default branch can be tested
  // independently of the real index and worktree.
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
  git("update-ref", "refs/remotes/origin/trunk", baseCommit);
  git("switch", "-qc", "other-work");
  writeFileSync(join(repo, "README.md"), "Uncommitted local work\n");
  git("add", "README.md");
  writeFileSync(join(repo, "README.md"), "Unstaged local work\n");
  const checkout = [git("status", "--porcelain=v1"), git("ls-files", "--stage"), git("rev-parse", "HEAD")];
  const previewBefore = [git("show-ref"), git("count-objects", "-v")];
  const draft = { name: "check", definition: '{\n  "version": "hn.pipeline/0",\n  "steps": [{"name":"check","command":"true"}]\n}\n' };
  const preview = (await browser({ action: "preview", ...draft })).data;
  assert.equal(preview.ok, true);
  assert.equal(preview.data.actor, actor);
  assert.deepEqual(preview.data.base, { branch: "trunk", commit: baseCommit });
  assert.deepEqual(preview, (await agent("workbox_preview_pipeline", draft)).data);
  const { digest, base } = preview.data;
  const submit = { ...draft, digest, base, actor, operationId: `settings_${digest}`, confirmed: true };

  const wrongSigner = { ...submit, actor: actor === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64) };
  const denied = await browser({ action: "submit", ...wrongSigner });
  assert.equal(denied.status, 403, JSON.stringify(denied.data));
  assert.deepEqual(denied.data, (await agent("workbox_submit_pipeline_proposal", wrongSigner)).data);
  assert.equal(git("for-each-ref", "--format=%(refname)", "refs/hn/proposals").trim(), "");
  assert.deepEqual([git("show-ref"), git("count-objects", "-v")], previewBefore);
  assert.deepEqual([git("status", "--porcelain=v1"), git("ls-files", "--stage"), git("rev-parse", "HEAD")], checkout);

  const fromAgent = agent("workbox_submit_pipeline_proposal", submit);
  const fromBrowser = browser({ action: "submit", ...submit });
  const [http, mcp] = await Promise.all([fromBrowser, fromAgent]);
  assert.equal(http.status, 200, JSON.stringify(http.data));
  assert.equal(mcp.isError, false, JSON.stringify(mcp.data));
  assert.deepEqual(http.data, mcp.data);
  assert.equal(http.data.ok, true);
  const published = http.data.data;
  assert.match(published.id, /^sha256:[a-f0-9]{64}$/);
  assert.equal(published.base, baseCommit);
  assert.equal(git("rev-parse", published.head + "^").trim(), baseCommit);
  assert.equal(git("diff", "--name-only", baseCommit, published.head).trim(), ".hn/pipelines/check.json");
  assert.equal(git("show", published.head + ":.hn/pipelines/check.json"), draft.definition);
  assert.equal(git("rev-parse", "refs/heads/trunk").trim(), baseCommit);
  assert.deepEqual([git("status", "--porcelain=v1"), git("ls-files", "--stage"), git("rev-parse", "HEAD")], checkout);
  const proposalRef = `refs/hn/proposals/${published.id.slice("sha256:".length)}`;
  const actorRef = `refs/hn/actors/${actor}`;
  assert.equal(git("for-each-ref", "--format=%(refname)", "refs/hn/proposals").trim(), proposalRef);
  assert.equal(git("rev-parse", proposalRef).trim(), published.head);
  assert.equal(git("rev-list", "--count", actorRef).trim(), "1");

  const conflicting = { ...submit, definition: draft.definition.trimEnd() };
  const conflict = await browser({ action: "submit", ...conflicting });
  assert.equal(conflict.status, 409, JSON.stringify(conflict.data));
  assert.equal(conflict.data.error.code, "operation_conflict");
  assert.deepEqual(conflict.data, (await agent("workbox_submit_pipeline_proposal", conflicting)).data);
  assert.equal(published.href, `/p/repo/proposals/${encodeURIComponent(published.id)}`);
  const details = await fetch(origin + published.href, { signal: t.signal });
  assert.equal(details.status, 200);
  assert.match(await details.text(), new RegExp(published.head));

  const advanced = git("commit-tree", baseCommit + "^{tree}", "-p", baseCommit, "-m", "Advance trunk").trim();
  git("update-ref", "refs/heads/trunk", advanced, baseCommit);
  const advancedRefs = git("show-ref");
  const stale = { ...submit, operationId: "settings-native-stale" };
  const staleHttp = await browser({ action: "submit", ...stale });
  assert.equal(staleHttp.status, 409, JSON.stringify(staleHttp.data));
  assert.equal(staleHttp.data.error.code, "stale_preview");
  assert.deepEqual(staleHttp.data, (await agent("workbox_submit_pipeline_proposal", stale)).data);
  assert.equal(git("show-ref"), advancedRefs);

  // A lost response can be retried against the original preview after trunk moves.
  assert.deepEqual((await browser({ action: "submit", ...submit })).data, http.data);
  assert.deepEqual((await agent("workbox_submit_pipeline_proposal", submit)).data, http.data);
  assert.equal(git("show-ref"), advancedRefs);

  // Recover the derived index if the process stopped after signing and publishing.
  {
    using db = openDb(dbPath);
    assert.equal(db.prepare("DELETE FROM events WHERE project_id = ? AND event_id = ?").run("repo", published.id).changes, 1);
  }
  assert.deepEqual((await browser({ action: "submit", ...submit })).data, http.data);
  {
    using db = openDb(dbPath);
    assert.ok(db.prepare("SELECT 1 FROM events WHERE project_id = ? AND event_id = ? AND verified = 1").get("repo", published.id));
  }
  assert.equal(git("show-ref"), advancedRefs);

  // Recreate the recoverable partial state with the signed opening still intact.
  git("update-ref", "-d", proposalRef, published.head);
  assert.deepEqual((await agent("workbox_submit_pipeline_proposal", submit)).data, http.data);
  assert.equal(git("show-ref"), advancedRefs);
  assert.equal(git("rev-list", "--count", actorRef).trim(), "1");
});
