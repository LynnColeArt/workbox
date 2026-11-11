import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { isHubnotProjectionVisible, recentProjects } from "../src/lib/workbox/activity";
import { openDb } from "../src/lib/workbox/db";
import { readExplore } from "../src/lib/workbox/explore";

const now = new Date("2026-07-10T13:00:00Z");

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-explore-"));
  const db = openDb(join(root, "index.sqlite"));
  t.after(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });
  const repo = join(root, "repo");
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(root, "empty-git-config") },
  }).trim();
  execFileSync("git", ["init", "-q", "--initial-branch=main", repo]);
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  return { root, repo, db, git };
}

function addProject(db: DatabaseSync, id: string, name: string, repoPath: string) {
  db.prepare("INSERT INTO projects (id, repo_path, name) VALUES (?, ?, ?)").run(id, repoPath, name);
}

function addEvent(db: DatabaseSync, project: string, number: number, timestamp: string, verified = 1) {
  const id = `sha256:${number.toString(16).padStart(64, "0")}`;
  db.prepare(`
    INSERT INTO events (project_id,event_id,commit_sha,actor,kind,timestamp,verified,payload_json)
    VALUES (?, ?, '', '', 'issue.open', ?, ?, '{}')
  `).run(project, id, timestamp, verified);
}

test("Explore includes empty projects, applies search before pagination and round-trips filters", (t) => {
  const { db, repo } = fixture(t);
  for (let n = 43; n > 0; n--) {
    const suffix = String(n).padStart(2, "0");
    addProject(db, `slug-${suffix}`, `Project ${suffix}`, repo);
  }
  addEvent(db, "slug-43", 1, "2026-07-10T02:00:00Z");
  const first = readExplore(db, {}, now);
  assert.equal(first.total, 43);
  assert.equal(first.totalPages, 3);
  assert.equal(first.projects.length, 20);
  assert.equal(first.projects[0].id, "slug-43");
  assert.equal(first.chart.buckets.at(-1)?.count, 1);
  const alpha = readExplore(db, { sort: "alpha", page: "2", snapshot: first.snapshot }, now);
  assert.equal(alpha.projects[0].id, "slug-21");
  assert.equal(alpha.projects.length, 20);
  assert.match(alpha.href, /sort=alpha&page=2&snapshot=/);
  assert.equal(readExplore(db, { page: 3 }, now).projects.length, 3);
  const filtered = readExplore(db, { q: "  SLUG-4  ", sort: "alpha", page: 99 }, now);
  assert.deepEqual(filtered.selection, { q: "slug-4", sort: "alpha", page: 1, day: null });
  assert.equal(filtered.total, 4);
  assert.equal(filtered.chart.buckets.at(-1)?.count, 1);
  assert.equal(readExplore(db, { q: "project 01" }, now).chart.buckets.at(-1)?.count, 0);
  assert.equal(readExplore(db, { q: "nothing" }, now).total, 0);
  assert.doesNotMatch(JSON.stringify(first), new RegExp(repo));
});

test("Explore counts projects once per UTC day and excludes storage, remote-only, and unverified activity", (t) => {
  const { db, repo, git, root } = fixture(t);
  addProject(db, "both", "Both", repo);
  const empty = join(root, "empty");
  execFileSync("git", ["init", "-q", "--initial-branch=main", empty]);
  addProject(db, "unverified", "Unverified", empty);
  git("commit", "--allow-empty", "-qm", "Local branch", "--date", "2026-07-10T00:15:00Z");
  git("commit", "--allow-empty", "-qm", "Local branch", "--date", "2026-07-09T22:15:00-02:00");
  git("branch", "second", "HEAD");
  git("checkout", "-q", "--detach");
  git("commit", "--allow-empty", "-qm", "Hubnot storage-only", "--date", "2026-07-10T11:00:00Z");
  git("update-ref", "refs/hn/actors/storage-only", "HEAD");
  git("commit", "--allow-empty", "-qm", "Remote-only", "--date", "2026-07-10T12:00:00Z");
  git("update-ref", "refs/remotes/origin/remote-only", "HEAD");
  addEvent(db, "both", 1, "2026-07-10T05:00:00Z");
  addEvent(db, "both", 3, "2026-07-10T05:00:00Z");
  addEvent(db, "unverified", 2, "2026-07-10T06:00:00Z", 0);

  const report = readExplore(db, {}, now);
  assert.deepEqual(report.chart.buckets.map(({ count }) => count), [0, 0, 0, 0, 0, 0, 1]);
  assert.equal(report.chart.timezone, "UTC");
  const drillDown = readExplore(db, { day: "2026-07-10", snapshot: report.snapshot }, now);
  assert.equal(drillDown.total, 1);
  assert.deepEqual(drillDown.projects[0].sources, ["git", "hubnot"]);
  assert.equal(drillDown.projects[0].latestSource, "hubnot");
  assert.equal(readExplore(db, { day: "2026-07-09" }, now).total, 0);
  const [recent] = recentProjects(db, { sinceDays: 3650 });
  assert.equal(recent.latestSource, "hubnot");
  assert.equal(recent.gitLast7, 2);
  assert.equal(recent.hubnotLast7, 2);
  assert.doesNotMatch(JSON.stringify(report), /storage-only|Remote-only/);
});

test("stale selections do not claim results from a different snapshot, and unknown days differ from zero", (t) => {
  const { db, repo, root } = fixture(t);
  addProject(db, "available", "Available", repo);
  addProject(db, "missing", "Missing", join(root, "missing"));
  const initial = readExplore(db, {}, now);
  assert.equal(initial.coverage.git.unavailable, 1);
  assert.deepEqual(initial.chart.buckets.map(({ count, partial }) => [count, partial]), Array(7).fill([null, true]));
  addEvent(db, "available", 1, "2026-07-10T02:00:00Z");
  const stale = readExplore(db, { day: "2026-07-10", snapshot: initial.snapshot }, now);
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.projects, []);
  assert.equal(stale.total, null);
  assert.equal(stale.chart.buckets.at(-1)?.count, 1);
  assert.match(stale.refreshHref, /day=2026-07-10&snapshot=/);
  assert.ok(!stale.refreshHref.includes(initial.snapshot));
  const current = readExplore(db, { day: "2026-07-10", snapshot: stale.snapshot }, now);
  assert.equal(current.total, 1);
  assert.deepEqual(current.projects[0].sources, ["hubnot"]);
  assert.equal(readExplore(db, { snapshot: "invalid" }, now).stale, true);
});

test("governed and shallow checkouts check native visibility and keep observed Git activity", (t) => {
  const { db, repo, git, root } = fixture(t);
  addProject(db, "governed", "Governed", repo);
  git("commit", "--allow-empty", "-qm", "Old commit", "--date", "2026-07-03T10:00:00Z");
  git("commit", "--allow-empty", "-qm", "Visible commit", "--date", "2026-07-09T10:00:00Z");
  mkdirSync(join(repo, ".git", "hn", "contribution"), { recursive: true, mode: 0o700 });
  assert.equal(isHubnotProjectionVisible(repo), false);
  addEvent(db, "governed", 1, "2026-07-10T02:00:00Z");
  addEvent(db, "governed", 2, "2026-07-10T03:00:00Z");
  const shallow = join(root, "shallow");
  execFileSync("git", ["clone", "-q", "--depth=1", "--no-local", repo, shallow]);
  addProject(db, "shallow", "Shallow", shallow);
  addEvent(db, "shallow", 3, "2026-07-10T03:00:00Z");
  assert.equal(isHubnotProjectionVisible(shallow), false);
  const bin = join(root, "hn-fixture");
  writeFileSync(bin, `#!${process.execPath}
const assert = require("node:assert/strict");
const [command, action, id, format] = process.argv.slice(2);
assert.deepEqual([command, action, format], ["event", "show", "--json"]);
assert.match(id, /^sha256:[0-9a-f]{64}$/);
if (id.endsWith("1")) {
  process.stdout.write(JSON.stringify({
    ok: true,
    data: { id, schema: "hn.consumer/1", history_scope: "visible_operative_history",
      event: { kind: "issue.open", timestamp: "2026-07-08T22:00:00Z", actorName: "Fixture" } },
  }));
} else if (id.endsWith("2")) {
  process.stdout.write(JSON.stringify({
    ok: false, error: { code: "not_found", origin: "native", message: "Private event details" },
  }));
  process.exitCode = 1;
} else {
  setTimeout(() => {}, 1_000);
}
`, { mode: 0o755 });
  const result = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
    const { openDb } = require("./src/lib/workbox/db.ts");
    const { readExplore } = require("./src/lib/workbox/explore.ts");
    const { recentProjects } = require("./src/lib/workbox/activity.ts");
    const db = openDb(process.argv[1]);
    const now = new Date(process.argv[2]);
    try {
      process.stdout.write(JSON.stringify({
        all: readExplore(db, {}, now),
        verifiedDay: readExplore(db, { day: "2026-07-08" }, now),
        recent: recentProjects(db, { sinceDays: 3650 }),
      }));
    } finally {
      db.close();
    }
  `, join(root, "index.sqlite"), now.toISOString()], {
    encoding: "utf8", env: { ...process.env, WORKBOX_HN_BIN: bin },
  })) as {
    all: ReturnType<typeof readExplore>;
    verifiedDay: ReturnType<typeof readExplore>;
    recent: ReturnType<typeof recentProjects>;
  };
  assert.deepEqual(result.all.coverage, {
    git: { complete: 1, partial: 1, unavailable: 0 },
    hubnot: { complete: 1, partial: 0, unavailable: 1 },
  });
  assert.deepEqual(result.all.chart.buckets.slice(-3).map(({ count, partial }) => [count, partial]),
    [[1, true], [2, true], [null, true]]);
  assert.equal(result.verifiedDay.total, 1);
  assert.deepEqual(result.verifiedDay.projects[0].sources, ["hubnot"]);
  assert.equal(result.recent.find(({ id }) => id === "governed")?.hubnotLast7, 1);
  assert.equal(result.recent.find(({ id }) => id === "shallow")?.hubnotLast7, 0);
  assert.doesNotMatch(JSON.stringify(result), /Private event details/);
});

test("a day with only a merge commit qualifies as Git activity", (t) => {
  const { db, repo, git } = fixture(t);
  addProject(db, "merge", "Merge", repo);
  git("commit", "--allow-empty", "-qm", "Root", "--date", "2026-07-04T09:00:00Z");
  git("checkout", "-qb", "feature");
  git("commit", "--allow-empty", "-qm", "Feature", "--date", "2026-07-05T09:00:00Z");
  git("checkout", "-q", "main");
  git("-c", "user.name=Fixture", "merge", "--no-ff", "-m", "Merge feature", "feature");
  git("commit", "--amend", "--no-edit", "--date", "2026-07-10T09:00:00Z");
  const result = readExplore(db, { day: "2026-07-10" }, now);
  assert.equal(result.chart.buckets.at(-1)?.count, 1);
  assert.equal(result.total, 1);
  assert.equal(result.projects[0].latestSummary, "Merge feature");
  assert.equal(recentProjects(db)[0].latestSummary, "Merge feature");
});
