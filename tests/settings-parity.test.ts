import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { openDb } from "../src/lib/workbox/db";

test("Settings HTTP and MCP agree and unsupported submission leaves Git intact", {
  skip: process.env.WORKBOX_SETTINGS_PARITY_TEST !== "1",
  timeout: 40_000,
}, async t => {
  const directory = mkdtempSync(join(tmpdir(), "workbox-settings-parity-"));
  const repo = join(directory, "repo");
  mkdirSync(repo);
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(directory, "no-global-config"),
    WORKBOX_DB_PATH: join(directory, "index.db"),
    WORKBOX_HN_BIN: join(directory, "unavailable-hn"),
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8", timeout: 5000 });
  git("init", "-q", "-b", "trunk");
  writeFileSync(join(repo, "README.md"), "Fixture\n");
  git("add", "README.md");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Seed");
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
  function agent(name: string, input: Record<string, unknown> = {}) {
    const request = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { project: "repo", ...input } } });
    const result = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "mcp/server.ts"], {
      env, input: request + "\n", encoding: "utf8", timeout: 7000, stdio: ["pipe", "pipe", "pipe"],
    })).result;
    return { data: JSON.parse(result.content[0].text), isError: result.isError };
  }

  assert.deepEqual((await browser()).data, agent("workbox_repo_settings").data);
  assert.equal((await browser({ action: "update", name: "Denied" }, "https://other.invalid")).status, 403);
  assert.equal((await browser({ action: "update", name: "Browser rename" })).status, 200);
  assert.equal(agent("workbox_update_repo_details", { description: "Agent description" }).isError, false);
  const updated = (await browser()).data;
  assert.equal(updated.data.details.name, "Browser rename");
  assert.equal(updated.data.details.description, "Agent description");
  assert.deepEqual(updated, agent("workbox_repo_settings").data);

  const before = [git("show-ref"), git("status", "--porcelain=v1"), git("ls-files", "--stage")];
  const draft = { name: "check", definition: '{"version":"hn.pipeline/0","steps":[{"name":"check","command":"true"}]}' };
  const preview = (await browser({ action: "preview", ...draft })).data;
  assert.equal(preview.ok, true);
  assert.deepEqual(preview, agent("workbox_preview_pipeline", draft).data);
  const invalid = { ...draft, definition: "{}" };
  assert.deepEqual((await browser({ action: "preview", ...invalid })).data, agent("workbox_preview_pipeline", invalid).data);
  const submission = { ...draft, digest: preview.data.digest, operationId: "settings-fixture-001", confirmed: true };
  const unavailable = await browser({ action: "submit", ...submission });
  assert.equal(unavailable.status, 501);
  assert.equal(unavailable.data.error.code, "unsupported");
  assert.deepEqual(unavailable.data, agent("workbox_submit_pipeline_proposal", submission).data);
  assert.deepEqual((await browser({ action: "submit", ...submission })).data, unavailable.data);
  assert.deepEqual(before, [git("show-ref"), git("status", "--porcelain=v1"), git("ls-files", "--stage")]);

  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "Advance base");
  const advancedRefs = git("show-ref");
  const stale = await browser({ action: "submit", ...submission });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error.code, "stale_preview");
  assert.deepEqual(stale.data, agent("workbox_submit_pipeline_proposal", submission).data);
  assert.equal(git("show-ref"), advancedRefs);

  const page = await fetch(origin + "/p/repo/settings", { signal: t.signal });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Repository details/);
});
