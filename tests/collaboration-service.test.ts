import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { HN_BIN } from "../src/lib/hn/runner";
import { canSignCollaborationRequest, collaborationSigner, signCollaboration } from "../src/lib/workbox/collaboration";
import { openDb } from "../src/lib/workbox/db";

test("browser signing requires a local JSON request and rejects foreign origins", () => {
  const request = (origin: string, site: string) => new Request("http://localhost:4123", {
    method: "POST", headers: { host: "localhost:4123", origin, "sec-fetch-site": site, "content-type": "application/json" },
  });
  assert.equal(canSignCollaborationRequest(request("http://localhost:4123", "same-origin")), true);
  assert.equal(canSignCollaborationRequest(request("https://example.invalid", "cross-site")), false);
  assert.equal(canSignCollaborationRequest(request("http://localhost:8000", "same-origin")), false);
});

test("shared signing rejects actor substitution and recovers from indexing failure without another event",
  { skip: !existsSync(HN_BIN) && "Hubnot binary unavailable" }, async t => {
    const dir = mkdtempSync(join(tmpdir(), "workbox-collaboration-service-"));
    const previous = process.env.WORKBOX_DB_PATH;
    t.after(() => {
      if (previous === undefined) delete process.env.WORKBOX_DB_PATH;
      else process.env.WORKBOX_DB_PATH = previous;
      rmSync(dir, { recursive: true, force: true });
    });
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    execFileSync(HN_BIN, ["init", "--name", "Collaboration fixture"], { cwd: dir });
    const project = { id: "fixture", name: "Fixture", description: "", repoPath: dir };
    const signer = await collaborationSigner(project);
    assert.ok(signer.available);
    const command = {
      family: "issue" as const, args: ["open"], state: { title: "Replay", body: " **Markdown**\n" },
      actor: signer.identity.actor, operationId: "fixture-replay",
    };
    const denied = await signCollaboration(project, { ...command, actor: "0".repeat(64) });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.error.code, "actor_mismatch");
    assert.equal(execFileSync("git", ["for-each-ref", "refs/hn/actors/"], { cwd: dir, encoding: "utf8" }), "");

    process.env.WORKBOX_DB_PATH = dir;
    const signed = await signCollaboration(project, command);
    assert.ok(signed.ok);
    assert.equal(signed.data.indexed, false);

    process.env.WORKBOX_DB_PATH = join(dir, "index.sqlite");
    using db = openDb();
    db.prepare("INSERT INTO projects (id, name, repo_path) VALUES (?, ?, ?)").run(project.id, project.name, dir);
    const recovered = await signCollaboration(project, command);
    assert.ok(recovered.ok);
    assert.deepEqual(recovered.data, { ...signed.data, replayed: true, indexed: true });
    assert.equal(db.prepare("SELECT count(*) AS count FROM events WHERE project_id = ?").get(project.id)?.count, 1);
    const conflict = await signCollaboration(project, { ...command, state: { title: "Different request" } });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.error.code, "operation_conflict");
  });
