import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openDb } from "../src/lib/workbox/db";
import { openPipelineDraft, editPipelineDraft } from "../src/lib/workbox/pipeline-draft";
import { createPipelineDiff, reviewPipelineDraft } from "../src/lib/workbox/pipeline-review";
import { prepareSettingsCandidate } from "../src/lib/workbox/settings-candidate";

test("diff preserves byte-significant whitespace, line endings, and the last newline", () => {
  const before = "  雪\r\nnext\r";
  const after = " 雪\nnext";
  const result = createPipelineDiff(before, after);
  assert.deepEqual(result, {
    state: "complete",
    before,
    after,
    hunks: [{
      oldStart: 1, oldCount: 2, newStart: 1, newCount: 2,
      lines: [
        { kind: "remove", text: "  雪", ending: "crlf" },
        { kind: "remove", text: "next", ending: "cr" },
        { kind: "add", text: " 雪", ending: "lf" },
        { kind: "add", text: "next", ending: "none" },
      ],
    }],
  });
});

test("diff distinguishes a new file and an empty committed file", () => {
  const result = createPipelineDiff(null, "new\nline\n");
  assert.equal(result.before, null);
  assert.equal(result.state, "complete");
  assert.deepEqual(result.hunks, [{
    oldStart: 0, oldCount: 0, newStart: 1, newCount: 2,
    lines: [{ kind: "add", text: "new", ending: "lf" }, { kind: "add", text: "line", ending: "lf" }],
  }]);
  assert.equal(createPipelineDiff("", result.after).before, "");
});

test("diff reports stable, separate ranges for changes with distant context", () => {
  const middle = Array.from({ length: 10 }, (_, index) => `keep ${index}\n`).join("");
  const result = createPipelineDiff(`first\n${middle}last\n`, `last\n${middle}first\n`);
  assert.deepEqual(result.hunks.map(({ oldStart, oldCount, newStart, newCount }) =>
    [oldStart, oldCount, newStart, newCount]), [[1, 4, 1, 4], [9, 4, 9, 4]]);
});

test("large review keeps exact source text when diff work or rendered output is bounded", () => {
  const before = "old\n".repeat(900);
  const after = "new\r\n".repeat(900);
  assert.deepEqual(createPipelineDiff(before, after), { state: "incomplete", hunks: [], before, after });
  const added = "new\n".repeat(1500);
  const result = createPipelineDiff(null, added);
  assert.equal(result.state, "incomplete");
  assert.equal(result.after, added);
});

const original = JSON.stringify({ version: "hn.pipeline/0", steps: [{ name: "Checks", command: "checks" }] });
const path = ".hn/pipelines/ci.json";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-pipeline-review-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "unused"), GIT_CONFIG_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" });
  git("init", "-q", "--initial-branch=trunk");
  git("config", "user.name", "Fixture Author");
  git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(repo, ".hn", "pipelines"), { recursive: true });
  writeFileSync(join(repo, path), original);
  git("add", path);
  git("commit", "-qm", "Pipeline base");
  const db = openDb(join(root, "index.sqlite"));
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run("fixture", "Fixture", repo);
  t.after(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
  const gitDir = join(repo, ".git");
  const snapshot = () => ({
    refs: git("show-ref"),
    status: git("status", "--porcelain"),
    objects: readdirSync(join(gitDir, "objects"), { recursive: true }).sort(),
    index: readFileSync(join(gitDir, "index")),
    pipeline: readFileSync(join(repo, path)),
  });
  return { repo, db, git, snapshot };
}

test("review is read-only, uses exact bytes, and refuses stale or invalid drafts", async (t) => {
  const { repo, db, git, snapshot } = fixture(t);
  const initial = snapshot();
  const draft = openPipelineDraft(db, "fixture", { name: "ci" });
  assert.equal(draft.ok, true);
  const definition = original.replace("Checks", "雪") + "\r\n";
  const edited = editPipelineDraft(db, "fixture", {
    draft: draft.data, expectedRevision: draft.data.revision, edit: { kind: "replace_json", definition },
  });
  assert.equal(edited.ok, true);

  const reviewed = await reviewPipelineDraft(db, "fixture", { draft: edited.data, expectedRevision: edited.data.revision });
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.data.before, original);
  assert.equal(reviewed.data.definition, definition);
  assert.equal(reviewed.data.diff.after, definition);
  assert.equal(reviewed.data.draftRevision, edited.data.revision);
  assert.deepEqual(snapshot(), initial);

  const candidate = prepareSettingsCandidate(repo, {
    base: reviewed.data.base.commit, path, definition: reviewed.data.definition, operationId: `settings_${reviewed.data.digest}`,
  });
  assert.ok(candidate);
  assert.equal(git("show", `${candidate}:${path}`), reviewed.data.diff.after);
  const wrongRevision = await reviewPipelineDraft(db, "fixture", { draft: edited.data, expectedRevision: draft.data.revision });
  assert.equal(wrongRevision.ok, false);
  assert.equal(wrongRevision.error.code, "stale_preview");

  const invalid = editPipelineDraft(db, "fixture", {
    draft: edited.data, expectedRevision: edited.data.revision, edit: { kind: "replace_json", definition: "{" },
  });
  assert.equal(invalid.ok, true);
  const invalidReview = await reviewPipelineDraft(db, "fixture", { draft: invalid.data, expectedRevision: invalid.data.revision });
  assert.equal(invalidReview.ok, false);
  assert.equal(invalidReview.error.code, "invalid_input");

  // Move the base to the exact draft. This is stale even if legacy preview reports unchanged.
  writeFileSync(join(repo, path), definition);
  git("add", path);
  git("commit", "-qm", "Advance default branch");
  const moved = await reviewPipelineDraft(db, "fixture", { draft: edited.data, expectedRevision: edited.data.revision });
  assert.equal(moved.ok, false);
  assert.equal(moved.error.code, "stale_preview");
});
