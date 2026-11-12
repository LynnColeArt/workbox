import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { expandPipelineTemplate, readPipelineTemplates } from "../src/lib/workbox/pipeline-templates";

const path = ".hn/pipeline-templates.json";
const example = {
  id: "integration-test",
  label: "Integration test",
  inputs: [
    { key: "suite", label: "Suite", type: "string", default: "./..." },
    { key: "timeout", label: "Timeout", type: "integer", default: 120 },
  ],
  step: {
    name: "integration",
    command: "go",
    args: ["test", { input: "suite" }, "literal ${value}"],
    timeoutSeconds: { input: "timeout" },
  },
};

function manifest(...templates: unknown[]) {
  return JSON.stringify({ schema: "workbox.pipeline-templates/1", templates });
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-template-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "unused"), GIT_CONFIG_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env, encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch=trunk");
  git("config", "user.name", "Fixture Author");
  git("config", "user.email", "fixture@example.invalid");
  git("commit", "--allow-empty", "-qm", "Initialize fixture");
  mkdirSync(join(root, ".hn"));
  function commit(text?: string | Buffer) {
    if (text !== undefined) writeFileSync(join(root, path), text);
    git("add", "-A");
    git("commit", "-qm", "Update template catalog");
    return git("rev-parse", "HEAD");
  }
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const read = (commit: string = git("rev-parse", "HEAD")) => readPipelineTemplates(root, "test repo", { branch: "trunk", commit });
  return { root, git, commit, read };
}

test("reads the pinned catalog and expands typed values without touching the repository", t => {
  const { root, git, commit, read } = fixture(t);
  const pinned = commit(manifest(example));
  git("switch", "-qc", "other");
  commit(manifest({ ...example, label: "Changed on another branch" }));
  writeFileSync(join(root, path), manifest());
  git("add", "-A");
  writeFileSync(join(root, "untracked"), "Keep");
  const snapshot = () => ({
    refs: git("show-ref"),
    status: git("status", "--porcelain"),
    objects: readdirSync(join(root, ".git", "objects"), { recursive: true }).sort(),
    index: readFileSync(join(root, ".git", "index")),
    catalog: readFileSync(join(root, path)),
  });
  const before = snapshot();
  const catalog = read(pinned);
  assert.equal(catalog.state, "ready");
  assert.deepEqual(catalog.base, { branch: "trunk", commit: pinned });
  assert.equal(catalog.href, `/p/test%20repo/code?rev=trunk&at=${pinned}&path=.hn%2Fpipeline-templates.json`);
  assert.equal(catalog.templates[0].label, example.label);
  const step = { name: "integration", command: "go", args: ["test", "./...", "literal ${value}"], timeoutSeconds: 120 };
  assert.deepEqual(expandPipelineTemplate(catalog, example.id, {}), { ok: true, data: step });
  for (const suite of ["", "suite with spaces", "$();&|<>*"]) {
    assert.deepEqual(expandPipelineTemplate(catalog, example.id, { suite, timeout: 0 }), {
      ok: true, data: { ...step, args: ["test", suite, "literal ${value}"], timeoutSeconds: 0 },
    });
  }
  assert.deepEqual(snapshot(), before);
});

test("exposes only unambiguous valid entries and locates catalog errors", t => {
  const { commit, read } = fixture(t);
  commit(manifest(
    example,
    { ...example, id: "duplicate" },
    { ...example, id: "duplicate", label: 42 },
    { ...example, id: "wrong-type", step: { ...example.step, timeoutSeconds: { input: "suite" } } },
    { ...example, id: "unknown-input", step: { ...example.step, command: { input: "missing" } } },
    { ...example, id: "ambiguous-input", inputs: [example.inputs[0], example.inputs[0], example.inputs[1]] },
    { ...example, id: "unknown-property", custom: true },
  ));
  const catalog = read();
  assert.equal(catalog.state, "partial");
  assert.deepEqual(catalog.templates.map(item => item.id), [example.id]);
  assert.deepEqual(catalog.diagnostics.map(item => item.path), [
    "catalog.templates[1].id", "catalog.templates[2].label",
    "catalog.templates[3].step.timeoutSeconds", "catalog.templates[4].step.command",
    "catalog.templates[5].inputs", "catalog.templates[6]",
  ]);
  assert.equal(expandPipelineTemplate(catalog, "duplicate", {}).ok, false);
});

test("rejects missing, mistyped, undeclared, and native-invalid expansion inputs", t => {
  const { commit, read } = fixture(t);
  commit(manifest({ ...example, inputs: [{ key: "suite", label: "Suite", type: "string" }, example.inputs[1]] }));
  const catalog = read();
  const cases = [
    [{}, "inputs.suite"],
    [{ suite: 1 }, "inputs.suite"],
    [{ suite: "", timeout: "120" }, "inputs.timeout"],
    [{ suite: "", extra: true }, "inputs.extra"],
    [{ suite: "bad\0arg" }, "step.args[1]"],
    [{ suite: "", timeout: 3601 }, "step.timeoutSeconds"],
  ] as const;
  for (const [inputs, path] of cases) {
    const result = expandPipelineTemplate(catalog, example.id, inputs);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some(item => item.path === path));
  }
});

test("distinguishes absent, empty, invalid, oversized and unavailable catalogs", t => {
  const { commit, read } = fixture(t);
  assert.equal(read().state, "absent");
  assert.equal(read("a".repeat(40)).state, "unavailable");
  assert.equal(read(commit(manifest())).state, "empty");
  assert.equal(read(commit("{")).state, "invalid");
  assert.equal(read(commit(Buffer.from([255]))).state, "invalid");
  assert.equal(read(commit(JSON.stringify({ schema: "workbox.pipeline-templates/2", templates: [example] }))).state, "invalid");
  assert.equal(read(commit(manifest(...Array.from({ length: 65 }, (_, index) => ({ ...example, id: `node-${index}` }))))).state, "invalid");
  const oversized = read(commit(" ".repeat(256 * 1024 + 1)));
  assert.equal(oversized.state, "invalid");
  assert.match(oversized.diagnostics[0].message, /256 KiB/);
});

test("refuses tracked links in place of the catalog", { skip: process.platform === "win32" }, t => {
  const { root, commit, read } = fixture(t);
  writeFileSync(join(root, "other.json"), manifest(example));
  symlinkSync("../other.json", join(root, path));
  const catalog = read(commit());
  assert.equal(catalog.state, "invalid");
  assert.match(catalog.diagnostics[0].message, /regular tracked file/);
});
