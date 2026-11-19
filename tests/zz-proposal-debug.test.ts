import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readProposalComparison } from "../src/lib/workbox/proposal-comparison";

function fixture(t: { after(callback: () => void): void }) {
  const repo = mkdtempSync(join(tmpdir(), "workbox-proposal-attrs-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  const write = (path: string, content: string) => writeFileSync(join(repo, path), content);
  const commit = (subject: string) => {
    git("add", "-A");
    git("commit", "-qm", subject);
    return git("rev-parse", "HEAD");
  };
  return { repo, git, write, commit };
}

test("historical attributes are read from the reviewed tree without unsupported pathspec magic", (t) => {
  const { repo, write, commit } = fixture(t);
  mkdirSync(join(repo, "nested"));
  write(".gitattributes", "*.txt text\n");
  write("nested/.gitattributes", "*.txt text\n");
  write("nested/file.txt", "before\n");
  const base = commit("base");
  write("nested/file.txt", "after\n");
  const head = commit("head");

  // The mutable checkout now says these files are binary. The reviewed head
  // tree still says they are text, so the pinned comparison must use the
  // private historical attribute tree.
  write(".gitattributes", "* -diff\n");
  write("nested/.gitattributes", "* -diff\n");

  const result = readProposalComparison(repo, { base, head }, "nested/file.txt");
  assert.equal(result.status, "available");
  assert.equal(result.patch?.status, "available");
  assert.match(result.patch?.text ?? "", /-before\n\+after/);
});
