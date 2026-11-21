import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { parseWorkboxAddress, type WorkboxAddressTarget } from "../src/lib/workbox/address";
import { navigateWorkboxAddress, readWorkboxResource } from "../src/lib/workbox/address-read";
import { openDb } from "../src/lib/workbox/db";

function target(input: string): WorkboxAddressTarget {
  const result = parseWorkboxAddress(input);
  assert.equal(result.ok, true, `expected ${input} to parse`);
  if (!result.ok) throw new Error("unreachable");
  return result.target;
}

function failure(input: string) {
  const result = parseWorkboxAddress(input);
  assert.equal(result.ok, false, `expected ${input} to fail`);
  if (result.ok) throw new Error("unreachable");
  return result.error;
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-address-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "unused"), GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch=main");
  git("config", "user.name", "Fixture Author");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(repo, "README.md"), "hello\n");
  git("add", "-A");
  execFileSync("git", ["commit", "-qm", "Initial"], { cwd: repo, env });
  const db = openDb(join(root, "index.sqlite"));
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run("workbox-demo", "Demo", repo);
  t.after(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
  return { db, repo };
}

test("parses dashboard, explore, and project addresses into canonical links", () => {
  assert.equal(target("workbox://").href, "/");
  assert.equal(target("workbox://dashboard").href, "/");
  assert.equal(target("workbox://explore?q=box&sort=alpha&page=2&day=2026-01-02").href,
    "/explore?q=box&sort=alpha&page=2&day=2026-01-02");
  assert.equal(target("workbox://project/workbox-demo").href, "/p/workbox-demo");
  assert.deepEqual(target("workbox://projects/firewalker/"), target("workbox://project/firewalker"));
  assert.equal(target("workbox://projects/firewalker/").href, "/p/firewalker");
});

test("parses code, issue, and proposal addresses, including legacy task links", () => {
  const code = target("workbox://project/workbox-demo/code?rev=main&path=docs/guide.md");
  assert.equal(code.kind, "code");
  if (code.kind !== "code") throw new Error("unreachable");
  assert.equal(code.query.rev, "main");
  assert.equal(code.query.path, "docs/guide.md");
  const codeUrl = new URL(code.href, "http://localhost");
  assert.equal(codeUrl.pathname, "/p/workbox-demo/code");
  assert.equal(codeUrl.searchParams.get("path"), "docs/guide.md");

  assert.equal(target("workbox://project/workbox-demo/issues").href, "/p/workbox-demo/issues");
  const issue = target("workbox://project/workbox-demo/issues/12");
  assert.equal(issue.kind, "issue");
  assert.equal(issue.href, "/p/workbox-demo/issue/12");
  assert.deepEqual(target("workbox://project/workbox-demo/task/WP-12"), issue);

  assert.equal(target("workbox://project/workbox-demo/proposals").href, "/p/workbox-demo/proposals");
  const digest = "a".repeat(64);
  const id = `sha256:${digest}`;
  for (const input of [id, encodeURIComponent(id), digest]) {
    assert.deepEqual(target(`workbox://project/workbox-demo/proposals/${input}?mode=lineage`), {
      kind: "proposal", projectId: "workbox-demo", candidateId: id, mode: "lineage",
      href: `/p/workbox-demo/proposals/sha256%3A${digest}?mode=lineage`,
      uri: `workbox://project/workbox-demo/proposals/${id}?mode=lineage`,
    });
  }
});

test("rejects retired memory addresses, unsafe paths, and unknown schemes", () => {
  assert.equal(failure("https://example.invalid/project/demo").code, "invalid_scheme");
  assert.equal(failure("workbox://project/workbox-demo/memory").code, "retired");
  assert.equal(failure("workbox://project/workbox-demo/code?path=../secret").code, "invalid_address");
  assert.equal(failure("workbox://project/workbox-demo/issues/not-a-number").code, "invalid_address");
  assert.equal(failure("workbox://project/workbox-demo/proposals/short").code, "invalid_address");
  assert.equal(failure("workbox://project/../escape").code, "invalid_address");
  assert.equal(failure("workbox://projects/%2e%2e/").code, "invalid_address");
  assert.equal(failure("workbox://projects/firewalker/?mode=lineage").code, "invalid_address");
});

test("navigation checks the local projection without reading collaboration records", (t) => {
  const { db } = fixture(t);
  assert.equal(navigateWorkboxAddress(db, "workbox://project/workbox-demo/code").ok, true);
  assert.deepEqual(navigateWorkboxAddress(db, "workbox://projects/workbox-demo/"), {
    ok: true, data: { kind: "project", href: "/p/workbox-demo", uri: "workbox://project/workbox-demo" },
  });
  const missing = navigateWorkboxAddress(db, "workbox://project/missing");
  assert.equal(missing.ok, false);
  if (missing.ok) throw new Error("unreachable");
  assert.equal(missing.error.code, "not_found");
});

test("resource reads use the native services for project and code targets", async (t) => {
  const { db } = fixture(t);
  assert.equal((await readWorkboxResource(db, "workbox://project/workbox-demo")).ok, true);
  const code = await readWorkboxResource(db, "workbox://project/workbox-demo/code");
  assert.equal(code.ok, true);
  if (!code.ok) throw new Error("unreachable");
  assert.equal((code.data as { kind: string }).kind, "directory");
  assert.equal((await readWorkboxResource(db, "workbox://project/workbox-demo/memory")).ok, false);
});
