import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after, before } from "node:test";
import { setTimeout } from "node:timers/promises";
import { openDb } from "../src/lib/workbox/db";

const directory = mkdtempSync(join(tmpdir(), "workbox-address-web-"));
const dbPath = join(directory, "index.sqlite");
const project = "Firewalker";
const issueId = `sha256:${"a".repeat(64)}`;
let server: ChildProcess;
let origin = "";
let output = "";

before(async () => {
  // Run npm run build before this suite. Port 0 keeps the fixture separate from
  // any running Workbox instance and lets the OS choose a free loopback port.
  server = spawn(
    process.execPath,
    [resolve("node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", "0"],
    {
      env: { ...process.env, WORKBOX_DB_PATH: dbPath },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout?.on("data", (chunk) => {
    output += chunk.toString();
    origin = output.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
  });
  server.stderr?.on("data", (chunk) => { output += chunk.toString(); });

  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.exitCode !== null) break;
    if (origin) {
      try {
        await fetch(`${origin}/favicon.ico`, { signal: AbortSignal.timeout(1000) });
        return;
      } catch {
        // The listening socket can be reported before Next is ready.
      }
    }
    await setTimeout(100);
  }
  assert.fail(`Workbox fixture server did not start:\n${output}`);
});

after(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
  rmSync(directory, { recursive: true, force: true });
});

function addressRequest(...addresses: string[]) {
  const url = new URL("/open", origin);
  for (const address of addresses) url.searchParams.append("address", address);
  return fetch(url, { redirect: "manual" });
}

async function assertNavigation(address: string, path: string) {
  const response = await addressRequest(address);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes(`http-equiv="refresh" content="0;url=${path}"`), "The server provides a same-instance refresh");
  const fallbackLink = html.match(/<a\b([^>]*)>Continue to the destination<\/a>/)?.[1];
  assert.ok(fallbackLink?.includes(`href="${path}"`), "A plain link is available if refresh is disabled");
}

async function assertAddressError(addresses: string[], error: RegExp, value: string) {
  const response = await addressRequest(...addresses);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  const html = await response.text();
  assert.match(html, error);
  assert.ok(html.includes(`value="${value}"`), "The entered address is retained");
  assert.match(html, /aria-invalid="true"/);
}

test("readiness responds without a body or database and cannot be cached", async () => {
  const response = await fetch(`${origin}/api/address-handler`, {
    method: "HEAD",
    redirect: "manual",
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("workbox-address-handler"), "1");
  assert.match(response.headers.get("cache-control") ?? "", /(?:^|,)\s*no-store(?:,|$)/);
  assert.equal(await response.text(), "");
  assert.equal(existsSync(dbPath), false);
});

test("the navigation and native GET form are present in the server-rendered HTML", async () => {
  const response = await addressRequest();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<a\b[^>]*href="\/open"[^>]*>Open address<\/a>/);
  assert.match(html, /<form\b[^>]*action="\/open"[^>]*method="get"/i);
  assert.match(html, /<label\b[^>]*for="workbox-address"[^>]*>Workbox address<\/label>/);
  assert.match(html, /<input\b(?=[^>]*\bid="workbox-address")(?=[^>]*\bname="address")[^>]*>/);
  assert.match(html, /<button\b[^>]*type="submit"/);
});

test("global destinations work without opening the project index", async () => {
  await assertNavigation("  workbox://home  ", "/");
  await assertAddressError(["workbox://projects/"], /Explore is unavailable/, "workbox://projects/");
  await assertAddressError(["workbox://trending"], /Trending is unavailable/, "workbox://trending");
  await assertAddressError(["workbox://projects/Firewalker"], /project index is unavailable/, "workbox://projects/Firewalker");
  assert.equal(existsSync(dbPath), false);
});

test("canonical and legacy handoffs redirect to internal project routes", async () => {
  {
    using db = openDb(dbPath);
    db.prepare("INSERT INTO projects (id, repo_path, name) VALUES (?, ?, ?)").run(project, directory, project);
    db.prepare(
      "INSERT INTO issues (project_id, issue_id, title, creator, number) VALUES (?, ?, ?, ?, ?)",
    ).run(project, issueId, "Fixture issue", "fixture", 7);
  }

  for (const namespace of ["projects", "project"]) {
    const base = `workbox://${namespace}/${project}`;
    await assertNavigation(`${base}/`, `/p/${project}`);
    await assertNavigation(`${base}/task/WP-7`, `/p/${project}/issue/${encodeURIComponent(issueId)}`);
    await assertNavigation(`${base}/memory`, `/p/${project}/memories`);
    await assertNavigation(`${base}/pipelines`, `/p/${project}/ci`);
  }
  await assertAddressError(["workbox://projects/Other"], /could not find that project or issue/i, "workbox://projects/Other");
  const missingIssue = `workbox://projects/${project}/task/WP-8`;
  await assertAddressError([missingIssue], /could not find that project or issue/i, missingIssue);
});

test("bad input stays in the form without redirecting or accepting a second value", async () => {
  const external = "  https://example.invalid/path  ";
  await assertAddressError([external], /Enter a valid Workbox address/, external);
  await assertAddressError(["workbox://home", "workbox://trending"], /Enter exactly one Workbox address/, "workbox://home");
  await assertAddressError([""], /Enter a Workbox address/, "");
  await assertAddressError(
    ["workbox://projects/Fire%2Fwalker"],
    /Enter a valid Workbox address/,
    "workbox://projects/Fire%2Fwalker",
  );
});
