import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("trigger review combines exact pipeline and trigger bytes without changing Git refs", {
  skip: !process.env.WORKBOX_HN_BIN,
}, async t => {
  const root = mkdtempSync(join(tmpdir(), "workbox-trigger-draft-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const env = { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_COMMITTER_NAME: "Fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_EMAIL: "fixture@example.invalid" };
  const cmd = (program: string, ...args: string[]) => execFileSync(program, args, { cwd: repo, env, encoding: "utf8" }).trim();
  const git = (...args: string[]) => cmd("git", ...args);
  git("init", "-q", "-b", "main");
  git("commit", "--allow-empty", "-qm", "Start");
  cmd(process.env.WORKBOX_HN_BIN!, "init", "--name", "Fixture");
  const { openDb } = await import("../src/lib/workbox/db");
  const { previewTriggerSettings } = await import("../src/lib/workbox/settings-submit");
  using db = openDb(join(root, "workbox.db"));
  db.prepare("INSERT INTO projects(id, name, repo_path) VALUES(?, ?, ?)").run("fixture", "Fixture", repo);
  const before = git("show-ref");
  const configuration = { version: "hn.proposal-checks/1", pipelines: { test: ["proposal.open", "proposal.revise"] } };
  const definition = JSON.stringify({ version: "hn.pipeline/0", steps: [{ name: "Test", command: "true" }] });
  const missing = await previewTriggerSettings(db, "fixture", { configuration });
  assert.ok(!missing.ok && missing.error.code === "invalid_input");
  const review = await previewTriggerSettings(db, "fixture", { configuration, name: "test", definition });
  assert.ok(review.ok, JSON.stringify(review));
  assert.deepEqual(review.data.files, [
    { path: ".hn/pipelines/test.json", before: null, after: definition },
    { path: ".hn/proposal-checks.json", before: null, after: JSON.stringify(configuration, null, 2) + "\n" },
  ]);
  assert.equal(git("show-ref"), before);
  assert.equal(git("status", "--porcelain"), "");
});
