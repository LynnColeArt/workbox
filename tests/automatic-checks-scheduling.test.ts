import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("Hubnot schedules only new exact candidates and preserves decisions across observer processes", {
  skip: !process.env.WORKBOX_AUTOMATIC_CHECKS_HN,
}, t => {
  const repo = mkdtempSync(join(tmpdir(), "hn-auto-schedule-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const hn = process.env.WORKBOX_AUTOMATIC_CHECKS_HN!;
  const cmd = (program: string, ...args: string[]) =>
    execFileSync(program, args, { cwd: repo, encoding: "utf8" }).trim();
  const git = (...args: string[]) => cmd("git", ...args);
  const native = (...args: string[]) => JSON.parse(cmd(hn, ...args, "--json")).data;
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Automatic checks");
  git("config", "user.email", "checks@example.invalid");
  cmd(hn, "init", "--name", "Runner maintainer");
  const { actor } = native("identity", "show");
  mkdirSync(join(repo, ".hn", "pipelines"), { recursive: true });
  const write = (file: string, value: unknown) => writeFileSync(join(repo, ".hn", file), JSON.stringify(value));
  write("policy.json", {
    version: "hn.policy/0", maintainers: [actor],
    proposals: { trustedReviewers: [actor], requiredApprovals: 1, requiredAccepts: 1 },
  });
  write("pipelines/test.json", {
    version: "hn.pipeline/0", steps: [{ name: "Test", command: "true" }],
  });
  write("proposal-checks.json", {
    version: "hn.proposal-checks/1", pipelines: { test: ["proposal.open", "proposal.revise"] },
  });
  git("add", ".hn");
  git("commit", "-qm", "Target configuration");
  const base = git("rev-parse", "main");
  git("switch", "-qc", "topic");
  const candidate = () => {
    git("commit", "--allow-empty", "-qm", "Candidate");
    return git("rev-parse", "HEAD");
  };
  const open = (operation: string, head: string) => native(
    "proposal", "publish", "--base", base, "--base-ref", "refs/heads/main", "--head", head,
    "--actor", actor, "--operation", operation, "--title", operation,
  ).id as string;
  const historical = open("historical", candidate());
  native("proposal-checks", "init", "refs/heads/main");
  assert.equal(native("proposal-checks", "status", historical).decision, "historical");
  const original = open("opening", candidate());
  native("proposal-checks", "observe");
  const opening = native("proposal-checks", "status", original);
  assert.equal(opening.checks.length, 1);
  assert.equal(opening.checks[0].source, base);
  const newHead = candidate();
  const output = cmd(hn, "proposal", "revise", original, "--base", base, "--head", newHead);
  const revision = output.match(/sha256:[a-f0-9]{64}/)?.[0];
  assert.ok(revision, output);
  native("proposal-checks", "observe");
  native("proposal-checks", "observe");
  const next = native("proposal-checks", "status", revision);
  assert.equal(next.checks.length, 1);
  assert.equal(next.checks[0].proposal, original);
  assert.equal(next.checks[0].commit, newHead);
  assert.notEqual(next.checks[0].id, opening.checks[0].id);
  assert.deepEqual(native("proposal-checks", "status", original), opening);
});
