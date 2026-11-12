import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import type { runHn } from "../src/lib/hn/runner";
import { listProjectRuntime } from "../src/lib/workbox/activity";
import { openDb } from "../src/lib/workbox/db";
import { ensureProject } from "../src/lib/workbox/index";
import { getProject, listProjects } from "../src/lib/workbox/queries";
import { readRepoSettings, updateRepoDetails } from "../src/lib/workbox/settings-read";

const eventId = (digit: string) => `sha256:${digit.repeat(64)}`;
const workflowPage = (items: unknown[], cursor?: string) => ({
  exitCode: 0, stderr: "", envelope: { ok: true, data: { items, snapshot: eventId("1"), next_cursor: cursor } },
});
const emptyWorkflows: typeof runHn = async () => workflowPage([]);

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-settings-read-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "empty"), GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch=main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("commit", "--allow-empty", "-qm", "Initial");
  const db = openDb(join(root, "index.sqlite"));
  t.after(() => db.close());
  ensureProject(db, { id: "fixture", name: "Fixture", description: "Repository description", repoPath: repo });
  return { repo, git, db };
}

test("legacy descriptions migrate, and name-only curation follows the source description", async t => {
  const { repo, db } = fixture(t);
  const old = join(repo, "old.sqlite");
  using legacy = new DatabaseSync(old);
  legacy.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, description TEXT, repo_path TEXT);
    CREATE TABLE project_meta (id TEXT PRIMARY KEY REFERENCES projects(id), description TEXT NOT NULL DEFAULT '');
    INSERT INTO projects VALUES ('fixture', 'Original', 'Discovered', '.');
    INSERT INTO project_meta VALUES ('fixture', 'Legacy curated');
  `);
  using migrated = openDb(old);
  assert.equal(getProject(migrated, "fixture")?.description, "Legacy curated");
  const legacyUpdate = updateRepoDetails(migrated, "fixture", { name: " Updated " });
  assert.deepEqual(legacyUpdate, {
    ok: true, data: { id: "fixture", name: "Updated", description: "Legacy curated", curation: { name: true, description: true } },
  });

  assert.equal(updateRepoDetails(db, "fixture", { name: "Local name" }).ok, true);
  assert.equal(updateRepoDetails(db, "fixture", { description: 4 }).ok, false);
  assert.equal(updateRepoDetails(db, "fixture", { branch: "other" }).ok, false);
  assert.equal(updateRepoDetails(db, "missing", { name: "Local" }).ok, false);
  ensureProject(db, { id: "fixture", name: "Rescan name", description: "Rescan description", repoPath: repo });
  assert.equal(listProjects(db)[0].name, "Local name");
  assert.equal(listProjectRuntime(db)[0].description, "Rescan description");
  const settings = await readRepoSettings(db, "fixture", emptyWorkflows);
  assert.ok(settings);
  assert.deepEqual(settings.details.curation, { name: true, description: false });
  assert.equal(settings.pipelines.state, "empty");
  assert.equal(settings.workflows.state, "empty");
});

test("reads committed definitions and policy at the configured revision, independent of the dirty checkout", async t => {
  const { repo, git, db } = fixture(t);
  git("switch", "-qc", "trunk");
  mkdirSync(join(repo, ".hn/pipelines"), { recursive: true });
  const definition = '{"version":"hn.pipeline/0","steps":[{"name":"check","command":"true"}]}\n';
  writeFileSync(join(repo, ".hn/pipelines/check.json"), definition);
  writeFileSync(join(repo, ".hn/pipelines/broken.json"), "{}");
  writeFileSync(join(repo, ".hn/pipelines/invalid name.json"), definition);
  writeFileSync(join(repo, ".hn/policy.json"), JSON.stringify({
    version: "hn.policy/0",
    maintainers: ["1".repeat(64)],
    proposals: { requiredAccepts: 1 },
    pipelines: { check: { requiredResults: 2, trustedRunners: ["1".repeat(64), "2".repeat(64)] } },
  }));
  git("add", ".hn");
  git("commit", "-qm", "Configure committed workflow");
  const commit = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/trunk", commit);
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
  git("switch", "-qc", "draft");
  writeFileSync(join(repo, ".hn/pipelines/check.json"), "Uncommitted edit");
  const status = git("status", "--porcelain");
  const run: typeof runHn = async (_repo, args) => {
    if (args[0] === "policy") assert.deepEqual(args, ["policy", "show", commit]);
    return workflowPage([]);
  };
  const settings = await readRepoSettings(db, "fixture", run);
  assert.ok(settings);
  assert.equal(settings.details.branch, "trunk");
  assert.equal(settings.details.commit, commit);
  assert.equal(settings.pipelines.policy.state, "ready");
  assert.equal(settings.pipelines.items[0].state, "invalid");
  assert.equal(settings.pipelines.items.find(item => item.name === "invalid name")?.state, "invalid");
  const check = settings.pipelines.items.find(item => item.name === "check");
  assert.ok(check);
  assert.equal(check.definition, definition);
  assert.deepEqual(check.steps, [{ name: "check", command: "true" }]);
  assert.equal(check.requiredResults, 2);
  assert.equal(new URL(check.href, "http://localhost").searchParams.get("at"), commit);
  assert.equal(git("status", "--porcelain"), status);
});

test("keeps native workflow status separate and preserves every conflict head", async t => {
  const { db } = fixture(t);
  const native = { schema: "hn.workflow/1", name: "check", title: "Native definition", enabled: true, pipeline: { version: "hn.pipeline/0" } };
  const workflow = (id: string, state: unknown) => ({ id: eventId(id), family: "workflow", heads: [{ id: eventId(id) }], state, conflict: false });
  const conflict = { id: eventId("c"), family: "workflow", heads: [{ id: eventId("a") }, { id: eventId("b") }], state: null, conflict: true };
  let requests = 0;
  const run: typeof runHn = async (_repo, args) => {
    requests++;
    if (args.includes("--cursor")) return workflowPage([workflow("d", { ...native, enabled: false }), conflict]);
    return workflowPage([
      workflow("a", native),
      workflow("b", { ...native, enabled: false, pipeline: null, source_documents: [{}] }),
    ], "cursor");
  };
  const settings = await readRepoSettings(db, "fixture", run);
  assert.ok(settings);
  assert.equal(requests, 2);
  assert.equal(settings.pipelines.state, "empty");
  assert.deepEqual(settings.workflows.items.map(item => item.status), ["native-runnable", "inert-source", "disabled", "conflicted"]);
  assert.deepEqual(settings.workflows.items[3].heads, [eventId("a"), eventId("b")]);
  assert.equal(settings.workflows.items[3].revision, null);
  assert.equal(settings.workflows.state, "ready");

  const unsupported: typeof runHn = async () => ({
    exitCode: 1, stderr: 'unknown command "workflow"', envelope: { ok: false, data: null, error: { code: "prose_failure", message: "" } },
  });
  assert.equal((await readRepoSettings(db, "fixture", unsupported))?.workflows.state, "unsupported");
  const unavailable: typeof runHn = async () => { throw new Error("unavailable"); };
  assert.equal((await readRepoSettings(db, "fixture", unavailable))?.workflows.state, "unavailable");
  db.prepare("UPDATE projects SET repo_path = ? WHERE id = ?").run("/workbox-does-not-exist", "fixture");
  assert.equal((await readRepoSettings(db, "fixture", unavailable))?.pipelines.state, "unavailable");
});
