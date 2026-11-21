import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { HN_BIN } from "../src/lib/hn/runner";
import { navigateWorkboxAddress } from "../src/lib/workbox/address-read";
import { openDb } from "../src/lib/workbox/db";
import { resolveProposalDetail } from "../src/lib/workbox/proposal-detail";
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
  const dbPath = join(root, "index.sqlite");
  const db = openDb(dbPath);
  t.after(() => db.close());
  db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run("workbox-demo", "Demo", repo);
  return { db, dbPath, env, repo, git, hn };
}

async function startWebFixture(env: NodeJS.ProcessEnv, signal: AbortSignal) {
  // Core checks run tests before building, so serve the real routes in dev mode.
  const child = spawn(process.execPath, [
    resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "0",
  ], { env: { ...env, NEXT_TELEMETRY_DISABLED: "1" } });
  let output = "";
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    const closed = once(child, "close");
    child.kill();
    await closed;
  };
  try {
    const origin = await new Promise<string>((accept, reject) => {
      const timer = setTimeout(() => reject(new Error(`Workbox startup timed out.\n${output}`)), 20_000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`Workbox exited with ${code}.\n${output}`)); });
      function capture(chunk: Buffer) {
        output += chunk;
        const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
        if (url && output.includes("Ready in")) { clearTimeout(timer); accept(url); }
      }
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
    });
    return { origin, stop, signal };
  } catch (error) {
    await stop();
    throw error;
  }
}

async function openProposalOverHttp(origin: string, uri: string, href: string, signal: AbortSignal) {
  const response = await fetch(`${origin}/open?${new URLSearchParams({ address: uri })}`, {
    redirect: "manual", signal,
  });
  let location: string | null;
  if (response.status === 200) {
    // If the page has begun streaming, Next emits a browser meta refresh.
    const html = (await response.text()).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
    location = html.match(/<meta\b[^>]*http-equiv="refresh"[^>]*content="\d+;url=([^"]+)"/i)?.[1] ?? null;
  } else {
    assert.equal(response.status, 307, "expected an /open redirect");
    location = response.headers.get("location");
    await response.body?.cancel();
  }
  assert.ok(location, "expected /open to send a redirect target");
  const target = new URL(location, response.url);
  assert.equal(target.href, origin + href);
  const page = await fetch(target, { redirect: "manual", signal });
  assert.equal(page.status, 200, "expected the canonical proposal page");
  const html = (await page.text()).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
  const fields = [...html.matchAll(/<dt[^>]*>(Candidate ID|Base commit|Head commit)<\/dt>\s*<dd>\s*<code[^>]*>([^<]+)<\/code>\s*<\/dd>/g)];
  return Object.fromEntries(fields.map(([, label, value]) => [label, value]));
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

test("follows /open over HTTP to a visible signed candidate and reads the same revision over MCP", {
  skip: !existsSync(resolve(HN_BIN)) && "Set WORKBOX_HN_BIN to a Hubnot binary",
  timeout: 90_000,
}, async (t) => {
  const { db, dbPath, env, repo, git, hn } = fixture(t);
  hn("init", "--name", "Proposal Fixture");
  const { actor } = JSON.parse(hn("identity", "show", "--json")).data as { actor: string };
  mkdirSync(join(repo, ".hn"), { recursive: true });
  writeFileSync(join(repo, ".hn", "policy.json"), JSON.stringify({
    version: "hn.policy/0",
    maintainers: [actor],
    proposals: { requiredApprovals: 1, requiredAccepts: 1, trustedReviewers: [actor], allowAuthorApproval: true },
  }));
  git("add", ".hn/policy.json");
  git("commit", "-qm", "Commit proposal policy");
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
  assert.notEqual(git("rev-parse", "topic"), head);
  const before = git("show-ref");

  const uri = `workbox://project/workbox-demo/proposals/${id}`;
  const navigation = navigateWorkboxAddress(db, uri);
  assert.ok(navigation.ok);
  assert.equal(navigation.data.uri, uri);
  assert.equal(navigation.data.href, `/p/workbox-demo/proposals/sha256%3A${digest}`);
  const project = getProject(db, "workbox-demo");
  assert.ok(project);
  const detail = await resolveProposalDetail(db, project, id);
  assert.equal(detail.kind, "candidate");
  assert.deepEqual({ id: detail.candidate.id, base: detail.candidate.base, head: detail.candidate.head, title: detail.candidate.title },
    { id, base, head, title });

  const resource = await readResource(db, uri);
  assert.deepEqual(JSON.parse(resource.text), detail);
  const server = await startWebFixture({ ...env, WORKBOX_DB_PATH: dbPath, WORKBOX_HN_BIN: resolve(HN_BIN) }, t.signal);
  try {
    assert.deepEqual(await openProposalOverHttp(server.origin, uri, navigation.data.href, server.signal), {
      "Candidate ID": id, "Base commit": base, "Head commit": head,
    });
  } finally {
    await server.stop();
  }
  assert.equal(git("show-ref"), before, "deep-link reads must not change Git refs");
});
