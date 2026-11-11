import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { readCode } from "../src/lib/workbox/code-browser";
import { openDb } from "../src/lib/workbox/db";
import { resolveCodeRevision } from "../src/lib/workbox/repo";

function fixture(t: TestContext, format: "sha1" | "sha256" = "sha1") {
  const root = mkdtempSync(join(tmpdir(), "workbox-code-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "unused"), GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch=main", `--object-format=${format}`);
  git("config", "user.name", "Fixture Author");
  git("config", "user.email", "fixture@example.invalid");
  function commit(subject: string, when: string) {
    git("add", "-A");
    execFileSync("git", ["commit", "-qm", subject], {
      cwd: repo, env: { ...env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
    });
    return git("rev-parse", "HEAD");
  }
  const db = openDb(join(root, "index.sqlite"));
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run("code-fixture", "Code fixture", repo);
  t.after(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
  const read = (query?: Parameters<typeof readCode>[2]) => readCode(db, "code-fixture", query);
  return { root, repo, git, commit, read, db };
}

test("directory rows carry descendant commits, and nested names round-trip as literal paths", (t) => {
  const { repo, commit, read } = fixture(t);
  const firstDate = "2025-04-01T10:00:00+00:00";
  const secondDate = "2025-04-02T10:00:00+00:00";
  const filename = "a space and 雪 [draft].md";
  const path = `docs/${filename}`;
  mkdirSync(join(repo, "docs"));
  writeFileSync(join(repo, "README.md"), "intro\n");
  writeFileSync(join(repo, path), "first\n");
  const first = commit("Create docs", firstDate);
  writeFileSync(join(repo, path), "second\n");
  const second = commit("Revise guide", secondDate);

  const root = read();
  assert.equal(root.kind, "directory");
  assert.equal(root.branch, "main");
  assert.equal(root.at, second);
  assert.deepEqual(root.entries.map((e) => [e.name, e.lastChange?.sha]), [["docs", second], ["README.md", first]]);
  assert.equal(root.entries[0].lastChange?.when, secondDate);
  assert.equal(root.entries[0].lastChange?.author, "Fixture Author");
  assert.equal(root.historyIncomplete, false);

  const nested = read({ at: second, path: "docs" });
  assert.equal(nested.kind, "directory");
  assert.equal(nested.entries[0].name, filename);
  assert.equal(nested.entries[0].lastChange?.sha, second);
  assert.equal(new URL(nested.entries[0].href, "http://localhost").searchParams.get("path"), path);

  const file = read({ at: second, path });
  assert.equal(file.kind, "file");
  assert.equal(file.content, "second\n");
  assert.equal(file.lastChange?.sha, second);
  assert.equal(file.introduced?.sha, first);
  assert.equal(file.introduced?.when, firstDate);

  const detail = read({ at: second, commit: second });
  assert.equal(detail.kind, "commit");
  assert.equal(detail.commit.subject, "Revise guide");
  assert.deepEqual(detail.changes.map((change) => [change.status, change.path]), [["M", path]]);
  assert.equal(new URL(detail.changes[0].href!, "http://localhost").searchParams.get("path"), path);
});

test("configured default and explicit branch selections resolve once and pins survive branch advancement", (t) => {
  const { repo, commit, git, read } = fixture(t);
  writeFileSync(join(repo, "guide.txt"), "main\n");
  const main = commit("Main version", "2025-04-01T10:00:00Z");
  git("switch", "-qc", "feature/docs");
  writeFileSync(join(repo, "guide.txt"), "feature\n");
  const feature = commit("Feature version", "2025-04-02T10:00:00Z");
  assert.equal(resolveCodeRevision(repo)?.branch, "main");
  git("update-ref", "refs/remotes/origin/feature/docs", feature);
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/feature/docs");
  assert.equal(resolveCodeRevision(repo)?.branch, "feature/docs");
  assert.equal(resolveCodeRevision(repo, "main")?.commit, main);

  const before = read({ rev: "feature/docs", path: "guide.txt" });
  assert.equal(before.kind, "file");
  assert.equal(before.at, feature);
  writeFileSync(join(repo, "guide.txt"), "new tip\n");
  commit("Branch advances", "2025-04-03T10:00:00Z");
  const query = Object.fromEntries(new URL(before.href, "http://localhost").searchParams);
  const pinned = read(query);
  assert.equal(pinned.kind, "file");
  assert.equal(pinned.content, "feature\n");
  assert.equal(pinned.at, feature);
  assert.equal(read({ rev: "main", at: feature }).kind, "unavailable");
  assert.equal(read({ rev: "main", commit: feature }).kind, "unavailable");
  assert.equal(read({ rev: "feature/docs", at: feature.slice(0, 8) }).kind, "unavailable");
  assert.equal(read({ rev: "refs/heads/main" }).kind, "unavailable");
});

test("file introduction follows a rename and commit changes retain both paths", (t) => {
  const { repo, commit, git, read } = fixture(t);
  writeFileSync(join(repo, "old.md"), "same content\n");
  const first = commit("Introduce original", "2025-04-01T10:00:00Z");
  git("mv", "old.md", "new.md");
  const second = commit("Rename document", "2025-04-02T10:00:00Z");

  const file = read({ path: "new.md" });
  assert.equal(file.kind, "file");
  assert.equal(file.introduced?.sha, first);
  assert.equal(file.lastChange?.sha, second);
  const detail = read({ commit: second });
  assert.equal(detail.kind, "commit");
  assert.deepEqual(detail.changes.map(({ status, previousPath, path }) => ({ status, previousPath, path })),
    [{ status: "R100", previousPath: "old.md", path: "new.md" }]);
  const initial = read({ commit: first });
  assert.equal(initial.kind, "commit");
  assert.equal(initial.changes[0].status, "A");
});

test("SHA-256 commit ids survive links and unavailable paths never include native diagnostics", (t) => {
  const { repo, commit, read } = fixture(t, "sha256");
  writeFileSync(join(repo, "binary"), Buffer.from([0, 1, 2]));
  const sha = commit("Add binary", "2025-04-01T10:00:00Z");
  const file = read({ path: "binary" });
  assert.equal(file.kind, "file");
  assert.equal(file.binary, true);
  assert.equal(file.at, sha);
  assert.equal(sha.length, 64);
  assert.equal(new URL(file.lastChange!.href, "http://localhost").searchParams.get("commit"), sha);
  for (const query of [{ path: "../secret" }, { path: "/absolute" }, { path: "missing" }, { at: ["duplicate"] }]) {
    const result = read(query);
    assert.equal(result.kind, "unavailable");
    assert.ok(!JSON.stringify(result).includes(repo));
  }
});

test("shallow history does not claim a file was introduced by the shallow boundary", (t) => {
  const { root, repo, commit, db, read } = fixture(t);
  const file = join(repo, "file");
  writeFileSync(file, "original\n");
  commit("Add original", "2025-04-01T10:00:00Z");
  writeFileSync(file, "second\n");
  commit("Update original", "2025-04-02T10:00:00Z");
  const shallow = join(root, "shallow");
  execFileSync("git", ["clone", "-q", "--depth=1", `file://${repo}`, shallow]);
  db.prepare("UPDATE projects SET repo_path = ? WHERE id = ?").run(shallow, "code-fixture");
  const result = read({ path: "file" });
  assert.equal(result.kind, "file");
  assert.equal(result.content, "second\n");
  assert.equal(result.introduced, null);
  assert.equal(result.historyIncomplete, true);
  const detail = read({ commit: result.at });
  assert.equal(detail.kind, "commit");
  assert.deepEqual(detail.changes, []);
  assert.equal(detail.historyIncomplete, true);
});

test("Git replacement refs and uncommitted files cannot change pinned reads", (t) => {
  const { repo, git, commit, read } = fixture(t);
  const file = join(repo, "guide.txt");
  writeFileSync(file, "first\n");
  const first = commit("Original commit", "2025-04-01T10:00:00Z");
  writeFileSync(file, "second\n");
  const second = commit("Second commit", "2025-04-02T10:00:00Z");
  git("replace", first, second);
  writeFileSync(file, "uncommitted\n");

  const result = read({ at: first, path: "guide.txt" });
  assert.equal(result.kind, "file");
  assert.equal(result.content, "first\n");
  assert.equal(result.lastChange?.subject, "Original commit");
  assert.equal(result.lastChange?.sha, first);
});
