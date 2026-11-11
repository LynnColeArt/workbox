import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readProposalComparison } from "../src/lib/workbox/proposal-comparison";

function fixture(t: { after(callback: () => void): void }) {
  const repo = mkdtempSync(join(tmpdir(), "workbox-proposal-diff-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  const write = (path: string, content: string | Buffer) => writeFileSync(join(repo, path), content);
  const commit = (subject: string) => {
    git("add", "-A");
    git("commit", "-qm", subject);
    return git("rev-parse", "HEAD");
  };
  return { repo, git, write, commit };
}

test("comparison stays pinned as the branch moves and Git replacement refs change", (t) => {
  const { repo, git, write, commit } = fixture(t);
  write("file.txt", "first\n");
  const base = commit("base");
  write("file.txt", "second\n");
  const head = commit("head");
  const expected = readProposalComparison(repo, { base, head }, "file.txt");
  assert.equal(expected.status, "available");
  assert.equal(expected.patch?.status, "available");
  assert.match(expected.patch?.text ?? "", /-first\n\+second/);
  write("file.txt", "third\n");
  write(".gitattributes", "file.txt -diff\n");
  const moved = commit("new branch tip");
  git("replace", head, moved);
  assert.deepEqual(readProposalComparison(repo, { base, head }, "file.txt"), expected);
});

test("exact commit validation rejects missing, symbolic, abbreviated, and non-commit objects", (t) => {
  const { repo, git, write, commit } = fixture(t);
  write("file.txt", "content\n");
  const head = commit("head");
  for (const base of ["f".repeat(head.length), "HEAD", head.slice(0, 12), git("rev-parse", "HEAD:file.txt")]) {
    assert.equal(readProposalComparison(repo, { base, head }).status, "unavailable", base);
  }
});

test("NUL-delimited metadata and literal selection preserve renames, binary files, and unusual paths", (t) => {
  const { repo, git, write, commit } = fixture(t);
  write("old name", "unchanged rename content\n");
  write("existing.txt", "existing\n");
  const base = commit("base");
  git("mv", "old name", "new name");
  write("binary.bin", Buffer.from([0, 1, 2]));
  write(":(glob)*.txt", "literal path\n");
  write("line\nbreak", "newline path\n");
  const head = commit("head");

  const renamed = readProposalComparison(repo, { base, head }, "new name");
  assert.deepEqual(renamed.files.find(({ path }) => path === "new name"), {
    path: "new name", previousPath: "old name", status: "R100",
  });
  assert.match(renamed.patch?.text ?? "", /rename from old name\nrename to new name/);
  assert.equal(readProposalComparison(repo, { base, head }, "binary.bin").patch?.status, "binary");
  const literal = readProposalComparison(repo, { base, head }, ":(glob)*.txt").patch;
  assert.match(literal?.text ?? "", /\+literal path/);
  assert.doesNotMatch(literal?.text ?? "", /binary.bin|new name/);
  assert.match(readProposalComparison(repo, { base, head }, "line\nbreak").patch?.text ?? "", /\+newline path/);
  assert.equal(readProposalComparison(repo, { base, head }, "existing.txt").patch?.status, "unlisted");
});

test("bounds large patches and ignores external diff and text conversion", (t) => {
  const { repo, git, write, commit } = fixture(t);
  write(".gitattributes", "*.txt diff=workboxfixture\n");
  write("file.txt", "before\n");
  const base = commit("base");
  git("config", "diff.external", "false");
  git("config", "diff.workboxfixture.textconv", "false");
  write("file.txt", "after\n");
  const small = commit("small");
  assert.match(readProposalComparison(repo, { base, head: small }, "file.txt").patch?.text ?? "", /-before\n\+after/);
  write("file.txt", "content ".repeat(100_000) + "\n");
  const large = commit("large");
  const result = readProposalComparison(repo, { base, head: large }, "file.txt");
  assert.equal(result.patch?.status, "truncated");
  assert.ok(Buffer.byteLength(result.patch?.text ?? "") <= 128 * 1024);
});

test("does not expose descendant patches when a file becomes a directory", (t) => {
  const { repo, write, commit } = fixture(t);
  write("path", "original file\n");
  const base = commit("base");
  rmSync(join(repo, "path"));
  mkdirSync(join(repo, "path"));
  write("path/child", "different listed file\n");
  const head = commit("head");
  const result = readProposalComparison(repo, { base, head }, "path");
  assert.deepEqual(result.files.map(({ path }) => path), ["path", "path/child"]);
  assert.match(result.patch?.text ?? "", /-original file/);
  assert.doesNotMatch(result.patch?.text ?? "", /different listed file/);
  assert.match(readProposalComparison(repo, { base, head }, "path/child").patch?.text ?? "", /\+different listed file/);
});

test("limits the file list and rejects selection outside the returned entries", (t) => {
  const { repo, write, commit } = fixture(t);
  write("base.txt", "base\n");
  const base = commit("base");
  for (let i = 0; i <= 200; i++) {
    write(`change-${String(i).padStart(3, "0")}.txt`, "changed\n");
  }
  const head = commit("head");
  const result = readProposalComparison(repo, { base, head }, "change-200.txt");
  assert.equal(result.status, "truncated");
  assert.equal(result.files.length, 200);
  assert.equal(result.patch?.status, "unlisted");
});
