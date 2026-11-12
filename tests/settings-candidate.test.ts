import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareSettingsCandidate } from "../src/lib/workbox/settings-candidate";

test("a Settings candidate preserves exact preview bytes and leaves the worktree and index alone", (t) => {
  const root = mkdtempSync(join(tmpdir(), "workbox-candidate-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "unused"), GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" });
  const path = ".hn/pipelines/ci.json";

  git("init", "-q", "--initial-branch=main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(repo, ".hn", "pipelines"), { recursive: true });
  writeFileSync(join(repo, path), "previous\n");
  writeFileSync(join(repo, "other.txt"), "committed\n");
  git("add", ".");
  git("commit", "-qm", "Base");
  const base = git("rev-parse", "HEAD").trim();

  git("switch", "-qc", "personal-work");
  writeFileSync(join(repo, "other.txt"), "staged\n");
  git("add", "other.txt");
  writeFileSync(join(repo, path), "uncommitted\n");
  writeFileSync(join(repo, "untracked.txt"), "keep\n");
  const status = git("status", "--porcelain");
  const refs = git("show-ref");
  const index = readFileSync(join(repo, ".git", "index"));

  // Candidate commits should ignore the user's configured signing preference.
  git("config", "commit.gpgsign", "true");
  const definition = ' { "title": "雪" }\r\n';
  const input = { base, path, definition, operationId: "fixture-operation-id" };
  const candidate = prepareSettingsCandidate(repo, input);
  assert.ok(candidate);
  assert.equal(prepareSettingsCandidate(repo, input), candidate);
  assert.notEqual(prepareSettingsCandidate(repo, { ...input, operationId: "different-operation-id" }), candidate);
  assert.equal(git("rev-parse", `${candidate}^`).trim(), base);
  assert.equal(git("show", `${candidate}:${path}`), definition);
  assert.equal(git("diff-tree", "--no-commit-id", "--name-only", "-r", candidate), `${path}\n`);
  assert.equal(git("show", `${candidate}:other.txt`), "committed\n");
  assert.equal(git("show-ref"), refs);
  assert.deepEqual(readFileSync(join(repo, ".git", "index")), index);
  assert.equal(git("status", "--porcelain"), status);
  assert.equal(readFileSync(join(repo, path), "utf8"), "uncommitted\n");
});
