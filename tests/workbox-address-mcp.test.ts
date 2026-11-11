import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { openDb } from "../src/lib/workbox/db";

const temp = mkdtempSync(join(tmpdir(), "workbox-address-mcp-"));
const dbPath = join(temp, "index.db");
const fullId = `sha256:${"a".repeat(64)}`;
const slug = "Firewalker";
const home = "workbox://home";
const directory = "workbox://projects/";
const canonicalProject = `${directory}${slug}`;
const legacyProject = `workbox://project/${slug}`;
const timestamp = "2026-11-11T10:00:00.000Z";
let beforeReads: Buffer;

before(() => {
  const pipelines = join(temp, ".hn", "pipelines");
  mkdirSync(pipelines, { recursive: true });
  writeFileSync(join(pipelines, "lint.json"), JSON.stringify({
    name: "lint", steps: [{ command: "lint", args: [fullId] }],
  }));
  writeFileSync(join(temp, ".hn", "policy.json"), JSON.stringify({
    version: "1", maintainers: [fullId], pipelines: { lint: { requiredResults: 1, trustedRunners: [fullId] } },
  }));
  {
    using db = openDb(dbPath);
    const project = db.prepare("INSERT INTO projects (id, name, repo_path, description) VALUES (?, ?, ?, ?)");
    project.run(slug, `Firewalker ${fullId}`, temp, `Project ${fullId}`);
    project.run("Unaddressable project", "Unaddressable project", temp, "");
    db.prepare("INSERT INTO actors (project_id, fingerprint, display_name) VALUES (?, ?, ?)").run(slug, fullId, "Ada");
    db.prepare("INSERT INTO issues (project_id, issue_id, title, body, creator, number, labels_json) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      slug, fullId, `Issue ${fullId}`, "Body", fullId, 7, '["test"]',
    );
    db.prepare("INSERT INTO issue_comments (project_id, issue_id, event_id, actor, body, timestamp) VALUES (?, ?, ?, ?, ?, ?)").run(
      slug, fullId, fullId, fullId, `Comment ${fullId}`, timestamp,
    );
    db.prepare("INSERT INTO memories (project_id, memory_id, actor, stream, kind, content, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      slug, fullId, fullId, "notes", "note", `Remember ${fullId}`, "{}",
    );
  }
  beforeReads = readFileSync(dbPath);
});

after(() => {
  rmSync(temp, { recursive: true, force: true });
});

type Resource = { uri: string; name: string; description?: string; mimeType: string };
type Content = { uri: string; mimeType: string; text: string };
type Request = { method: string; params?: Record<string, unknown> };
type Reply = {
  id: number;
  result?: { resources?: Resource[]; contents?: Content[]; content?: Array<{ text: string }> };
  error?: { code: number; message: string };
};

function exchange(requests: Request[], index = dbPath): Reply[] {
  const child = spawnSync(process.execPath, ["--import", "tsx", "mcp/server.ts"], {
    input: requests.map((request, id) => JSON.stringify({ ...request, jsonrpc: "2.0", id })).join("\n") + "\n",
    encoding: "utf8",
    env: { ...process.env, WORKBOX_DB_PATH: index, WORKBOX_HN_BIN: join(temp, "missing-hn") },
    timeout: 15_000,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  const replies = child.stdout.trim().split("\n").map((line) => JSON.parse(line) as Reply);
  assert.equal(replies.length, requests.length);
  return replies.sort((a, b) => a.id - b.id);
}

function read(uri: unknown): Request {
  return { method: "resources/read", params: { uri } };
}

function content(reply: Reply, uri: string) {
  assert.equal(reply.error, undefined);
  const contents = reply.result?.contents;
  assert.equal(contents?.length, 1);
  const entry = contents![0];
  assert.equal(entry.uri, uri);
  assert.equal(entry.mimeType, "application/json");
  assert.doesNotMatch(entry.text, /[0-9a-f]{64}/);
  return JSON.parse(entry.text) as unknown;
}

test("MCP discovery lists canonical addresses and redacts user-derived labels", () => {
  const [reply] = exchange([{ method: "resources/list" }]);
  assert.equal(reply.error, undefined);
  const resources = reply.result!.resources!;
  assert.deepEqual(resources.map((resource) => resource.uri), [
    home, directory, `${canonicalProject}/`, `${canonicalProject}/memory`,
    `${canonicalProject}/pipelines`, `${canonicalProject}/task/WP-7`,
  ]);
  assert.equal(resources.every((resource) => resource.mimeType === "application/json"), true);
  assert.equal(resources[2].description, "Project fp:aaaaaaaa");
  assert.equal(resources[5].name, "#7 Issue fp:aaaaaaaa");
  assert.doesNotMatch(JSON.stringify(resources), /[0-9a-f]{64}/);
});

test("canonical and legacy addresses preserve the requested URI and existing payload fields", () => {
  const pairs = [
    [`${canonicalProject}/`, legacyProject],
    [`${canonicalProject}/task/WP-7`, `${legacyProject}/task/WP-0007`],
    [`${canonicalProject}/memory`, `${legacyProject}/memory`],
    [`${canonicalProject}/pipelines`, `${legacyProject}/pipelines`],
  ];
  const replies = exchange(pairs.flatMap((pair) => pair.map(read)));
  const results = pairs.map(([canonical, legacy], index) => {
    const payload = content(replies[index * 2], canonical);
    assert.deepEqual(content(replies[index * 2 + 1], legacy), payload);
    return payload;
  });
  assert.deepEqual(results, [
    {
      id: slug, name: "Firewalker fp:aaaaaaaa", description: "Project fp:aaaaaaaa",
      actorCount: 1, eventCount: 0, verifiedCount: 0, openIssues: 1, totalIssues: 1, lastEventAt: null,
    },
    {
      project: slug, number: 7, title: "Issue fp:aaaaaaaa", status: "open", body: "Body", labels: ["test"],
      conflict: false, comments: [{ by: "Ada", at: timestamp, body: "Comment fp:aaaaaaaa" }],
    },
    [{ kind: "note", content: "Remember fp:aaaaaaaa", by: "Ada", at: null, anchor: null }],
    {
      pipelines: [{ name: "lint", steps: ["lint fp:aaaaaaaa"] }],
      trust: { version: "1", maintainers: 1, pipelineRules: [{ name: "lint", requiredResults: 1, trustedRunners: 1 }] },
    },
  ]);
  assert.deepEqual(readFileSync(dbPath), beforeReads);
});

test("home and directory are readable independently of browser routes", () => {
  const [overview, projects, existingTool] = exchange([
    read(home), read(directory), { method: "tools/call", params: { name: "workbox_projects", arguments: {} } },
  ]);
  assert.deepEqual(content(overview, home), { projects: 2, events: 0, verified: 0, issues: 1, actors: 1 });
  assert.deepEqual(content(projects, directory), JSON.parse(existingTool.result!.content![0].text));
});

test("malformed, missing and reserved addresses return controlled JSON-RPC errors", () => {
  const replies = exchange([
    read(`workbox://projects/%2f${fullId}`),
    read([home]),
    read("workbox://projects/unknown/"),
    read(`${canonicalProject}/task/WP-8`),
    read("workbox://trending"),
  ]);
  for (const reply of replies) {
    assert.equal(reply.error?.code, -32602);
    assert.doesNotMatch(reply.error!.message, /[0-9a-f]{64}|unknown/);
  }
  const missing = join(temp, "missing", "index.db");
  for (const reply of exchange([read(home), { method: "resources/list" }], missing)) {
    assert.equal(reply.error?.code, -32602);
    assert.doesNotMatch(reply.error!.message, /missing/);
  }
  assert.equal(existsSync(missing), false);
});

test("an ambiguous issue number is neither advertised nor readable", () => {
  {
    using db = openDb(dbPath);
    db.prepare("INSERT INTO issues (project_id, issue_id, title, creator, number) VALUES (?, ?, ?, ?, ?)").run(
      slug, `sha256:${"b".repeat(64)}`, "Duplicate issue number", fullId, 7,
    );
  }
  const [list, canonical, legacy] = exchange([
    { method: "resources/list" },
    read(`${canonicalProject}/task/WP-7`),
    read(`${legacyProject}/task/WP-7`),
  ]);
  assert.equal(list.error, undefined);
  assert.equal(list.result!.resources!.some((resource) => resource.uri.endsWith("/task/WP-7")), false);
  assert.equal(canonical.error?.code, -32602);
  assert.deepEqual(legacy.error, canonical.error);
});
