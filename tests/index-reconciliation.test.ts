import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDb } from "../src/lib/workbox/db";
import { ensureProject, indexProject } from "../src/lib/workbox/index";

test("reconciles replicated actor history and preserves its issue number", {
  skip: !process.env.WORKBOX_HN_BIN,
}, () => {
  const repoPath = mkdtempSync(join(tmpdir(), "workbox-index-"));
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repoPath, encoding: "utf8" }).trim();
    const hn = (...args: string[]) => execFileSync(process.env.WORKBOX_HN_BIN!, args, { cwd: repoPath });
    git("init", "-qb", "main");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "Seed");
    hn("init", "--name", "Fixture");
    hn("issue", "open", "Replicated issue");
    const local = git("for-each-ref", "--format=%(refname)", "refs/hn/actors");
    const remote = local.replace("refs/hn/actors/", "refs/hn/remotes/fixture/actors/");
    const oid = git("rev-parse", local);
    git("update-ref", remote, oid);
    git("update-ref", "-d", local);
    const project = { id: "fixture", repoPath, name: "Fixture", description: "" };
    using db = openDb(":memory:");
    ensureProject(db, project);
    indexProject(db, project);
    const first = db.prepare("SELECT issue_id, number FROM issues").get();
    assert.ok(first);
    git("update-ref", "-d", remote);
    indexProject(db, project);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM events").get()?.count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM issues").get()?.count, 0);
    git("update-ref", remote, oid);
    indexProject(db, project);
    assert.deepEqual(db.prepare("SELECT issue_id, number FROM issues").get(), first);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});
