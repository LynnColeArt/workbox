import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { openDb } from "../src/lib/workbox/db";
import { readCode } from "../src/lib/workbox/code-browser";
import { readRepositoryActivity, type RepositoryActivityQuery } from "../src/lib/workbox/repository-activity";

const projectId = "calendar";
const selectedDay = "2026-07-10";
const now = new Date("2026-07-11T04:00:00Z");

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workbox-repo-activity-"));
  const repo = join(root, "repo");
  const dbFile = join(root, "index.sqlite");
  mkdirSync(repo);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch=main");
  git("config", "user.name", "Workbox fixture");
  git("config", "user.email", "fixture@example.invalid");
  const commit = (subject: string, date: string) => {
    execFileSync("git", ["commit", "-qm", subject, "--allow-empty"], {
      cwd: repo, env: { ...process.env, GIT_AUTHOR_DATE: "2024-01-01T12:00:00Z", GIT_COMMITTER_DATE: date },
    });
    return git("rev-parse", "HEAD");
  };
  const db = openDb(dbFile);
  db.prepare("INSERT INTO projects(id, name, repo_path) VALUES (?, ?, ?)").run(projectId, "Calendar", repo);
  t.after(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  function event(number: number, kind: string, subject: string | null = null, verified = 1) {
    const id = `sha256:${number.toString(16).padStart(64, "0")}`;
    db.prepare(`INSERT INTO events
      (project_id, event_id, commit_sha, actor, kind, timestamp, subject, verified, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(projectId, id, "x", "actor", kind, "2026-07-09T23:30:00-02:00", subject, verified,
        JSON.stringify({ actorName: "Calendar fixture", body: "Private fixture body" }));
    return id;
  }

  const read = (query: RepositoryActivityQuery = {}) => {
    const result = readRepositoryActivity(db, projectId, query, now);
    if (result.kind !== "activity") throw new Error(result.reason);
    return result;
  };
  return { db, repo, root, dbFile, git, commit, event, read };
}

test("calendar counts reachable default-branch commits while Code browses another branch", (t) => {
  const { db, git, commit, read } = fixture(t);
  commit("Old main", "2025-04-01T10:00:00Z");
  const main = commit("Main change", "2026-07-09T23:30:00-02:00");
  git("switch", "-qc", "feature");
  const feature = commit("Feature only", "2026-07-10T05:00:00Z");
  const result = read({ rev: "feature", at: feature, day: selectedDay });

  assert.deepEqual(result.scope, { kind: "branch", branch: "main", commit: main });
  assert.deepEqual(result.selection, { metric: "commits", day: selectedDay, activityPage: 1, rev: "feature", at: feature });
  assert.equal(result.chart.buckets.length, 365);
  assert.equal(result.chart.buckets.at(-1)?.day, "2026-07-11");
  assert.equal(result.chart.buckets.at(-1)?.count, 0);
  assert.equal(result.total, 1);
  assert.deepEqual(result.records.map(({ id, label }) => [id, label]), [[main, "Main change"]]);
  assert.equal(result.coverage, "complete");
  const commitParams = new URL(result.records[0].href, "http://localhost").searchParams;
  assert.equal(commitParams.get("rev"), "main");
  assert.equal(commitParams.get("at"), main);
  const commitView = readCode(db, projectId, Object.fromEntries(commitParams));
  assert.equal(commitView.kind, "commit");

  const dayParams = new URL(result.chart.buckets.find(({ day }) => day === selectedDay)!.href, "http://localhost").searchParams;
  assert.equal(dayParams.get("rev"), "feature");
  assert.equal(dayParams.get("at"), feature);
  assert.equal(dayParams.get("snapshot"), result.snapshot);
  assert.deepEqual(read(Object.fromEntries(dayParams)).records, result.records);
  assert.equal(read().selection.at, main);
});

test("metric families reconcile verified day counts with exact paginated records", (t) => {
  const { db, commit, event, read } = fixture(t);
  commit("Main", "2026-07-10T10:00:00Z");
  const issueId = event(1, "issue.open");
  db.prepare(`INSERT INTO issues (project_id, issue_id, title, creator, number)
    VALUES (?, ?, 'Open issue', 'actor', 1)`).run(projectId, issueId);
  for (let i = 2; i <= 22; i++) event(i, "issue.comment", issueId);
  event(23, "issue.revise", issueId, 0);

  const proposalId = event(24, "proposal.open");
  event(25, "review.submit", proposalId);
  event(26, "proposal.decision", proposalId);
  event(27, "proposal.merged", proposalId);
  event(28, "proposal.revise", proposalId, 0);
  const requestId = event(29, "run.request", proposalId);
  const ciId = event(30, "run.result", requestId);
  event(31, "run.withdraw", requestId);

  const issues = read({ metric: "issues", day: selectedDay });
  assert.equal(issues.total, 22);
  assert.equal(issues.totalPages, 2);
  assert.equal(issues.records.length, 20);
  assert.match(issues.records[0].contextHref ?? "", /\/issue\//);
  const second = read({ metric: "issues", day: selectedDay, snapshot: issues.snapshot, activityPage: 2 });
  assert.equal(second.records.length, 2);
  assert.equal(new Set([...issues.records, ...second.records].map(({ id }) => id)).size, 22);
  assert.equal(issues.chart.buckets.find(({ day }) => day === selectedDay)?.count, 22);
  const recordLink = new URL(second.records[0].href, "http://localhost");
  assert.equal(recordLink.hash, `#${second.records[0].anchor}`);
  assert.equal(recordLink.searchParams.get("activityPage"), "2");

  const proposals = read({ metric: "proposals", day: selectedDay });
  assert.equal(proposals.total, 4);
  assert.ok(proposals.records.every(({ contextHref }) => contextHref?.includes("/proposals/")));
  const ci = read({ metric: "ci", day: selectedDay });
  assert.deepEqual(ci.records.map(({ id }) => id), [ciId]);
  assert.match(ci.records[0].contextHref ?? "", /\/proposals\//);
  assert.equal(ci.chart.unit, "CI results");
  assert.equal(new URL(issues.metrics[2].href, "http://localhost").searchParams.get("day"), null);
  assert.doesNotMatch(JSON.stringify([issues, proposals, ci]), /Private fixture body/);

  event(33, "run.result", requestId);
  const stale = readRepositoryActivity(db, projectId, { metric: "ci", day: selectedDay, snapshot: ci.snapshot }, now);
  assert.equal(stale.kind, "stale");
  assert.equal(new URL(stale.href, "http://localhost").searchParams.get("snapshot"), null);
  assert.equal(read({ metric: "ci", day: selectedDay }).total, 2);
});

test("unavailable default history and shallow history report unknown days", (t) => {
  const { db, repo, root, commit, event, read } = fixture(t);
  const empty = read({ day: selectedDay });
  assert.equal(empty.coverage, "unavailable");
  assert.equal(empty.total, null);
  assert.equal(empty.chart.buckets.find(({ day }) => day === selectedDay)?.count, null);
  event(1, "issue.open");
  const issues = read({ metric: "issues", day: selectedDay });
  assert.equal(issues.total, 1);
  assert.equal(issues.scope.kind, "repository");

  commit("Old commit", "2026-07-01T10:00:00Z");
  commit("Shallow tip", "2026-07-10T10:00:00Z");
  const shallow = join(root, "shallow");
  execFileSync("git", ["clone", "-q", "--depth=1", "--no-local", repo, shallow]);
  db.prepare("UPDATE projects SET repo_path = ? WHERE id = ?").run(shallow, projectId);
  const result = read({ day: selectedDay });
  assert.equal(result.coverage, "partial");
  assert.equal(result.total, 1);
  assert.equal(result.chart.buckets.find(({ day }) => day === selectedDay)?.partial, true);
  assert.equal(result.chart.buckets.find(({ day }) => day === "2026-07-01")?.count, null);
});

test("governed activity uses exact native visibility before counting or linking", { skip: process.platform === "win32" }, (t) => {
  const { repo, root, dbFile, commit, event } = fixture(t);
  commit("Main", "2026-07-10T10:00:00Z");
  mkdirSync(join(repo, ".git", "hn", "contribution"), { recursive: true, mode: 0o700 });
  const visibleId = event(1, "issue.open");
  const deniedId = event(2, "issue.open");
  const unknownId = event(3, "issue.open");
  const bin = join(root, "fake-hn");
  writeFileSync(bin, `#!/usr/bin/env node
    const id = process.argv[4];
    if (id === ${JSON.stringify(visibleId)}) {
      console.log(JSON.stringify({ ok: true, data: { id, schema: "hn.consumer/1",
        history_scope: "visible_operative_history", event: {
          kind: "issue.open", timestamp: "2026-07-10T01:30:00Z", actorName: "Visible signer",
        } } }));
    } else if (id === ${JSON.stringify(deniedId)}) {
      console.log(JSON.stringify({ ok: false, error: { origin: "native", code: "not_found" } }));
      process.exitCode = 1;
    } else {
      console.error("Sensitive native failure");
      process.exitCode = 1;
    }
  `, { mode: 0o700 });
  const result = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
    const { openDb } = require("./src/lib/workbox/db.ts");
    const { readRepositoryActivity } = require("./src/lib/workbox/repository-activity.ts");
    const db = openDb(process.argv[1]);
    try {
      console.log(JSON.stringify(readRepositoryActivity(db, "calendar",
        { metric: "issues", day: "2026-07-10" }, new Date(process.argv[2]))));
    } finally {
      db.close();
    }
  `, dbFile, now.toISOString()], {
    encoding: "utf8", env: { ...process.env, WORKBOX_HN_BIN: bin },
  }));
  assert.equal(result.kind, "activity");
  assert.equal(result.coverage, "partial");
  assert.equal(result.total, 1);
  assert.deepEqual(result.records.map((record: { id: string; detail: string }) => [record.id, record.detail]),
    [[visibleId, "Visible signer"]]);
  assert.ok(!JSON.stringify(result).includes(deniedId));
  assert.ok(!JSON.stringify(result).includes(unknownId));
  assert.doesNotMatch(JSON.stringify(result), /Sensitive native failure/);
});
