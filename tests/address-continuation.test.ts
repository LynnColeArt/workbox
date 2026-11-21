import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { readResource } from "../mcp/resources";
import { HN_BIN } from "../src/lib/hn/runner";
import { parseWorkboxAddress } from "../src/lib/workbox/address";
import { openDb } from "../src/lib/workbox/db";
import type { ExploreRead } from "../src/lib/workbox/explore";
import type { IssueDetails } from "../src/lib/workbox/issues";

const hn = resolve(HN_BIN);

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-address-continuation-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const dbPath = join(root, "index.sqlite");
  const db = openDb(dbPath);
  t.after(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, "unused"), GIT_CONFIG_NOSYSTEM: "1" };
  const run = (bin: string, args: string[], input?: string) =>
    execFileSync(bin, args, { cwd: repo, env, input, encoding: "utf8", timeout: 10_000 });
  run("git", ["init", "-q", "-b", "main", "--object-format=sha1"]);
  run("git", ["config", "user.name", "Fixture Author"]);
  run("git", ["config", "user.email", "fixture@example.invalid"]);
  run("git", ["commit", "--allow-empty", "-qm", "Initial"]);
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run("demo", "Demo", repo);
  return { db, dbPath, run };
}

test("Explore resource snapshots replay the selection and report stale catalog changes", async t => {
  const { db } = fixture(t);
  const read = async (uri: string) => JSON.parse((await readResource(db, uri)).text) as ExploreRead;
  const base = "workbox://explore?q=demo&sort=alpha";
  const first = await read(base);
  assert.equal(first.stale, false);
  assert.deepEqual(first.projects.map(project => project.id), ["demo"]);
  assert.ok(first.snapshot);
  const uri = `${base}&${new URLSearchParams({ snapshot: first.snapshot })}`;
  const parsed = parseWorkboxAddress(uri);
  assert.ok(parsed.ok && parsed.target.kind === "explore");
  assert.equal(parsed.target.query.snapshot, first.snapshot);
  assert.equal(parsed.target.uri, uri);
  assert.equal(parsed.target.href, first.href);

  const replay = await read(uri);
  assert.equal(replay.stale, false);
  assert.equal(replay.snapshot, first.snapshot);
  assert.deepEqual(replay.selection, first.selection);
  assert.deepEqual(replay.projects, first.projects);

  db.prepare("UPDATE projects SET name = ? WHERE id = ?").run("Renamed", "demo");
  const stale = await read(uri);
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.projects, []);
  assert.notEqual(stale.snapshot, first.snapshot);
});

test("legacy and canonical issue resources continue signed comments at the native cursor", {
  skip: !existsSync(hn) && "Set WORKBOX_HN_BIN to a Hubnot binary",
  timeout: 90_000,
}, async t => {
  const { db, dbPath, run } = fixture(t);
  const oldDbPath = process.env.WORKBOX_DB_PATH;
  process.env.WORKBOX_DB_PATH = dbPath;
  t.after(() => {
    if (oldDbPath === undefined) delete process.env.WORKBOX_DB_PATH;
    else process.env.WORKBOX_DB_PATH = oldDbPath;
  });
  run(hn, ["init", "--name", "Issue Fixture"]);
  function native<T>(args: string[], input?: unknown): T {
    const result = JSON.parse(run(hn, [...args, "--json"], input === undefined ? undefined : JSON.stringify(input)));
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.data as T;
  }
  const { actor } = native<{ actor: string }>(["identity", "show"]);
  const title = "Signed issue with two pages";
  const { issue_id: issueId } = native<{ issue_id: string }>(
    ["issue", "open", "--actor", actor, "--operation", "open", "--input", "-"],
    { title, body: "", status: "open", labels: [] },
  );
  db.prepare("INSERT INTO issues (project_id, issue_id, title, creator, number) VALUES (?, ?, ?, ?, ?)")
    .run("demo", issueId, title, actor, 1);
  const ids = new Set<string>();
  for (let i = 0; i < 51; i++) {
    const { event_id } = native<{ event_id: string }>([
      "issue", "comment", issueId, "--actor", actor, "--operation", `comment-${i}`, "--body", `Comment ${i}`,
    ]);
    ids.add(event_id);
  }
  assert.equal(ids.size, 51);
  const legacy = "workbox://project/demo/task/WP-1";
  const canonical = "workbox://project/demo/issues/1";
  const read = async (uri: string) => JSON.parse((await readResource(db, uri)).text) as IssueDetails;
  const first = await read(legacy);
  assert.equal(first.issueId, issueId);
  assert.equal(first.commentCount, 51);
  assert.equal(first.comments.length, 50);
  assert.ok(first.nextCursor);

  const suffix = `?${new URLSearchParams({ cursor: first.nextCursor })}`;
  const parsed = parseWorkboxAddress(legacy + suffix);
  assert.ok(parsed.ok && parsed.target.kind === "issue");
  assert.equal(parsed.target.uri, canonical + suffix);
  assert.equal(parsed.target.href, `/p/demo/issue/1${suffix}`);
  const second = await read(parsed.target.uri);
  assert.deepEqual(await read(legacy + suffix), second);
  assert.equal(second.issueId, issueId);
  assert.equal(second.comments.length, 1);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(new Set([...first.comments, ...second.comments].map(comment => comment.id)), ids);
});
