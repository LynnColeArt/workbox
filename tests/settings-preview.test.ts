import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openDb } from "../src/lib/workbox/db";
import { PIPELINE_MAX_BYTES, previewPipeline, validatePipelineDefinition } from "../src/lib/workbox/settings-preview";

const valid = JSON.stringify({ version: "hn.pipeline/0", steps: [{ name: "Checks", command: "checks" }] });

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-settings-preview-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "unused"), GIT_CONFIG_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch=trunk");
  git("config", "user.name", "Fixture Author");
  git("config", "user.email", "fixture@example.invalid");
  const path = ".hn/pipelines/ci.json";
  mkdirSync(join(repo, ".hn", "pipelines"), { recursive: true });
  writeFileSync(join(repo, path), valid);
  git("add", "-A");
  git("commit", "-qm", "Pipeline base");
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
  const db = openDb(join(root, "index.sqlite"));
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run("fixture", "Fixture", repo);
  t.after(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
  const preview = (definition: string, name = "ci") => previewPipeline(db, "fixture", { name, definition });
  return { repo, env, git, path, preview };
}

test("validates pipeline step constraints and returns field-specific diagnostics", () => {
  assert.equal(validatePipelineDefinition(valid).ok, true);
  const invalid = validatePipelineDefinition(JSON.stringify({
    version: "future",
    steps: [{ name: "", command: "../outside", args: ["bad\0arg"], workingDirectory: "C:\\temp", timeoutSeconds: 3601 }],
  }));
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.diagnostics.map(({ path }) => path), [
    "version", "steps[0].name", "steps[0].command", "steps[0].args[0]", "steps[0].workingDirectory", "steps[0].timeoutSeconds",
  ]);
  assert.equal(validatePipelineDefinition(valid.replace('"command":"checks"', '"command":"checks","timeoutSeconds":1e0')).ok, false);
  assert.equal(validatePipelineDefinition(valid + "\n ".repeat(PIPELINE_MAX_BYTES)).ok, false);
  assert.equal(validatePipelineDefinition(valid + "{}").ok, false);
});

test("pins exact before and after text and leaves Git refs, objects, index and worktree untouched", (t) => {
  const { repo, git, path, preview } = fixture(t);
  const base = git("rev-parse", "HEAD");
  git("switch", "-qc", "draft");
  const working = valid.replace("Checks", "Unrelated staged work");
  writeFileSync(join(repo, path), working);
  git("add", "-A");
  writeFileSync(join(repo, "untracked"), "Keep");
  const gitDir = join(repo, ".git");
  const snapshot = () => ({
    refs: git("show-ref"),
    status: git("status", "--porcelain"),
    objects: readdirSync(join(gitDir, "objects"), { recursive: true }).sort(),
    index: readFileSync(join(gitDir, "index")),
    pipeline: readFileSync(join(repo, path)),
  });
  const initial = snapshot();
  const draft = valid.replace("Checks", "雪") + "\r\n";
  const result = preview(draft);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.base, { branch: "trunk", commit: base });
  assert.equal(result.data.before, valid);
  assert.equal(result.data.definition, draft);
  assert.deepEqual(result.data.checks, { format: "passed", native: "unavailable" });
  assert.deepEqual(preview(draft), result);
  const reformatted = preview(draft + " ");
  assert.equal(reformatted.ok, true);
  assert.notEqual(reformatted.data.digest, result.data.digest);
  const newFile = preview(draft, "new");
  assert.equal(newFile.ok, true);
  assert.equal(newFile.data.before, null);
  assert.deepEqual(preview(valid), { ok: false, error: { code: "unchanged", message: "The draft matches the committed pipeline." } });
  assert.equal(preview(draft, "../escape").ok, false);
  assert.deepEqual(snapshot(), initial);

  git("commit", "-qm", "Draft branch only");
  git("update-ref", "refs/heads/trunk", git("rev-parse", "HEAD"), base);
  const advanced = preview(draft);
  assert.equal(advanced.ok, true);
  assert.equal(advanced.data.before, working);
  assert.notEqual(advanced.data.digest, result.data.digest);
});

test("reads a large committed pipeline within the native size limit", (t) => {
  const { repo, git, path, preview } = fixture(t);
  const before = valid + " ".repeat(300 * 1024);
  writeFileSync(join(repo, path), before);
  git("add", path);
  git("commit", "-qm", "Keep exact formatting");
  const result = preview(valid);
  assert.equal(result.ok, true);
  assert.equal(result.data.before, before);
});

const hn = process.env.WORKBOX_HN_BIN ?? "/tmp/hn";
test("format checks agree with Hubnot's committed-pipeline checks in disposable history", { skip: !existsSync(hn) }, (t) => {
  const { repo, env, git, path } = fixture(t);
  const native = (...args: string[]) => spawnSync(hn, args, { cwd: repo, env, encoding: "utf8" });
  const initialized = native("init", "--name", "Fixture");
  assert.equal(initialized.status, 0, initialized.stderr);
  const identity = native("identity", "show", "--json");
  assert.equal(identity.status, 0, identity.stderr);
  const actor = JSON.parse(identity.stdout).data.actor;
  writeFileSync(join(repo, ".hn", "policy.json"), JSON.stringify({
    version: "hn.policy/0", maintainers: [actor], proposals: { requiredAccepts: 1 }, pipelines: {},
  }));
  git("add", ".hn/policy.json");
  git("commit", "-qm", "Native pipeline fixture policy");
  const base = git("rev-parse", "HEAD");
  const examples = [
    valid,
    valid.replace('"command":"checks"', '"command":"../escape"'),
    valid.replace('"command":"checks"', '"command":"checks","timeoutSeconds":1e0'),
    valid.replace('"command":"checks"', '"command":"checks","timeoutSeconds":25'),
  ];
  for (const [index, definition] of examples.entries()) {
    writeFileSync(join(repo, path), definition);
    writeFileSync(join(repo, "candidate"), String(index));
    git("add", "-A");
    git("commit", "-qm", `Candidate ${index}`);
    const opened = native("proposal", "open", "--base", base, "--head", git("rev-parse", "HEAD"), "Validate fixture");
    assert.equal(opened.status, 0, opened.stderr);
    const ref = git("for-each-ref", "--format=%(refname)", "refs/hn/actors/").split("\n")[0];
    const event = JSON.parse(git("show", `${ref}:event.json`));
    assert.equal(event.kind, "proposal.open");
    const id = /sha256:[a-f0-9]{64}/.exec(git("log", "-1", "--format=%s", ref))?.[0];
    assert.ok(id);
    // Requesting in a disposable fixture exercises the native loader without executing any step.
    const requested = native("run", "request", id, "ci");
    assert.equal(requested.status === 0, validatePipelineDefinition(definition).ok, requested.stderr);
  }
});
