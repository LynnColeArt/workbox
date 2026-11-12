import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { accessSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { HN_BIN } from "../src/lib/hn/runner";
import { createProject } from "../src/lib/workbox/create";
import { openDb } from "../src/lib/workbox/db";
import { discoverProjects, isHubnotRepo, projectCreationStatePath } from "../src/lib/workbox/discover";

function setEnv(t: TestContext, key: string, value: string) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

function fixture(t: TestContext) {
  const scratch = mkdtempSync(join(tmpdir(), "workbox-create-"));
  const root = join(scratch, "projects");
  const database = join(scratch, "index.sqlite");
  mkdirSync(root);
  setEnv(t, "WORKBOX_PROJECTS_ROOT", root);
  setEnv(t, "WORKBOX_DB_PATH", database);
  setEnv(t, "GIT_CONFIG_GLOBAL", join(scratch, "empty-git-config"));
  setEnv(t, "GIT_CONFIG_NOSYSTEM", "1");
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  return { scratch, root, database };
}

function failureCode(result: Awaited<ReturnType<typeof createProject>>) {
  return result.ok ? null : result.error.code;
}

function git(repo: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", timeout: 10_000 }).trim();
}

function nativeAvailable() {
  try { accessSync(HN_BIN); return true; } catch { return false; }
}

const nativeOptions = { skip: !nativeAvailable() && "Hubnot executable unavailable" };

test("invalid inputs and preexisting paths leave projects untouched", async (t) => {
  const { root } = fixture(t);
  for (const input of [null, [], { id: 7 }, { id: "reserved", name: [] }, { id: "a", description: null }, { id: "Workbox" }, { id: "../nested" }]) {
    const result = await createProject(input);
    assert.equal(failureCode(result), "invalid_input");
  }
  const existing = join(root, "existing");
  mkdirSync(existing);
  assert.equal(failureCode(await createProject({ id: "existing" })), "conflict");
  assert.ok(existsSync(existing));

  if (process.platform !== "win32") {
    const linked = join(root, "linked");
    symlinkSync(join(root, "missing"), linked);
    assert.equal(failureCode(await createProject({ id: "linked" })), "conflict");
    assert.equal(existsSync(join(root, "missing")), false);
  }

  using db = openDb();
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run("registered", "Existing project", existing);
  assert.equal(failureCode(await createProject({ id: "registered" })), "conflict");
  assert.equal(existsSync(join(root, "registered")), false);
});

test("concurrent normalized creation indexes one native founding issue", nativeOptions, async (t) => {
  const { root } = fixture(t);
  const inputs = { id: " shared ", name: " New Name ", description: " Project details " };
  const results = await Promise.all([createProject(inputs), createProject(inputs)]);
  const success = results.find((result) => result.ok);
  assert.ok(success?.ok, JSON.stringify(results));
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => failureCode(result) === "conflict").length, 1);
  assert.equal(success.data.id, "shared");
  assert.equal(success.data.url, "/p/shared");
  assert.equal(success.data.foundingIssue.number, 1);
  const issueId = decodeURIComponent(success.data.foundingIssue.url.split("/").at(-1)!);
  assert.match(issueId, /^sha256:[a-f0-9]{64}$/);

  const dir = join(root, "shared");
  assert.equal(git(dir, "rev-list", "--count", "main"), "2");
  assert.match(git(dir, "for-each-ref", "--format=%(refname)", "refs/hn/actors/"), /^refs\/hn\/actors\/[a-f0-9]{64}$/);
  const issueResult = JSON.parse(execFileSync(HN_BIN, ["issue", "show", issueId, "--json"], { cwd: dir, encoding: "utf8" }));
  assert.equal(issueResult.ok, true);
  assert.match(JSON.stringify(issueResult.data), /Project created by Workbox/);
  assert.equal(readFileSync(join(dir, "README.md"), "utf8"), "# New Name\n\nProject details\n");
  assert.ok(existsSync(join(dir, ".hn", "policy.json")));
  assert.ok(discoverProjects().some(({ id }) => id === "shared"));
  assert.ok(!JSON.stringify(success).includes(root));
  assert.equal(failureCode(await createProject(inputs)), "conflict");

  using db = openDb();
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM events WHERE project_id = ? AND verified = 1").get("shared")?.count, 1);
  const recorded = db.prepare("SELECT name, description FROM projects WHERE id = ?").get("shared");
  assert.equal(recorded?.name, "New Name");
  assert.equal(recorded?.description, "Project details");
});

test("an indexing failure retains signed Git state and a matching retry indexes only", nativeOptions, async (t) => {
  const { root, database } = fixture(t);
  mkdirSync(database);
  const partial = await createProject({ id: "retry", name: " " });
  assert.equal(failureCode(partial), "indexing_failed", JSON.stringify(partial));
  assert.ok(!partial.ok && partial.error.recovery === "retry_indexing");
  const dir = join(root, "retry");
  const head = git(dir, "rev-parse", "main");
  const eventRef = git(dir, "for-each-ref", "--format=%(objectname)", "refs/hn/actors/");
  assert.match(eventRef, /^[a-f0-9]{40,64}$/);
  assert.equal(isHubnotRepo(dir), false);
  assert.equal(failureCode(await createProject({ id: "retry", name: "Other" })), "conflict");

  rmSync(database, { recursive: true });
  const success = await createProject({ id: " retry ", name: "retry", description: " " });
  assert.ok(success.ok, JSON.stringify(success));
  assert.equal(success.data.foundingIssue.number, 1);
  assert.equal(git(dir, "rev-parse", "main"), head);
  assert.equal(git(dir, "for-each-ref", "--format=%(objectname)", "refs/hn/actors/"), eventRef);
  assert.equal(git(dir, "rev-list", "--count", "main"), "2");
  assert.equal(isHubnotRepo(dir), true);
});

test("a Git initialization failure cleans up its own directory", { skip: process.platform === "win32" }, async (t) => {
  const { root, scratch } = fixture(t);
  const templates = join(scratch, "templates");
  mkdirSync(join(templates, "hooks"), { recursive: true });
  writeFileSync(join(templates, "hooks", "pre-commit"), "#!/bin/sh\necho native-private-diagnostic >&2\nexit 1\n", { mode: 0o700 });
  setEnv(t, "GIT_TEMPLATE_DIR", templates);
  const result = await createProject({ id: "broken" });
  assert.equal(failureCode(result), "initialization_failed", JSON.stringify(result));
  assert.equal(existsSync(join(root, "broken")), false);
  assert.ok(!JSON.stringify(result).includes("native-private-diagnostic"));
  assert.ok(!JSON.stringify(result).includes(scratch));
});

test("interrupted initialization remains hidden and refuses to claim a replaced directory", { skip: process.platform === "win32" }, async (t) => {
  const { root, scratch } = fixture(t);
  const fakeHn = join(scratch, "hold-hn");
  const ready = join(scratch, "hold-ready");
  writeFileSync(fakeHn, "#!/bin/sh\nmkdir -p .git/hn/identities\ntouch .git/hn/identities/placeholder\ntouch \"$WORKBOX_CREATE_TEST_READY\"\nread -r line\nexit 1\n", { mode: 0o700 });
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    "const api = await import('./src/lib/workbox/create.ts'); await (api.createProject ?? api.default.createProject)({ id: 'interrupted' });",
  ], { env: { ...process.env, WORKBOX_HN_BIN: fakeHn, WORKBOX_CREATE_TEST_READY: ready }, stdio: "ignore" });
  try {
    for (let elapsed = 0; !existsSync(ready) && elapsed < 100; elapsed++) await delay(20);
    assert.ok(existsSync(ready), "native stub reached its pause");
    const dir = join(root, "interrupted");
    assert.equal(isHubnotRepo(dir), false);
    assert.equal(failureCode(await createProject({ id: "interrupted" })), "conflict");

    const exited = once(child, "close");
    child.kill("SIGKILL");
    await exited;
    assert.equal(failureCode(await createProject({ id: "interrupted" })), "recovery_required");
    const original = join(root, "preserved-original");
    renameSync(dir, original);
    mkdirSync(dir);
    writeFileSync(join(dir, "keeper"), "different repository");
    assert.equal(failureCode(await createProject({ id: "interrupted" })), "recovery_required");
    assert.equal(readFileSync(join(dir, "keeper"), "utf8"), "different repository");
    assert.ok(existsSync(projectCreationStatePath(dir)));
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "close");
      child.kill("SIGKILL");
      await exited;
    }
  }
});

test("index recovery preserves an unrelated registration for the same project ID", nativeOptions, async (t) => {
  const { root, database } = fixture(t);
  mkdirSync(database);
  assert.equal(failureCode(await createProject({ id: "reserved-index" })), "indexing_failed");
  const created = join(root, "reserved-index");
  const head = git(created, "rev-parse", "main");
  rmSync(database, { recursive: true });
  const other = join(root, "other");
  mkdirSync(other);
  using db = openDb();
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run("reserved-index", "Other", other);
  const recovered = await createProject({ id: "reserved-index" });
  assert.equal(failureCode(recovered), "recovery_required", JSON.stringify(recovered));
  assert.equal(db.prepare("SELECT repo_path FROM projects WHERE id = ?").get("reserved-index")?.repo_path, other);
  assert.equal(git(created, "rev-parse", "main"), head);
  assert.ok(existsSync(projectCreationStatePath(created)));
});

test("failed cleanup preserves a different directory moved into the claimed path", { skip: process.platform === "win32" }, async (t) => {
  const { root, scratch } = fixture(t);
  const fakeHn = join(scratch, "failing-hn");
  const ready = join(scratch, "fail-ready");
  const release = join(scratch, "fail-release");
  writeFileSync(fakeHn, "#!/bin/sh\ntouch \"$WORKBOX_CREATE_TEST_READY\"\nwhile [ ! -f \"$WORKBOX_CREATE_TEST_RELEASE\" ]; do sleep 0.05; done\nexit 1\n", { mode: 0o700 });
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    "const api = await import('./src/lib/workbox/create.ts'); console.log(JSON.stringify(await (api.createProject ?? api.default.createProject)({ id: 'moving' })));",
  ], { env: { ...process.env, WORKBOX_HN_BIN: fakeHn, WORKBOX_CREATE_TEST_READY: ready, WORKBOX_CREATE_TEST_RELEASE: release } });
  const closed = once(child, "close");
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  try {
    for (let elapsed = 0; !existsSync(ready) && elapsed < 100; elapsed++) await delay(20);
    assert.ok(existsSync(ready), "native stub reached its pause");
    const dir = join(root, "moving");
    const original = join(root, "moved-original");
    renameSync(dir, original);
    mkdirSync(dir);
    writeFileSync(join(dir, "keeper"), "different repository");
    writeFileSync(release, "");
    assert.deepEqual(await closed, [0, null]);
    const result = JSON.parse(output);
    assert.equal(failureCode(result), "recovery_required");
    assert.equal(readFileSync(join(dir, "keeper"), "utf8"), "different repository");
    assert.ok(existsSync(join(original, ".git")));
    assert.ok(existsSync(projectCreationStatePath(dir)));
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      writeFileSync(release, "");
      child.kill("SIGKILL");
      await closed;
    }
  }
});
