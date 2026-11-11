import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWorkboxAddress,
  parseWorkboxAddress,
  type WorkboxAddress,
} from "../src/lib/workbox/address";
import { resolveWorkboxAddress } from "../src/lib/workbox/address-resolution";
import { openDb } from "../src/lib/workbox/db";

const canonicalAddresses: ReadonlyArray<readonly [string, WorkboxAddress]> = [
  ["workbox://home", { kind: "home" }],
  ["workbox://projects/", { kind: "projectDirectory" }],
  ["workbox://projects/Fire-Walker.v2_1/", { kind: "project", projectSlug: "Fire-Walker.v2_1" }],
  [
    "workbox://projects/Fire-Walker.v2_1/task/WP-1",
    { kind: "issue", projectSlug: "Fire-Walker.v2_1", issueNumber: 1 },
  ],
  ["workbox://projects/Fire-Walker.v2_1/memory", { kind: "memory", projectSlug: "Fire-Walker.v2_1" }],
  ["workbox://projects/Fire-Walker.v2_1/pipelines", { kind: "pipelines", projectSlug: "Fire-Walker.v2_1" }],
  ["workbox://trending", { kind: "trending" }],
];

test("canonical addresses round-trip with or without one terminal slash", () => {
  for (const [canonical, target] of canonicalAddresses) {
    const withoutSlash = canonical.replace(/\/$/, "");
    assert.deepEqual(parseWorkboxAddress(withoutSlash), { ok: true, target });
    assert.deepEqual(parseWorkboxAddress(`${withoutSlash}/`), { ok: true, target });
    assert.equal(formatWorkboxAddress(target), canonical);
  }
});

test("legacy addresses retain slug case and normalize to their canonical spelling", () => {
  for (const [canonical, target] of canonicalAddresses.slice(2, 6)) {
    const legacy = canonical.replace("://projects/", "://project/").replace(/\/$/, "");
    assert.deepEqual(parseWorkboxAddress(legacy), { ok: true, target });
    assert.deepEqual(parseWorkboxAddress(`${legacy}/`), { ok: true, target });
    assert.equal(formatWorkboxAddress(target), canonical);
  }
  assert.deepEqual(
    parseWorkboxAddress("workbox://project/Fire-Walker.v2_1/task/WP-0001"),
    parseWorkboxAddress("workbox://projects/Fire-Walker.v2_1/task/WP-1"),
  );
});

test("formatting skips catalog targets outside the address grammar", () => {
  assert.equal(formatWorkboxAddress({ kind: "project", projectSlug: "Fire walker" }), null);
  assert.equal(formatWorkboxAddress({ kind: "memory", projectSlug: ".." }), null);
  assert.equal(formatWorkboxAddress({
    kind: "issue", projectSlug: "Firewalker", issueNumber: Number.MAX_SAFE_INTEGER + 1,
  }), null);
});

test("malformed addresses return a controlled error before URL normalization", () => {
  const malformed = [
    "",
    "https://workbox.local/projects/",
    "workbox://",
    "workbox:///",
    "workbox://project/",
    "workbox://elsewhere",
    "workbox://home/extra",
    "workbox://home//",
    "workbox://user@projects/Firewalker",
    "workbox://projects:4123/Firewalker",
    "workbox://projects/Firewalker?next=elsewhere",
    "workbox://projects/Firewalker#section",
    "workbox://projects/Firewalker?",
    "workbox://projects/Firewalker#",
    "workbox://projects//Firewalker",
    "workbox://projects/Firewalker//memory",
    "workbox://projects/Firewalker/task",
    "workbox://projects/Firewalker/memory/extra",
    "workbox://projects/Firewalker/../memory",
    "workbox://projects/.",
    "workbox://project/..",
    "workbox://projects/%2e%2e",
    "workbox://projects/Fire%2Fwalker",
    "workbox://projects/Fire%5cwalker",
    "workbox://projects/Fire%252Fwalker",
    "workbox://projects/Fire\\walker",
    "workbox://projects/Fire walker",
    "workbox://projects/Firewálker",
    " workbox://home",
    "workbox://home ",
    "workbox://projects/Firewalker\n",
    "workbox://project/Firewalker/task/WP-1\n",
    "workbox://projects/Firewalker\u0000",
    "workbox://projects/Firewalker/task/WP-",
    "workbox://projects/Firewalker/task/WP-0",
    "workbox://projects/Firewalker/task/WP--1",
    "workbox://projects/Firewalker/task/WP-+1",
    "workbox://projects/Firewalker/task/WP-1.0",
    "workbox://projects/Firewalker/task/WP-1e2",
    "workbox://projects/Firewalker/task/WP-9007199254740992",
  ];
  for (const address of malformed) {
    assert.deepEqual(
      parseWorkboxAddress(address),
      { ok: false, error: "malformed_address" },
      JSON.stringify(address),
    );
  }
  assert.deepEqual(parseWorkboxAddress("workbox://projects/Firewalker/task/WP-9007199254740991"), {
    ok: true,
    target: { kind: "issue", projectSlug: "Firewalker", issueNumber: Number.MAX_SAFE_INTEGER },
  });
});

test("resolution is read-only and scopes numbered issues to the exact indexed project", () => {
  using db = openDb(":memory:");
  const createProject = db.prepare("INSERT INTO projects (id, repo_path, name) VALUES (?, ?, ?)");
  createProject.run("Firewalker", "/fixtures/firewalker", "Firewalker");
  createProject.run("Other", "/fixtures/other", "Other");

  const createIssue = db.prepare(
    "INSERT INTO issues (project_id, issue_id, title, creator, number) VALUES (?, ?, ?, ?, ?)",
  );
  const firewalkerIssue = `sha256:${"a".repeat(64)}`;
  const otherIssue = `sha256:${"b".repeat(64)}`;
  createIssue.run("Firewalker", firewalkerIssue, "First issue", "author", 1);
  createIssue.run("Other", otherIssue, "Other issue", "author", 1);
  createIssue.run("Other", `sha256:${"c".repeat(64)}`, "Unnumbered issue", "author", null);
  createIssue.run("Other", `sha256:${"d".repeat(64)}`, "Duplicate number", "author", 2);
  createIssue.run("Other", `sha256:${"e".repeat(64)}`, "Duplicate number", "author", 2);
  db.exec("PRAGMA query_only = ON");

  for (const [projectSlug, issueId] of [["Firewalker", firewalkerIssue], ["Other", otherIssue]]) {
    const target = { kind: "issue", projectSlug, issueNumber: 1 } as const;
    assert.deepEqual(resolveWorkboxAddress(db, target), { ok: true, target: { ...target, issueId } });
  }
  for (const kind of ["project", "memory", "pipelines"] as const) {
    const target = { kind, projectSlug: "Firewalker" };
    assert.deepEqual(resolveWorkboxAddress(db, target), { ok: true, target });
  }
  for (const kind of ["home", "projectDirectory", "trending"] as const) {
    const target = { kind };
    assert.deepEqual(resolveWorkboxAddress(db, target), { ok: true, target });
  }
  assert.deepEqual(resolveWorkboxAddress(db, { kind: "project", projectSlug: "firewalker" }), {
    ok: false, error: "target_not_found",
  });
  assert.deepEqual(resolveWorkboxAddress(db, { kind: "issue", projectSlug: "Firewalker", issueNumber: 2 }), {
    ok: false, error: "target_not_found",
  });
  assert.deepEqual(resolveWorkboxAddress(db, { kind: "issue", projectSlug: "Other", issueNumber: 2 }), {
    ok: false, error: "target_not_found",
  });
});
