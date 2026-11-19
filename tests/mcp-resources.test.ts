import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openDb } from "../src/lib/workbox/db";
import { listResources, readResource } from "../mcp/resources";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-mcp-resources-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "unused"), GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch=main");
  git("config", "user.name", "Fixture Author");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(repo, "README.md"), "hello");
  git("add", "-A");
  execFileSync("git", ["commit", "-qm", "Initial"], { cwd: repo, env });
  const db = openDb(join(root, "index.sqlite"));
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run("workbox-demo", "Demo", repo);
  t.after(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
  return { db };
}

test("advertises native addresses and retires memory and pipeline resources", (t) => {
  const { db } = fixture(t);
  const uris = listResources(db).map((resource) => resource.uri);
  assert.ok(uris.includes("workbox://dashboard"));
  assert.ok(uris.includes("workbox://explore"));
  assert.ok(uris.includes("workbox://project/workbox-demo"));
  assert.ok(uris.includes("workbox://project/workbox-demo/code"));
  assert.ok(uris.includes("workbox://project/workbox-demo/issues"));
  assert.ok(uris.includes("workbox://project/workbox-demo/proposals"));
  assert.ok(!uris.some((uri) => uri.endsWith("/memory")));
  assert.ok(!uris.some((uri) => uri.endsWith("/pipelines")));
  assert.ok(!uris.some((uri) => uri.includes("/task/")));
});

test("reads project and code resources through the shared native services", async (t) => {
  const { db } = fixture(t);
  const project = await readResource(db, "workbox://project/workbox-demo");
  const projectData = JSON.parse(project.text) as { id: string };
  assert.equal(projectData.id, "workbox-demo");
  const code = await readResource(db, "workbox://project/workbox-demo/code");
  const codeData = JSON.parse(code.text) as { kind: string };
  assert.equal(codeData.kind, "directory");
});

test("rejects retired memory addresses and unknown resources", async (t) => {
  const { db } = fixture(t);
  await assert.rejects(readResource(db, "workbox://project/workbox-demo/memory"), /retired/);
  await assert.rejects(readResource(db, "workbox://nope"), /unsupported/);
  await assert.rejects(readResource(db, "workbox://project/missing"), /not_found/);
});
