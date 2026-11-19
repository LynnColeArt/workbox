import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readProposalComparison } from "../src/lib/workbox/proposal-comparison";

test("debug proposal git plumbing", (t) => {
  const repo = mkdtempSync(join(tmpdir(), "workbox-debug-diff-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  writeFileSync(join(repo, "file.txt"), "first\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(repo, "file.txt"), "second\n");
  git("add", "-A");
  git("commit", "-qm", "head");
  const head = git("rev-parse", "HEAD");
  const tree = git("rev-parse", "--verify", `${head}^{tree}`);
  const gitDir = git("rev-parse", "--absolute-git-dir");
  const wt = mkdtempSync(join(tmpdir(), "workbox-debug-attrs-"));
  t.after(() => rmSync(wt, { recursive: true, force: true }));
  const run = (args: string[]) => {
    const r = spawnSync("git", ["--no-pager", "--no-replace-objects", ...args], {
      cwd: wt, encoding: "utf8", env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
    });
    return `status=${r.status} out=${JSON.stringify(r.stdout)} err=${JSON.stringify(r.stderr)}`;
  };
  const dir = [`--git-dir=${gitDir}`, `--work-tree=${wt}`];
  const results = [
    `gitDir=${gitDir}`,
    `wt=${wt}`,
    `ls-tree: ${run([...dir, "ls-tree", "-r", "-z", "--full-tree", tree, "--", ".gitattributes", ":(glob)**/.gitattributes"])}`,
    `diff-name-status: ${run([...dir, "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-relative", "--ignore-submodules=none", "--submodule=short", "--find-renames", "--name-status", "-z", base, head, "--"])}`,
    `shortstat: ${run([...dir, "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-relative", "--ignore-submodules=none", "--submodule=short", "--find-renames", "--shortstat", base, head, "--"])}`,
    `cat-file: ${run(["cat-file", "--batch-check=%(objectname) %(objecttype)", base])}`,
  ];
  const actual = readProposalComparison(repo, { base, head }, "file.txt");
  results.push(`readProposalComparison=${JSON.stringify(actual)}`);
  assert.fail(results.join("\n"));
});
