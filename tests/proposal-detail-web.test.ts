import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { ProposalStatus } from "../src/lib/hn/proposal-read";
import { openDb } from "../src/lib/workbox/db";
import { indexProject } from "../src/lib/workbox/index";
import { proposalDetailHref } from "../src/lib/workbox/proposal-detail";

// Run after npm run build with WORKBOX_PROPOSAL_WEB_TEST=1 and a Hubnot
// binary supporting native.proposal-read and native.event-read.
const nativeBinary = process.env.WORKBOX_HN_BIN ?? "/tmp/hn";
const projectId = "proposal-web-fixture";
const indexOnlyId = `sha256:${"e".repeat(64)}`;
const absentId = `sha256:${"f".repeat(64)}`;
const indexOnlyBody = "Private projection-only text";
const lateReview = "Late review for the original candidate";
const submittedReview = "Integration review for the selected candidate";

function makeFixture(directory: string) {
  const repoPath = join(directory, "repo");
  const dbPath = join(directory, "index.sqlite");
  mkdirSync(repoPath);
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(directory, "empty-git-config"),
    WORKBOX_DB_PATH: dbPath,
    WORKBOX_HN_BIN: nativeBinary,
  };
  function command(binary: string, ...args: string[]) {
    return execFileSync(binary, args, { cwd: repoPath, encoding: "utf8", timeout: 10_000, env }).trim();
  }
  const git = (...args: string[]) => command("git", ...args);
  const hn = (...args: string[]) => command(nativeBinary, ...args);
  const nativeStatus = (id: string) => (JSON.parse(hn("proposal", "status", id, "--json")) as {
    ok: true;
    data: ProposalStatus;
  }).data;
  function proposal(...args: string[]) {
    const refs = () => git("for-each-ref", "--format=%(refname:strip=3)", "refs/hn/proposals").split("\n");
    const before = new Set(refs());
    hn("proposal", ...args);
    const added = refs().filter((ref) => !before.has(ref));
    assert.equal(added.length, 1);
    assert.match(added[0], /^[0-9a-f]{64}$/);
    return `sha256:${added[0]}`;
  }
  function commit(name: string) {
    git("add", ".");
    git("commit", "-qm", name);
    return git("rev-parse", "HEAD");
  }
  git("init", "--initial-branch=main", "--object-format=sha1");
  git("config", "user.name", "Proposal Web Fixture");
  git("config", "user.email", "proposal-web-fixture@example.invalid");
  hn("init", "--name", "Proposal Web Fixture");
  const { actor } = JSON.parse(hn("identity", "show", "--json")).data as { actor: string };
  mkdirSync(join(repoPath, ".hn", "pipelines"), { recursive: true });
  writeFileSync(join(repoPath, ".hn", "policy.json"), JSON.stringify({
    version: "hn.policy/0",
    maintainers: [actor],
    proposals: { requiredApprovals: 1, requiredAccepts: 1, trustedReviewers: [actor], allowAuthorApproval: true },
    pipelines: { "quality-gate": { requiredResults: 1, trustedRunners: [actor] } },
  }));
  writeFileSync(join(repoPath, ".hn", "pipelines", "quality-gate.json"), JSON.stringify({
    version: "hn.pipeline/0",
    steps: [{ name: "check", command: "git", args: ["--version"] }],
  }));
  const file = join(repoPath, "sample.txt");
  writeFileSync(file, "base contents\n");
  const base = commit("Base policy");
  git("checkout", "-qb", "development");
  writeFileSync(file, "original contents\n");
  const originalHead = commit("Original proposal");
  const original = proposal("open", "--base", base, "--head", originalHead, "Sample proposal");
  writeFileSync(file, "selected revision contents\n");
  const head = commit("Selected revision");
  const selected = proposal("revise", original, "--base", base, "--head", head, "--body", "Selected signed revision");
  git("checkout", "-q", "main");
  writeFileSync(file, "sibling contents\n");
  const siblingHead = commit("Sibling revision");
  const sibling = proposal("revise", original, "--base", base, "--head", siblingHead, "--body", "Sibling signed revision");
  git("checkout", "-q", "development");
  writeFileSync(file, "contents after the candidate was signed\n");
  commit("Move development branch");
  hn("review", original, "--approve", "--body", lateReview);
  hn("run", "request", selected, "quality-gate");

  using db = openDb(dbPath);
  const project = { id: projectId, name: "Proposal Web Fixture", description: "", repoPath };
  db.prepare("INSERT INTO projects (id, repo_path, name) VALUES (?, ?, ?)").run(project.id, repoPath, project.name);
  const index = indexProject(db, project);
  assert.equal(index.verified, 5, JSON.stringify(index));
  db.prepare(`
    INSERT INTO events (project_id, event_id, commit_sha, actor, kind, verified, payload_json)
    VALUES (?, ?, ?, ?, 'proposal.open', 1, ?)
  `).run(project.id, indexOnlyId, head, actor, JSON.stringify({ title: indexOnlyBody }));
  const request = db.prepare("SELECT event_id FROM events WHERE kind = 'run.request'").get();
  assert.equal(typeof request?.event_id, "string");
  const runId = String(request?.event_id);

  function recordResultAndDecision() {
    // The fixture pipeline runs only `git --version` in the disposable repo.
    hn("run", "execute", runId, "--backend", "host", "--allow-unsafe-host-execution");
    hn("decide", selected, "--accept", "--body", "Maintainer accepted the selected revision");
    using updatedDb = openDb(dbPath);
    const updated = indexProject(updatedDb, project);
    assert.equal(updated.verified, 2, JSON.stringify(updated));
  }

  async function withoutObject(oid: string, callback: () => Promise<void>) {
    const objectPath = join(repoPath, ".git", "objects", oid.slice(0, 2), oid.slice(2));
    const hiddenPath = join(directory, oid);
    renameSync(objectPath, hiddenPath);
    try {
      await callback();
    } finally {
      renameSync(hiddenPath, objectPath);
    }
  }
  return { env, git, nativeStatus, withoutObject, recordResultAndDecision, original, selected, sibling, base, head, runId };
}

async function startServer(env: NodeJS.ProcessEnv, signal: AbortSignal) {
  const child = spawn(process.execPath, [
    resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "0",
  ], { env, signal });
  let output = "";
  const origin = await new Promise<string>((accept, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Workbox startup timed out.\n${output}`));
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => reject(new Error(`Workbox exited with code ${code}.\n${output}`)));
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url && output.includes("Ready in")) {
        clearTimeout(timeout);
        accept(url);
      }
    });
    child.once("exit", () => clearTimeout(timeout));
  });
  return { child, origin };
}

function mainHtml(html: string) {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
}

test("proposal route keeps signed identity, evidence, and review anchored across views", {
  skip: process.env.WORKBOX_PROPOSAL_WEB_TEST !== "1" && "Set WORKBOX_PROPOSAL_WEB_TEST=1 after building Workbox.",
  timeout: 45_000,
}, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "workbox-proposal-web-"));
  const { fixture, server } = await (async () => {
    try {
      const fixture = makeFixture(directory);
      return { fixture, server: await startServer(fixture.env, t.signal) };
    } catch (error) {
      rmSync(directory, { recursive: true, force: true });
      throw error;
    }
  })();
  t.after(async () => {
    const { child } = server;
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill();
      await closed;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  const { original, selected, sibling, base, head } = fixture;

  const exact = (id: string) => proposalDetailHref(projectId, id);
  const checksUrl = proposalDetailHref(projectId, selected, { view: "checks" });
  const filesUrl = proposalDetailHref(projectId, selected, { view: "files" });
  async function html(path: string) {
    const response = await fetch(server.origin + path, { signal: t.signal });
    assert.equal(response.status, 200);
    const document = await response.text();
    assert.ok(!document.includes(indexOnlyBody));
    assert.ok(!document.includes(directory));
    return mainHtml(document);
  }
  const list = await html(`/p/${projectId}/proposals`);
  const lineageLinks = [...list.matchAll(/href="([^"]+\?mode=lineage)"/g)].map(([, href]) => href);
  assert.equal(new Set(lineageLinks).size, 1);
  assert.doesNotMatch(list, new RegExp(indexOnlyBody));
  assert.doesNotMatch(list, new RegExp(indexOnlyId));

  const chooser = await html(lineageLinks[0]);
  assert.match(chooser, /Choose a revision/);
  for (const id of [selected, sibling]) assert.ok(chooser.includes(`href="${exact(id)}"`));
  assert.ok(!chooser.includes(`href="${exact(original)}"`));

  const selectedConversation = await html(exact(selected));
  assert.match(selectedConversation, /<nav aria-label="Proposal views"/);
  assert.match(selectedConversation, /aria-current="page"[^>]*>Conversation/);
  assert.match(selectedConversation, /Next actions/);
  assert.match(selectedConversation, /Revision status/);
  for (const id of [selected, head, base]) assert.ok(selectedConversation.includes(id));
  assert.match(selectedConversation, new RegExp(`Other revisions[\\s\\S]*${lateReview}`));
  assert.match(selectedConversation, /Requested run/);
  assert.match(await html(exact(original)), /Superseded revision/);
  assert.match(await html(exact(sibling)), /Sibling signed revision/);

  const native = fixture.nativeStatus(selected);
  assert.equal(native.requirements.reviews.deficit, 1);
  assert.equal(native.requirements.pipelines[0]?.name, "quality-gate");
  const checks = await html(checksUrl);
  assert.match(checks, /quality-gate/);
  assert.match(checks, /aria-current="page"[^>]*>Checks/);
  assert.match(checks, /Next actions/);
  assert.doesNotMatch(checks, /Selected signed revision/);

  const patch = await html(filesUrl + "&file=sample.txt");
  assert.match(patch, /aria-current="page"[^>]*>Files changed/);
  assert.match(patch, /Next actions/);
  assert.match(patch, /selected revision contents/);
  assert.doesNotMatch(patch, /contents after the candidate was signed/);
  const unlisted = await html(filesUrl + "&file=hidden-file-name");
  assert.match(unlisted, /outside the displayed comparison/);
  assert.doesNotMatch(unlisted, /hidden-file-name/);

  for (const id of [absentId, indexOnlyId, fixture.runId, "bad-id"]) {
    const unavailable = await html(exact(id));
    assert.match(unavailable, /Proposal unavailable/);
    assert.doesNotMatch(unavailable, /Next actions|Revision status|Private projection-only text/);
    assert.ok(!unavailable.includes(id));
  }

  function review() {
    return fetch(server.origin + `/api/projects/${projectId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId: selected, verdict: "approve", comment: submittedReview }),
      signal: t.signal,
    });
  }

  const proposalRef = "refs/hn/proposals/" + selected.slice(7);
  fixture.git("update-ref", "-d", proposalRef, head);
  try {
    const refused = await review();
    assert.equal(refused.status, 400);
    assert.equal((await refused.json()).ok, false);
    assert.doesNotMatch(await html(exact(selected)), new RegExp(submittedReview));
  } finally {
    fixture.git("update-ref", proposalRef, head);
  }
  const recorded = await review();
  assert.equal(recorded.status, 200);
  const receipt = await recorded.json();
  assert.equal(receipt.ok, true);
  assert.equal(receipt.data.proposalId, selected);
  assert.equal(fixture.nativeStatus(selected).requirements.reviews.approvals, 1);
  assert.equal(fixture.nativeStatus(sibling).requirements.reviews.approvals, 0);
  assert.match(await html(exact(selected)), new RegExp(submittedReview));
  assert.match(await html(exact(sibling)), new RegExp(`Other revisions[\\s\\S]*${submittedReview}`));

  await fixture.withoutObject(head, async () => {
    assert.match(await html(filesUrl), /exact base-to-head comparison is unavailable/);
    assert.match(await html(checksUrl), /aria-current="page"[^>]*>Checks/);
  });
  const policyBlob = fixture.git("rev-parse", base + ":.hn/policy.json");
  await fixture.withoutObject(policyBlob, async () => {
    const degraded = await html(checksUrl);
    assert.match(degraded, /evaluation for this revision is unavailable/);
    assert.match(degraded, /<button[^>]*disabled[^>]*>Review/);
    assert.ok(degraded.includes(head));
    assert.doesNotMatch(degraded, /PolicyGate|\/tmp\/workbox-proposal-web-/);
  });

  fixture.recordResultAndDecision();
  const accepted = fixture.nativeStatus(selected);
  assert.equal(accepted.decisions.accepted, true);
  assert.equal(accepted.requirements.pipelines[0]?.passes, 1);
  const completed = await html(exact(selected));
  assert.match(completed, /Run passed/);
  assert.match(completed, /Maintainer accepted the selected revision/);
  assert.match(await html(exact(sibling)), /Other revisions[\s\S]*Run passed/);
});
