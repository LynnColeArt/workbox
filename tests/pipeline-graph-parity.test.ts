import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test, { type TestContext } from "node:test";
import { openDb } from "../src/lib/workbox/db";
import type { PipelineDraft } from "../src/lib/workbox/pipeline-draft";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function fixture(t: TestContext, binary?: string) {
  const directory = mkdtempSync(join(tmpdir(), "workbox-graph-parity-"));
  const repo = join(directory, "repository");
  mkdirSync(repo);
  const env = {
    ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(directory, "no-config"),
    WORKBOX_DB_PATH: join(directory, "index.db"), WORKBOX_HN_BIN: binary ?? join(directory, "missing-hn"),
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8", timeout: 5000 });
  const hn = (...args: string[]) => execFileSync(env.WORKBOX_HN_BIN, args, { cwd: repo, env, encoding: "utf8", timeout: 5000 });
  git("init", "-q", "-b", "trunk");
  git("config", "user.name", "Graph fixture");
  git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(repo, ".hn", "pipelines"), { recursive: true });
  const original = '{\r\n  "version": "hn.pipeline/0",\r\n  "steps": [{"name":"start","command":"true"}]\r\n}';
  writeFileSync(join(repo, ".hn", "pipelines", "check.json"), original);
  const catalog = {
    schema: "workbox.pipeline-templates/1",
    templates: [{
      id: "suite", label: "Test suite", inputs: [{ key: "value", label: "Value", type: "string", default: "suite name" }],
      step: { name: "test", command: "true", args: ["--suite", { input: "value" }] },
    }],
  };
  writeFileSync(join(repo, ".hn", "pipeline-templates.json"), JSON.stringify(catalog));
  if (binary) {
    git("commit", "--allow-empty", "-qm", "Initialize fixture");
    hn("init", "--name", "Graph Fixture");
    const { actor } = JSON.parse(hn("identity", "show", "--json")).data;
    writeFileSync(join(repo, ".hn", "policy.json"), JSON.stringify({
      version: "hn.policy/0", maintainers: [actor], proposals: { requiredAccepts: 1 },
    }));
  }
  git("add", ".hn");
  git("commit", "-qm", "Seed pipeline");
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
  git("update-ref", "refs/remotes/origin/trunk", git("rev-parse", "trunk").trim());
  git("switch", "-qc", "local");
  writeFileSync(join(repo, ".hn", "pipeline-templates.json"), "{}");
  {
    using db = openDb(env.WORKBOX_DB_PATH);
    db.prepare("INSERT INTO projects (id, repo_path, name) VALUES (?, ?, ?)").run("repo", repo, "Pipeline fixture");
  }

  const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "0"], { env });
  server.stderr.resume();
  const mcp = spawn(process.execPath, ["--import", "tsx", "mcp/server.ts"], { env });
  mcp.stderr.resume();
  const lines = createInterface({ input: mcp.stdout })[Symbol.asyncIterator]();
  const serverClosed = once(server, "close");
  const mcpClosed = once(mcp, "close");
  t.after(async () => {
    mcp.kill();
    server.kill();
    await Promise.all([serverClosed, mcpClosed]);
    rmSync(directory, { recursive: true, force: true });
  });
  const origin = await new Promise<string>((accept, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Graph fixture server did not start")), 12_000);
    server.once("error", error => { clearTimeout(timer); reject(error); });
    server.once("exit", code => { clearTimeout(timer); reject(new Error(`Graph fixture exited with ${code}`)); });
    server.stdout.on("data", chunk => {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url && output.includes("Ready in")) { clearTimeout(timer); accept(url); }
    });
  });
  let id = 0;
  async function browser<T>(action: string, fields: object) {
    const res = await fetch(origin + "/api/projects/repo/settings", {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ ...fields, action }), signal: t.signal,
    });
    return { status: res.status, result: await res.json() as Result<T> };
  }
  async function agent<T>(name: string, fields: object) {
    mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: {
      name, arguments: { ...fields, project: "repo" },
    } }) + "\n");
    const line = await lines.next();
    assert.ok(!line.done, `MCP did not answer ${name}`);
    const message = JSON.parse(line.value);
    assert.equal(message.id, id);
    const result = JSON.parse(message.result.content[0].text) as Result<T>;
    assert.equal(message.result.isError, !result.ok);
    return result;
  }
  async function same<T>(action: string, tool: string, fields: object) {
    const response = await browser<T>(action, fields);
    assert.deepEqual(await agent<T>(tool, fields), response.result);
    return response;
  }
  return { git, browser, agent, same, origin, original };
}

function success<T>(result: Result<T>) {
  assert.ok(result.ok, JSON.stringify(result));
  return result.data;
}

type Review = {
  diff: { state: string; before: string | null; after: string };
  submission: Record<string, unknown> | null;
};
type Proposal = { id: string; base: string; head: string; href: string };

const parityEnabled = process.env.WORKBOX_PIPELINE_GRAPH_PARITY_TEST === "1";

test("Graph and JSON edits, pinned templates, exact review and proposal retries match over HTTP and MCP", {
  skip: !parityEnabled, timeout: 45_000,
}, async t => {
  const binary = process.env.WORKBOX_HN_BIN;
  assert.ok(binary, "Provide a publication-capable Hubnot in WORKBOX_HN_BIN");
  const { git, browser, agent, same, origin, original } = await fixture(t, binary);
  const snapshot = () => [git("show-ref"), git("status", "--porcelain=v1"), git("ls-files", "--stage"), git("count-objects", "-v")];
  const before = snapshot();
  let draft = success((await same<PipelineDraft>("draft_open", "workbox_open_pipeline_draft", { name: "check" })).result);
  assert.equal(draft.definition, original);
  assert.equal(draft.base.branch, "trunk");
  const catalog = success((await same<{ templates: { id: string }[]; base: { commit: string } }>(
    "draft_templates", "workbox_pipeline_templates", { draft },
  )).result);
  assert.equal(catalog.templates[0].id, "suite");
  assert.equal(catalog.base.commit, draft.base.commit);
  const mutate = async (edit: object) => {
    draft = success((await same<PipelineDraft>("draft_edit", "workbox_edit_pipeline_draft", {
      draft, expectedRevision: draft.revision, edit,
    })).result);
  };
  await mutate({ kind: "add" });
  assert.equal(draft.projection, "incomplete");
  const blank = draft.nodes.at(-1)!.id;
  await mutate({ kind: "patch", nodeId: blank, patch: { name: "Editable", command: "true", args: ["", "two words"] } });
  assert.deepEqual(draft.nodes.at(-1)?.step.args, ["", "two words"]);
  await mutate({ kind: "remove", nodeId: blank });
  const literal = "suite name; literal";
  await mutate({ kind: "expand_template", templateId: "suite", inputs: { value: literal } });
  assert.deepEqual(draft.nodes[1].step.args, ["--suite", literal]);
  const templateNode = draft.nodes[1].id;
  await mutate({ kind: "duplicate", nodeId: templateNode });
  await mutate({ kind: "reorder", nodeId: templateNode, index: 0 });
  await mutate({ kind: "remove", nodeId: draft.nodes[2].id });
  assert.deepEqual(draft.nodes.map(node => node.step.name), ["test", "start"]);
  assert.deepEqual(draft.edges, [{ from: draft.nodes[0].id, to: draft.nodes[1].id }]);
  const graphText = draft.definition;
  await mutate({ kind: "replace_json", definition: "{" });
  assert.equal(draft.projection, "stale");
  assert.equal(draft.definition, "{");
  assert.equal((await same("draft_review", "workbox_review_pipeline_draft", { draft, expectedRevision: draft.revision })).result.ok, false);
  await mutate({ kind: "restore" });
  assert.equal(draft.definition, graphText);
  const reviewedText = graphText.trimEnd().replaceAll("\n", "\r\n");
  await mutate({ kind: "replace_json", definition: reviewedText });
  const stale = await same("draft_edit", "workbox_edit_pipeline_draft", { draft, expectedRevision: "0".repeat(64), edit: { kind: "add" } });
  assert.equal(stale.status, 409);
  const review = success((await same<Review>("draft_review", "workbox_review_pipeline_draft", { draft, expectedRevision: draft.revision })).result);
  assert.equal(review.diff.before, original);
  assert.equal(review.diff.after, reviewedText);
  assert.deepEqual(snapshot(), before);
  assert.ok(review.submission);
  const confirmed = { ...review.submission, confirmed: true };
  const first = success((await browser<Proposal>("submit", confirmed)).result);
  assert.equal(git("show", `${first.head}:.hn/pipelines/check.json`), reviewedText);
  assert.equal(git("rev-parse", `${first.head}^`).trim(), draft.base.commit);
  const proposal = await fetch(origin + first.href, { signal: t.signal });
  assert.equal(proposal.status, 200);
  assert.match(await proposal.text(), /Update pipeline check/);
  git("update-ref", "refs/heads/trunk", first.head, draft.base.commit);
  const refs = git("show-ref");
  assert.deepEqual(success(await agent<Proposal>("workbox_submit_pipeline_proposal", confirmed)), first);
  assert.equal(git("show-ref"), refs);
  assert.equal(git("for-each-ref", "--format=%(objectname)", "refs/hn/proposals").trim(), first.head);
});

test("Graph review remains available when native submission is unavailable", {
  skip: !parityEnabled, timeout: 20_000,
}, async t => {
  const { same } = await fixture(t, process.env.WORKBOX_HN_LEGACY_BIN);
  const draft = success((await same<PipelineDraft>("draft_open", "workbox_open_pipeline_draft", { name: "check" })).result);
  const edit = { kind: "replace_json", definition: draft.definition + "\n" };
  const formatted = success((await same<PipelineDraft>("draft_edit", "workbox_edit_pipeline_draft", {
    draft, expectedRevision: draft.revision, edit,
  })).result);
  const review = success((await same<Review>("draft_review", "workbox_review_pipeline_draft", {
    draft: formatted, expectedRevision: formatted.revision,
  })).result);
  assert.equal(review.diff.before, draft.definition);
  assert.equal(review.diff.after, edit.definition);
  assert.equal(review.submission, null);
});
