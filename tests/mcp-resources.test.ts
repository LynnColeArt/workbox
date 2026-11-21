import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { HN_BIN } from "../src/lib/hn/runner";
import { navigateWorkboxAddress } from "../src/lib/workbox/address-read";
import { openDb } from "../src/lib/workbox/db";
import { resolveProposalDetail, type ProposalDetail } from "../src/lib/workbox/proposal-detail";
import { getProject } from "../src/lib/workbox/queries";
import { listResources, readResource } from "../mcp/resources";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-mcp-resources-"));
  const repo = join(root, "repo");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(repo);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "unused"), GIT_CONFIG_NOSYSTEM: "1" };
  const command = (binary: string, ...args: string[]) =>
    execFileSync(binary, args, { cwd: repo, env, encoding: "utf8", timeout: 10_000 }).trim();
  const git = (...args: string[]) => command("git", ...args);
  const hn = (...args: string[]) => command(resolve(HN_BIN), ...args);
  git("init", "-q", "--initial-branch=main", "--object-format=sha1");
  git("config", "user.name", "Fixture Author");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(repo, "README.md"), "hello");
  git("add", "-A");
  git("commit", "-qm", "Initial");
  const db = openDb(join(root, "index.sqlite"));
  t.after(() => db.close());
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run("workbox-demo", "Demo", repo);
  return { db, repo, git, hn };
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
  const { db, repo } = fixture(t);
  const project = await readResource(db, "workbox://project/workbox-demo");
  const alias = await readResource(db, "workbox://projects/workbox-demo/");
  assert.equal(alias.text, project.text);
  assert.ok(!project.text.includes(repo), "serialized resource must not disclose the host path");
  assert.deepEqual(JSON.parse(project.text), {
    id: "workbox-demo", name: "Demo", description: "", actorCount: 0, eventCount: 0,
    verifiedCount: 0, openIssues: 0, totalIssues: 0, lastEventAt: null,
  });
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

test("follows a deep link to a visible signed candidate and reads the same revision over MCP", {
  skip: !existsSync(resolve(HN_BIN)) && "Set WORKBOX_HN_BIN to a Hubnot binary",
  timeout: 30_000,
}, async (t) => {
  const { db, repo, git, hn } = fixture(t);
  hn("init", "--name", "Proposal Fixture");
  const base = git("rev-parse", "HEAD");
  git("switch", "-qc", "topic");
  writeFileSync(join(repo, "README.md"), "signed revision\n");
  git("commit", "-qam", "Update README");
  const head = git("rev-parse", "HEAD");
  const title = "Deep-linked signed proposal";
  hn("proposal", "open", "--base", base, "--head", head, title);
  const digest = git("for-each-ref", "--format=%(refname:strip=3)", "refs/hn/proposals");
  assert.match(digest, /^[a-f0-9]{64}$/);
  const id = `sha256:${digest}`;
  // Move the branch so the read must still identify the signed head, not the tip.
  git("commit", "--allow-empty", "-qm", "Move topic after signing");
  const before = git("show-ref");

  const uri = `workbox://project/workbox-demo/proposals/${id}`;
  const navigation = navigateWorkboxAddress(db, uri);
  assert.ok(navigation.ok);
  assert.equal(navigation.data.uri, uri);
  assert.equal(navigation.data.href, `/p/workbox-demo/proposals/sha256%3A${digest}`);
  // Follow the browser target through the same exact-detail service as the page.
  const [, , projectId, , candidate] = new URL(navigation.data.href, "http://localhost").pathname.split("/");
  const project = getProject(db, decodeURIComponent(projectId));
  assert.ok(project);
  const browser = await resolveProposalDetail(db, project, decodeURIComponent(candidate));
  assert.equal(browser.kind, "candidate");
  assert.deepEqual({ id: browser.candidate.id, base: browser.candidate.base, head: browser.candidate.head, title: browser.candidate.title },
    { id, base, head, title });

  const resource = await readResource(db, navigation.data.uri);
  const mcp = JSON.parse(resource.text) as ProposalDetail;
  assert.deepEqual(mcp, browser);
  assert.equal(git("show-ref"), before, "deep-link reads must not change Git refs");
});
