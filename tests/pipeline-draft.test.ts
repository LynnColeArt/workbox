import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openDb } from "../src/lib/workbox/db";
import {
  editPipelineDraft, openPipelineDraft, readPipelineDraft, refreshPipelineDraft,
  type PipelineDraft, type PipelineDraftEdit, type PipelineDraftResult,
} from "../src/lib/workbox/pipeline-draft";

const project = "fixture";
const path = ".hn/pipelines/ci.json";
const templates = ".hn/pipeline-templates.json";
const original = '{\r\n  "version": "hn.pipeline/0",\r\n  "steps": [{"name":"雪","command":"true","args":["a b","","$test"]}]\r\n}';

function get(result: PipelineDraftResult) {
  assert.equal(result.ok, true);
  return result.data;
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-pipeline-draft-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "unused"), GIT_CONFIG_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch=trunk");
  git("config", "user.name", "Fixture Author");
  git("config", "user.email", "fixture@example.invalid");
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
  mkdirSync(join(repo, ".hn", "pipelines"), { recursive: true });
  writeFileSync(join(repo, path), original);
  const catalog = (command: string) => JSON.stringify({
    schema: "workbox.pipeline-templates/1",
    templates: [{
      id: "integration", label: "Integration", inputs: [{ key: "target", label: "Target", type: "string", default: "all" }],
      step: { name: "Integration", command, args: [{ input: "target" }] },
    }],
  });
  writeFileSync(join(repo, templates), catalog("true"));
  git("add", "-A");
  git("commit", "-qm", "Pinned pipeline and templates");
  const db = openDb(join(root, "index.sqlite"));
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run(project, "Fixture", repo);
  t.after(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
  const open = (name = "ci") => get(openPipelineDraft(db, project, { name }));
  const edit = (draft: PipelineDraft, edit: PipelineDraftEdit) => get(editPipelineDraft(db, project, { draft, expectedRevision: draft.revision, edit }));
  const refresh = (draft: PipelineDraft) => get(refreshPipelineDraft(db, project, { draft, expectedRevision: draft.revision }));
  return { db, repo, git, open, edit, refresh, catalog };
}

test("round trips exact JSON and restores the last valid text after an unprojectable manual edit", (t) => {
  const { db, open, edit } = fixture(t);
  const draft = open();
  assert.equal(draft.before, original);
  assert.equal(draft.definition, original);
  assert.deepEqual(readPipelineDraft(db, project, draft), { ok: true, data: draft });
  assert.deepEqual(draft.nodes.map(node => node.step.args), [["a b", "", "$test"]]);
  const valid = edit(draft, { kind: "replace_json", definition: original.replace("雪", "Build") });
  assert.equal(valid.projection, "valid");
  assert.equal(valid.nodes[0].step.name, "Build");

  const edits = [
    "{",
    valid.definition.replace('"command":"true"', '"command":"ignored","comman\\u0064":"true"'),
    valid.definition.replace('"command":"true"', '"command":"true","future":true'),
    valid.definition.replace('"command":"true"', '"command":""'),
  ];
  for (const definition of edits) {
    const invalid = edit(valid, { kind: "replace_json", definition });
    assert.equal(invalid.definition, definition);
    assert.equal(invalid.lastValid, valid.definition);
    assert.equal(invalid.projection, "stale");
    assert.equal(invalid.nodes[0].step.name, "Build");
    assert.ok(invalid.diagnostics.length > 0);
    assert.equal(editPipelineDraft(db, project, {
      draft: invalid, expectedRevision: invalid.revision, edit: { kind: "add" },
    }).ok, false);
    assert.equal(edit(invalid, { kind: "restore" }).definition, valid.definition);
  }
});

test("graph edits preserve node identities, support incomplete drafts, and leave Git unchanged", (t) => {
  const { db, repo, git, open, edit } = fixture(t);
  const snapshot = () => ({
    refs: git("show-ref"), status: git("status", "--porcelain"),
    index: readFileSync(join(repo, ".git", "index")),
    objects: readdirSync(join(repo, ".git", "objects"), { recursive: true }).sort(),
  });
  const before = snapshot();
  const empty = open("other");
  assert.equal(empty.before, null);
  assert.equal(empty.projection, "incomplete");
  const added = edit(empty, { kind: "add" });
  assert.deepEqual(edit(empty, { kind: "add" }), added);
  assert.equal(added.projection, "incomplete");
  assert.equal(added.diagnostics[0].nodeId, added.nodes[0].id);
  const nodeId = added.nodes[0].id;
  const patched = edit(added, {
    kind: "patch", nodeId,
    patch: { name: "Build", command: "true", args: ["", "a b"], timeoutSeconds: 0, workingDirectory: "." },
  });
  assert.equal(patched.projection, "valid");
  const copied = edit(patched, { kind: "duplicate", nodeId });
  assert.deepEqual(copied.edges, [{ from: nodeId, to: copied.nodes[1].id }]);
  const moved = edit(copied, { kind: "reorder", nodeId, index: 1 });
  assert.deepEqual(moved.nodes.map(node => node.id), [copied.nodes[1].id, nodeId]);
  const cleared = edit(moved, { kind: "patch", nodeId, patch: { args: null, timeoutSeconds: null } });
  assert.deepEqual(cleared.nodes[1].step, { name: "Build", command: "true", workingDirectory: "." });
  const removed = edit(cleared, { kind: "remove", nodeId });
  assert.equal(removed.nodes.length, 1);
  assert.equal(removed.edges.length, 0);
  assert.deepEqual(Object.keys(JSON.parse(removed.definition)), ["version", "steps"]);
  assert.equal(readPipelineDraft(db, project, { ...removed, definition: "{}" }).ok, false);
  assert.deepEqual(readPipelineDraft(db, project, { ...removed, nodes: [] }), { ok: true, data: removed });
  const stale = editPipelineDraft(db, project, { draft: removed, expectedRevision: cleared.revision, edit: { kind: "add" } });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "stale_revision");
  assert.deepEqual(snapshot(), before);
});

test("template expansion reads pinned Git and refresh keeps existing expanded values", (t) => {
  const { repo, git, open, edit, refresh, catalog } = fixture(t);
  const initial = open();
  git("switch", "-qc", "other");
  writeFileSync(join(repo, templates), catalog("later"));
  writeFileSync(join(repo, path), original.replace("雪", "Later baseline"));
  git("add", "-A");
  git("commit", "-qm", "Advance pipeline and templates");
  const later = git("rev-parse", "HEAD");
  git("update-ref", "refs/heads/trunk", later, initial.base.commit);

  const expanded = edit(initial, { kind: "expand_template", templateId: "integration", inputs: { target: "" } });
  assert.deepEqual(expanded.nodes[1].step, { name: "Integration", command: "true", args: [""] });
  const refreshed = refresh(expanded);
  assert.deepEqual(refreshed.base, { branch: "trunk", commit: later });
  assert.equal(refreshed.before, original.replace("雪", "Later baseline"));
  assert.equal(refreshed.definition, expanded.definition);
  assert.deepEqual(refreshed.nodes, expanded.nodes);
  const appended = edit(refreshed, { kind: "expand_template", templateId: "integration" });
  assert.equal(appended.nodes[1].step.command, "true");
  assert.deepEqual(appended.nodes[2].step, { name: "Integration", command: "later", args: ["all"] });
});
