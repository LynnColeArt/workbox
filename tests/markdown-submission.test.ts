import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { openDb } from "../src/lib/workbox/db";

test("production proposal signing preserves Markdown and replays the original revision", {
  skip: process.env.WORKBOX_MARKDOWN_PARITY_TEST !== "1", timeout: 45_000,
}, async t => {
  const dir = mkdtempSync(join(tmpdir(), "wb-markdown-submit-"));
  const repo = join(dir, "repo");
  mkdirSync(repo);
  const dbPath = join(dir, "index.sqlite");
  const hn = resolve(process.env.WORKBOX_HN_BIN ?? "/tmp/hn");
  const env = {
    ...process.env, WORKBOX_DB_PATH: dbPath, WORKBOX_HN_BIN: hn,
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(dir, "empty-config"),
    GIT_AUTHOR_NAME: "Markdown fixture", GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Markdown fixture", GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  const run = (bin: string, ...args: string[]) => execFileSync(bin, args, { cwd: repo, env, encoding: "utf8" }).trim();
  const git = (...args: string[]) => run("git", ...args);
  git("init", "-q", "-b", "main");
  git("commit", "--allow-empty", "-qm", "Initial commit");
  run(hn, "init", "--name", "Markdown fixture");
  const actor = JSON.parse(run(hn, "identity", "show", "--json")).data.actor;
  mkdirSync(join(repo, ".hn"), { recursive: true });
  writeFileSync(join(repo, ".hn", "policy.json"), JSON.stringify({
    version: "hn.policy/0", maintainers: [actor],
    proposals: { requiredApprovals: 1, requiredAccepts: 1, trustedReviewers: [actor] },
  }));
  git("add", ".hn/policy.json");
  git("commit", "-qm", "Policy");
  git("switch", "-qc", "feature");
  git("commit", "--allow-empty", "-qm", "First revision");
  using db = openDb(dbPath);
  db.prepare("INSERT INTO projects (id,name,repo_path) VALUES (?,?,?)").run("markdown", "Markdown", repo);
  const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "0"], { env });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const done = once(server, "close");
      server.kill();
      await done;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const origin = await new Promise<string>((ready, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(Error(output)), 10_000);
    server.stderr.on("data", chunk => { output += chunk; });
    server.stdout.on("data", chunk => {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url && output.includes("Ready in")) { clearTimeout(timer); ready(url); }
    });
    server.once("exit", () => { clearTimeout(timer); reject(Error(output)); });
    server.once("error", error => { clearTimeout(timer); reject(error); });
  });
  const post = async (payload: object) => {
    const response = await fetch(origin + "/api/projects/markdown/proposals", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: t.signal,
    });
    return response.json();
  };
  const body = "  **keep** this 🌱\r\n\r\n- line\n\n";
  const input = { title: "Exact Markdown", body, operationId: randomUUID(), head: "feature" };
  const refs = () => git("for-each-ref", "refs/hn");
  const before = refs();
  const prepared = await post({ ...input, prepare: true });
  assert.ok(prepared.ok, JSON.stringify(prepared));
  assert.equal(refs(), before);
  const exact = prepared.data.exact;
  const published = await post({ ...input, exact });
  assert.ok(published.ok, JSON.stringify(published));
  const signed = JSON.parse(run(hn, "proposal", "operation", "--actor", actor, "--operation", input.operationId, "--json"));
  assert.equal(signed.data.body, body);
  assert.equal(signed.data.head, exact.head);
  assert.equal(signed.data.id, published.data.proposalId);
  const after = refs();
  git("commit", "--allow-empty", "-qm", "Moved branch");
  assert.deepEqual(await post({ ...input, exact }), published);
  assert.equal((await post({ ...input, exact, body: body.trim() })).error.code, "operation_conflict");
  assert.equal((await post({ ...input, exact, operationId: randomUUID() })).error.code, "stale_base");
  assert.equal(refs(), after);
});
