import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { openDb } from "../src/lib/workbox/db";
import { readDashboard } from "../src/lib/workbox/dashboard";
import { renderDashboardPng, renderDashboardSvg } from "../src/lib/workbox/dashboard-chart";

const now = new Date("2026-07-11T04:00:00.000Z");
const cutoff = "2026-07-04T04:00:00Z";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-dashboard-"));
  const db = openDb(join(root, "index.sqlite"));
  t.after(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });
  function addProject(id: string, name: string, repoPath = join(root, id)) {
    db.prepare("INSERT INTO projects(id, name, repo_path) VALUES (?, ?, ?)").run(id, name, repoPath);
    return repoPath;
  }
  function init(repo: string) {
    mkdirSync(repo);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
    git("init", "-q", "--initial-branch=main");
    git("config", "user.name", "Dashboard fixture");
    git("config", "user.email", "fixture@example.invalid");
    return (message: string, timestamp: string) => {
      execFileSync("git", ["commit", "-qm", message, "--allow-empty"], {
        cwd: repo, env: { ...process.env, GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp },
      });
    };
  }
  function event(project: string, number: number, timestamp: string, verified = true) {
    const id = `sha256:${number.toString(16).padStart(64, "0")}`;
    db.prepare(`INSERT INTO events (project_id, event_id, commit_sha, actor, kind, timestamp, verified, payload_json)
      VALUES (?, ?, 'x', 'actor', 'issue.open', ?, ?, '{}')`).run(project, id, timestamp, Number(verified));
    return id;
  }
  function feed(project: string, id: string, timestamp: string, summary: string) {
    db.prepare(`INSERT INTO activity (project_id, event_id, kind, actor, actor_name, timestamp, summary)
      VALUES (?, ?, 'issue.open', 'actor', 'Fixture signer', ?, ?)`).run(project, id, timestamp, summary);
  }
  return { root, db, addProject, init, event, feed };
}

test("dashboard preserves latest activity rank, rolling source counts, and feed limit", (t) => {
  const { db, addProject, init, event, feed } = fixture(t);
  const first = init(addProject("one", "A <project>"));
  const second = init(addProject("two", "Second"));
  const old = init(addProject("old", "Old"));
  init(addProject("untouched", "Untouched"));
  first("Before window", "2026-07-04T03:59:59Z");
  first("At cutoff", cutoff);
  first("Recent Git", "2026-07-10T23:30:00Z");
  second("Second Git", "2026-07-10T23:30:00Z");
  old("Older history", "2026-06-28T00:00:00Z");
  const signed = event("one", 1, "2026-07-10T19:30:00-04:00");
  event("two", 2, "2026-07-11T02:00:00Z", false);
  event("two", 3, "2026-07-11T04:00:01Z");
  feed("one", signed, "2026-07-10T23:30:00Z", "Opened issue");
  for (let i = 0; i < 12; i++) {
    feed("two", `feed-${i}`, `2026-06-01T00:00:${String(i).padStart(2, "0")}Z`, `Feed ${i}`);
  }

  db.exec("BEGIN");
  const dashboard = readDashboard(db, now);
  assert.equal(db.isTransaction, true);
  db.exec("COMMIT");
  assert.deepEqual(dashboard.window, { start: "2026-07-04T04:00:00.000Z", end: now.toISOString(), timezone: "UTC" });
  assert.equal(dashboard.state, "active");
  assert.deepEqual(dashboard.projects.map(({ id, gitCount, hubnotCount }) => [id, gitCount, hubnotCount]), [
    ["one", 2, 1], ["two", 1, 0], ["old", 0, 0],
  ]);
  assert.equal(dashboard.projects[0].latestSource, "hubnot");
  assert.equal(dashboard.visual.maxCount, 3);
  assert.equal(dashboard.summary.projects, 4);
  assert.equal(dashboard.summary.verified, 2);
  assert.equal(dashboard.exploreHref, "/explore");
  assert.equal(dashboard.feed.length, 12);
  assert.equal(dashboard.feed[0].summary, "Opened issue");
  assert.equal(dashboard.feed[0].href, dashboard.projects[0].href);
  assert.ok(!JSON.stringify(dashboard).includes(signed));

  const svg = renderDashboardSvg(dashboard);
  assert.match(svg, /A &lt;project&gt;/);
  assert.ok(svg.indexOf("A &lt;project&gt;") < svg.indexOf(">Second<"));
  assert.match(svg, /2 Git · 1 Hubnot/);
  assert.match(svg, /0 Git · 0 Hubnot/);
  assert.match(svg, /Verified Hubnot events/);
  assert.match(svg, /fill="#3fb950"/);
  assert.match(svg, /fill="#4493f8"/);
});

test("top ten uses project ID to break ties after timestamp and name", (t) => {
  const { db, addProject, init, event } = fixture(t);
  for (let i = 12; i > 0; i--) {
    const id = `project-${String(i).padStart(2, "0")}`;
    init(addProject(id, i === 12 ? "First name" : "Same name"));
    event(id, i, cutoff);
  }

  const result = readDashboard(db, now);
  assert.equal(result.projects.length, 10);
  assert.equal(result.projects[0].id, "project-12");
  assert.deepEqual(result.projects.slice(1).map(({ id }) => id),
    Array.from({ length: 9 }, (_, i) => `project-${String(i + 1).padStart(2, "0")}`));
  assert.equal(result.summary.projects, 12);
});

test("empty, quiet, and incomplete histories have distinct data and visuals", async (t) => {
  const { root, db, addProject, init } = fixture(t);
  const repo = addProject("older", "Older project");
  const commit = init(repo);
  const empty = readDashboard(db, now);
  assert.equal(empty.state, "empty");
  assert.equal(empty.coverage.state, "complete");
  assert.match(renderDashboardSvg(empty), /No qualifying project activity yet/);

  commit("Quiet project", "2026-06-28T04:00:00Z");
  const quiet = readDashboard(db, now);
  assert.equal(quiet.state, "quiet");
  assert.equal(quiet.visual.maxCount, 0);
  assert.deepEqual(quiet.projects.map(({ gitCount, hubnotCount }) => [gitCount, hubnotCount]), [[0, 0]]);
  assert.match(renderDashboardSvg(quiet), /No project activity in this window/);

  commit("Recent shallow tip", cutoff);
  const shallow = join(root, "shallow");
  execFileSync("git", ["clone", "-q", "--depth=1", "--no-local", repo, shallow]);
  addProject("limited", "Limited", shallow);
  addProject("unavailable", "Unavailable");
  const incomplete = readDashboard(db, now);
  const limited = incomplete.projects.find(({ id }) => id === "limited");
  assert.equal(incomplete.state, "incomplete");
  assert.deepEqual(incomplete.coverage, {
    state: "partial",
    git: { complete: 1, partial: 1, unavailable: 1 },
    hubnot: { complete: 1, partial: 0, unavailable: 2 },
  });
  assert.equal(limited?.gitCount, 1);
  assert.equal(limited?.hubnotCount, null);
  assert.equal(limited?.observedTotal, 1);
  assert.ok(!JSON.stringify(incomplete).includes(root));
  const svg = renderDashboardSvg(incomplete);
  assert.match(svg, /History incomplete/);
  assert.match(svg, /≥1 Git · unknown Hubnot/);
  const png = await renderDashboardPng(incomplete);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 920);
});
