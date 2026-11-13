import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("automatic runner uses active definition, publishes signed evidence, and does not replay completed checks", {
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
    pipelines: { test: { requiredResults: 1, trustedRunners: [actor] } },
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
  const remote = join(repo, "remote.git");
  cmd("git", "init", "-q", "--bare", remote);
  git("remote", "add", "origin", remote);
  git("push", "-q", "origin", "main");
  git("switch", "-qc", "topic");
  const candidate = () => {
    git("commit", "--allow-empty", "-qm", "Candidate");
    return git("rev-parse", "HEAD");
  };
  const open = (operation: string, head: string) => native(
    "proposal", "publish", "--base", base, "--base-ref", "refs/heads/main", "--head", head,
    "--actor", actor, "--operation", operation, "--title", operation,
  ).id as string;
  native("proposal-checks", "init", "refs/heads/main");
  write("pipelines/test.json", {
    version: "hn.pipeline/0", steps: [{ name: "Candidate replacement", command: "false" }],
  });
  git("add", ".hn");
  const original = open("opening", candidate());
  cmd(hn, "runner", "automatic-once");
  const opening = native("proposal-checks", "status", original);
  assert.equal(opening.checks.length, 1);
  assert.equal(opening.checks[0].source, base);
  assert.equal(opening.checks[0].status, "passed", JSON.stringify(opening));
  const [attempt] = opening.checks[0].attempts;
  assert.match(attempt.request, /^sha256:/);
  assert.match(attempt.result, /^sha256:/);
  const policy = native("proposal", "status", original);
  assert.equal(policy.requirements.pipelines[0].passes, 1);
  assert.equal(policy.requirements.pipelines[0].satisfied, true);
  cmd(hn, "runner", "automatic-once");
  assert.deepEqual(native("proposal-checks", "status", original), opening);
});
