import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { type TestContext } from "node:test";

const nativeBinary = resolve(process.env.WORKBOX_HN_BIN ?? "/tmp/hn");
const skip = !existsSync(nativeBinary) && "Set WORKBOX_HN_BIN to a Hubnot binary";

type Envelope<T> =
  | { ok: true; data: T; schema?: string; next_cursor?: string; snapshot?: string }
  | { ok: false; error: { code: string; message: string } };

interface IssueState {
  title: string;
  body: string;
  status: "open" | "closed";
  labels: string[];
  metadata: Record<string, string>;
}
interface IssueWrite { issue_id: string; event_id: string; replayed: boolean; head_count: number }
interface IssueRead { id: string; state: IssueState | null; conflict: boolean; head_ids: string[]; head_count: number }
interface ResourceWrite { resource_id: string; event_id: string; replayed: boolean }
interface ReplyState { body: string; discussion_id: string; reply_to?: string }
interface DiscussionRead {
  id: string;
  state: { title: string; category: string; status: string };
  reply_count: number;
  accepted_answer?: { id: string; actor: string; state: ReplyState };
}
interface ResourcePage<T> { items: T[]; snapshot: string; next_cursor?: string }

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "workbox-collaboration-native-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(directory, "no-global-config"),
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Workbox test",
    GIT_COMMITTER_NAME: "Workbox test",
    GIT_AUTHOR_EMAIL: "workbox@example.invalid",
    GIT_COMMITTER_EMAIL: "workbox@example.invalid",
  };
  function git(repo: string, args: string[], input?: string) {
    return execFileSync("git", args, { cwd: repo, env, input, encoding: "utf8", timeout: 5_000 }).trim();
  }
  function command<T>(repo: string, args: string[], input?: unknown) {
    const result = spawnSync(nativeBinary, args, {
      cwd: repo, env, input: input === undefined ? undefined : JSON.stringify(input),
      encoding: "utf8", timeout: 15_000,
    });
    assert.ifError(result.error);
    assert.ok(result.stdout.startsWith("{"), `${args.slice(0, 2).join(" ")}: ${result.stderr || result.stdout}`);
    const envelope = JSON.parse(result.stdout) as Envelope<T>;
    assert.equal(result.status === 0, envelope.ok, result.stdout);
    return envelope;
  }
  function accepted<T>(repo: string, args: string[], input?: unknown) {
    const envelope = command<T>(repo, args, input);
    assert.equal(envelope.ok, true, JSON.stringify(envelope));
    return envelope.data;
  }
  function denied(repo: string, args: string[], code: string, input?: unknown) {
    const before = git(repo, ["show-ref"]);
    const envelope = command(repo, args, input);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, code, envelope.error.message);
    assert.equal(git(repo, ["show-ref"]), before, "denied action must not change repository refs");
  }
  function repo(name: string, source?: string) {
    const path = join(directory, name);
    if (source) {
      git(directory, ["clone", "--quiet", "--no-local", source, path]);
      git(path, ["fetch", "--quiet", source, "+refs/hn/actors/*:refs/hn/actors/*"]);
    } else {
      mkdirSync(path);
      git(path, ["init", "--quiet", "-b", "main"]);
      git(path, ["commit", "--allow-empty", "-qm", "Initialize fixture"]);
    }
    execFileSync(nativeBinary, ["init", "--name", name], { cwd: path, env, encoding: "utf8", timeout: 5_000 });
    const { actor } = accepted<{ actor: string }>(path, ["identity", "show", "--json"]);
    assert.match(actor, /^[a-f0-9]{64}$/);
    return { path, actor };
  }
  function addLegacyIssue(path: string) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const key = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
    const actor = createHash("sha256").update(key).digest("hex");
    const payload = JSON.stringify({
      protocol: "hn/0", kind: "issue.open", actor, actorName: "Legacy author",
      publicKey: key.toString("base64").replace(/=+$/, ""), sequence: 1, timestamp: "2020-01-01T00:00:00Z",
      title: "Legacy issue", body: "Old **Markdown**",
    });
    const signature = sign(null, Buffer.from(payload), privateKey).toString("base64").replace(/=+$/, "");
    const event = git(path, ["hash-object", "-w", "--stdin"], payload);
    const sig = git(path, ["hash-object", "-w", "--stdin"], signature);
    const tree = git(path, ["mktree"], `100644 blob ${event}\tevent.json\n100644 blob ${sig}\tsignature\n`);
    const commit = git(path, ["commit-tree", tree, "-m", "Legacy signed fixture"]);
    git(path, ["update-ref", `refs/hn/actors/${actor}`, commit]);
    return "sha256:" + createHash("sha256").update(payload).digest("hex");
  }
  return { git, command, accepted, denied, repo, addLegacyIssue };
}

test("native issue reads legacy signed history and recovers signed writes after a lost response", { skip }, (t) => {
  const { git, command, accepted, denied, repo, addLegacyIssue } = fixture(t);
  const { path, actor } = repo("owner");
  const legacy = addLegacyIssue(path);
  const listed = command<{ items: Array<{ id: string; state: IssueState }> }>(path, ["issue", "list", "--details", "--json"]);
  assert.equal(listed.ok, true);
  assert.equal(listed.schema, "hn.issue/1");
  assert.equal(listed.data.items.find((issue) => issue.id === legacy)?.state.body, "Old **Markdown**");

  const markdown = "  **Exact**\n\n- item\n";
  const openArgs = ["issue", "open", "--actor", actor, "--operation", "open", "--input", "-", "--json"];
  const original = { title: "Issue", body: markdown, status: "open", labels: ["bug"], metadata: { "fixture/source": "preserve" } };
  const opened = accepted<IssueWrite>(path, openArgs, original);
  assert.equal(opened.issue_id, opened.event_id);
  const writeRef = git(path, ["show-ref"]);
  const observed = accepted<{ issue_id: string; event_id: string }>(path, ["issue", "operation", "--actor", actor, "--operation", "open", "--json"]);
  assert.equal(observed.issue_id, opened.issue_id);
  assert.equal(observed.event_id, opened.event_id);
  assert.deepEqual(accepted<IssueWrite>(path, openArgs, original), { ...opened, replayed: true });
  assert.equal(git(path, ["show-ref"]), writeRef);
  denied(path, openArgs, "operation_conflict", { ...original, title: "Different request" });

  const shown = accepted<IssueRead>(path, ["issue", "show", opened.issue_id, "--json"]);
  assert.equal(shown.state?.body, markdown);
  const revised = accepted<IssueWrite>(path, ["issue", "revise", opened.issue_id, "--expect", opened.event_id, "--input", "-", "--json"], {
    ...shown.state, labels: ["fixed"],
  });
  const current = accepted<IssueRead>(path, ["issue", "show", opened.issue_id, "--json"]);
  assert.deepEqual(current.state?.labels, ["fixed"]);
  assert.deepEqual(current.state?.metadata, original.metadata);
  denied(path, ["issue", "close", opened.issue_id, "--expect", opened.event_id, "--json"], "stale_revision");
  denied(path, ["issue", "close", opened.issue_id, "--expect", revised.event_id, "--actor", "0".repeat(64), "--json"], "actor_mismatch");

  const commentArgs = ["issue", "comment", opened.issue_id, "--actor", actor, "--operation", "comment", "--body", markdown, "--json"];
  const comment = accepted<IssueWrite>(path, commentArgs);
  assert.equal(accepted<IssueWrite>(path, commentArgs).event_id, comment.event_id);
  const history = accepted<{ total: number; items: Array<{ id: string; body: string }> }>(path, ["issue", "history", opened.issue_id, "--kind", "comments", "--json"]);
  assert.equal(history.total, 1);
  assert.equal(history.items[0].id, comment.event_id);
  assert.equal(history.items[0].body, markdown);

  const page = command<{ items: unknown[] }>(path, ["issue", "list", "--limit", "1", "--json"]);
  assert.equal(page.ok, true);
  assert.equal(page.data.items.length, 1);
  assert.ok(page.next_cursor && page.snapshot);
});

test("native issue detects and resolves competing signed revisions transferred between repositories", { skip }, (t) => {
  const { git, command, accepted, denied, repo } = fixture(t);
  const owner = repo("owner");
  const root = accepted<IssueWrite>(owner.path, ["issue", "open", "--json", "Competing edits"]);
  const peer = repo("peer", owner.path);
  const initial = accepted<IssueRead>(peer.path, ["issue", "show", root.issue_id, "--json"]);
  assert.equal(initial.id, root.issue_id);
  const revise = (path: string, title: string) => accepted<IssueWrite>(path, [
    "issue", "revise", root.issue_id, "--expect", root.event_id, "--input", "-", "--json",
  ], { ...initial.state, title });
  const local = revise(owner.path, "Local edit");
  const remote = revise(peer.path, "Peer edit");
  git(owner.path, ["fetch", "--quiet", peer.path, `refs/hn/actors/${peer.actor}:refs/hn/actors/${peer.actor}`]);

  const conflicted = command<IssueRead>(owner.path, ["issue", "show", root.issue_id, "--limit", "1", "--json"]);
  assert.equal(conflicted.ok, true);
  assert.equal(conflicted.data.conflict, true);
  assert.equal(conflicted.data.head_count, 2);
  assert.equal(conflicted.data.state, null);
  assert.ok(conflicted.next_cursor);
  denied(owner.path, ["issue", "close", root.issue_id, "--expect", local.event_id, "--json"], "issue_conflict");
  const resolved = accepted<IssueWrite>(owner.path, [
    "issue", "resolve", root.issue_id, "--expect", local.event_id, "--expect", remote.event_id,
    "--input", "-", "--operation", "resolve", "--json",
  ], { ...initial.state, title: "Reviewed resolution" });
  const shown = accepted<IssueRead>(owner.path, ["issue", "show", root.issue_id, "--json"]);
  assert.equal(shown.conflict, false);
  assert.deepEqual(shown.head_ids, [resolved.event_id]);
  assert.equal(shown.state?.title, "Reviewed resolution");
});

test("native discussion keeps replies, exact accepted answers, and operation lookup distinct", { skip }, (t) => {
  const { accepted, denied, repo } = fixture(t);
  const { path, actor } = repo("owner");
  const opened = accepted<ResourceWrite>(path, [
    "discussion", "open", "--title", "Question", "--category", "help", "--body", "Original post", "--json",
  ]);
  const thread = opened.resource_id;
  const answerArgs = ["discussion", "reply", "add", thread, "--body", "Original answer", "--actor", actor, "--operation", "reply", "--json"];
  const answer = accepted<ResourceWrite>(path, answerArgs);
  assert.equal(accepted<ResourceWrite>(path, answerArgs).replayed, true);
  assert.equal(accepted<ResourceWrite>(path, ["discussion-reply", "operation", "--actor", actor, "--operation", "reply", "--json"]).event_id, answer.event_id);
  const nested = accepted<ResourceWrite>(path, ["discussion", "reply", "add", thread, "--reply-to", answer.resource_id, "--body", "Nested reply", "--json"]);
  const marked = accepted<ResourceWrite>(path, [
    "discussion", "answer", thread, "--expect", opened.event_id, "--reply", answer.event_id, "--json",
  ]);
  const edited = accepted<ResourceWrite>(path, [
    "discussion", "reply", "edit", answer.resource_id, "--expect", answer.event_id, "--body", "Edited answer", "--json",
  ]);
  assert.equal(edited.resource_id, answer.resource_id);
  assert.notEqual(edited.event_id, answer.event_id);
  const shown = accepted<DiscussionRead>(path, ["discussion", "show", thread, "--json"]);
  assert.equal(shown.id, thread);
  assert.equal(shown.reply_count, 2);
  assert.equal(shown.accepted_answer?.id, answer.event_id);
  assert.equal(shown.accepted_answer?.actor, actor);
  assert.equal(shown.accepted_answer?.state.body, "Original answer");
  denied(path, ["discussion", "close", thread, "--expect", opened.event_id, "--json"], "stale_revision");

  const first = accepted<ResourcePage<{ id: string; state: ReplyState }>>(path, ["discussion", "replies", thread, "--limit", "1", "--json"]);
  assert.ok(first.next_cursor && first.snapshot);
  const second = accepted<typeof first>(path, ["discussion", "replies", thread, "--limit", "1", "--cursor", first.next_cursor, "--json"]);
  assert.deepEqual(new Set([...first.items, ...second.items].map(({ id }) => id)), new Set([answer.resource_id, nested.resource_id]));
  assert.equal([...first.items, ...second.items].find(({ id }) => id === nested.resource_id)?.state.reply_to, answer.resource_id);
  accepted<ResourceWrite>(path, ["discussion", "answer", thread, "--expect", marked.event_id, "--clear", "--json"]);
  assert.equal(accepted<DiscussionRead>(path, ["discussion", "show", thread, "--json"]).accepted_answer, undefined);
});
