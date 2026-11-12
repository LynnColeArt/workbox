import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { git } from "../hn/gitread";
import { envelopeData, runHn } from "../hn/runner";
import { openDb } from "./db";
import { projectCreationStatePath, projectsRoot } from "./discover";
import { fullIndex } from "./index";
import { readChain } from "./read";

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const EVENT_ID = /^sha256:[0-9a-f]{64}$/;
const ACTOR_ID = /^[0-9a-f]{64}$/;
const GIT_REDIRECT_ENV = ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE"];
const RESERVED = new Set(["workbox", "node_modules", "logs", "var"]);
const GIT_AUTHOR = ["-c", "user.name=Workbox", "-c", "user.email=workbox@localhost"];
const FOUNDING_TITLE = "Project created by Workbox";
const GO_STARTER_STEPS = [
  { id: "go-test", name: "Go test", action: "test", description: "Run Go tests for the selected packages." },
  { id: "go-build", name: "Go build", action: "build", description: "Compile the selected Go packages." },
];
const GO_PACKAGE_PATTERN = "./...";
const GO_STEP_TIMEOUT = 300;

function starterWorkflowFiles() {
  const pipeline = {
    version: "hn.pipeline/0",
    steps: GO_STARTER_STEPS.map(({ name, action }) => ({
      name, command: "go", args: [action, GO_PACKAGE_PATTERN], timeoutSeconds: GO_STEP_TIMEOUT,
    })),
  };
  const catalog = {
    schema: "workbox.pipeline-templates/1",
    templates: GO_STARTER_STEPS.map(({ id, name, action, description }) => ({
      id, label: name, description,
      inputs: [
        { key: "packages", label: "Package pattern", type: "string", default: GO_PACKAGE_PATTERN },
        { key: "timeout", label: "Step timeout (seconds)", type: "integer", default: GO_STEP_TIMEOUT },
      ],
      step: {
        name, command: "go", args: [action, { input: "packages" }], timeoutSeconds: { input: "timeout" },
      },
    })),
  };
  return {
    ".hn/pipelines/test.json": JSON.stringify(pipeline, null, 2) + "\n",
    ".hn/pipeline-templates.json": JSON.stringify(catalog, null, 2) + "\n",
  };
}

export interface CreateProjectInput {
  id: string;
  name?: string;
  description?: string;
}

interface NormalizedInput {
  id: string;
  name: string;
  description: string;
}

type CreateErrorCode = "invalid_input" | "conflict" | "initialization_failed" | "indexing_failed" | "recovery_required";

export type CreateProjectResult =
  | { ok: true; data: { id: string; url: string; foundingIssue: { number: number; url: string } } }
  | { ok: false; error: { code: CreateErrorCode; message: string; recovery?: "retry_indexing" | "inspect" } };

type CreationFailure = Extract<CreateProjectResult, { ok: false }>;
type DirectoryIdentity = { device: string; inode: string };
type AttemptState = DirectoryIdentity & {
  version: 1;
  inputHash: string;
} & ({ phase: "initializing" } | { phase: "indexing"; issueId: string; actor: string });

function failure(code: CreateErrorCode, message: string, recovery?: "retry_indexing" | "inspect"): CreationFailure {
  return { ok: false, error: { code, message, ...(recovery ? { recovery } : {}) } };
}

function recoveryRequired() {
  return failure("recovery_required", "Project creation needs inspection. Check the project directory and Workbox creation state before retrying.", "inspect");
}

function conflict() {
  return failure("conflict", "A project with this ID already exists or is being created. Choose a different ID.");
}

function normalize(input: unknown): NormalizedInput | CreationFailure {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return failure("invalid_input", "Enter a project ID and optional name and description.");
  }
  const { id, name, description } = input as Record<string, unknown>;
  if (typeof id !== "string" || (name !== undefined && typeof name !== "string")
    || (description !== undefined && typeof description !== "string")) {
    return failure("invalid_input", "Project ID, name and description must be text.");
  }
  const slug = id.trim();
  if (!SLUG_RE.test(slug) || slug.includes("..") || RESERVED.has(slug.toLowerCase())) {
    return failure("invalid_input", "Use an available ID of up to 64 letters, digits, dots, underscores or hyphens. Start with a letter or digit and avoid consecutive dots.");
  }
  const displayName = name?.trim() || slug;
  const summary = description?.trim() || "";
  if (displayName.includes("\0") || summary.includes("\0")) {
    return failure("invalid_input", "Project name and description cannot contain null characters.");
  }
  return { id: slug, name: displayName, description: summary };
}

function entry(path: string) {
  try {
    return lstatSync(/*turbopackIgnore: true*/ path, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function directoryIdentity(path: string): DirectoryIdentity | null {
  const stat = entry(path);
  return stat?.isDirectory() && stat.ino !== BigInt(0)
    ? { device: String(stat.dev), inode: String(stat.ino) }
    : null;
}

function ownsDirectory(path: string, owner: DirectoryIdentity) {
  const current = directoryIdentity(path);
  return current?.device === owner.device && current.inode === owner.inode;
}

function readPrivateJson(path: string): unknown {
  const stat = entry(path);
  if (!stat?.isFile() || stat.size > BigInt(4096)) throw new Error("Creation state unavailable");
  return JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8"));
}

function readState(path: string): AttemptState {
  const state = readPrivateJson(path) as Partial<AttemptState> | null;
  if (!state || state.version !== 1 || typeof state.device !== "string" || typeof state.inode !== "string"
    || typeof state.inputHash !== "string" || !/^[0-9a-f]{64}$/.test(state.inputHash)) {
    throw new Error("Invalid creation state");
  }
  if (state.phase === "initializing") return state as AttemptState;
  if (state.phase === "indexing" && typeof state.issueId === "string" && EVENT_ID.test(state.issueId)
    && typeof state.actor === "string" && ACTOR_ID.test(state.actor)) return state as AttemptState;
  throw new Error("Invalid creation phase");
}

function writeState(path: string, state: AttemptState) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(/*turbopackIgnore: true*/ temp, JSON.stringify(state), { flag: "wx", mode: 0o600 });
  try {
    renameSync(/*turbopackIgnore: true*/ temp, path);
  } finally {
    rmSync(/*turbopackIgnore: true*/ temp, { force: true });
  }
}

function activeClaim(path: string) {
  try {
    const value = readPrivateJson(path) as { pid?: number } | null;
    const pid = value?.pid;
    if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "EPERM";
    }
  } catch {
    const stat = entry(path);
    // Another process may be writing its record just after opening the claim.
    return stat?.isFile() === true && Date.now() - Number(stat.mtimeMs) < 5000;
  }
}

function commitFiles(repoPath: string, files: Record<string, string>, message: string) {
  for (const [path, content] of Object.entries(files)) {
    const file = join(repoPath, path);
    mkdirSync(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
    writeFileSync(/*turbopackIgnore: true*/ file, content, { flag: "wx" });
  }
  if (!git(repoPath, ["add", "--", ...Object.keys(files)]).ok || !git(repoPath, [...GIT_AUTHOR, "commit", "-m", message]).ok) {
    throw new Error("Git bootstrap commit failed");
  }
}

function verifiedFoundingIssue(dir: string, actor: string, issueId: string) {
  const { events, walkErrors } = readChain(dir, `refs/hn/actors/${actor}`, () => false);
  return walkErrors.length === 0
    && events.some((event) => event.eventId === issueId && event.kind === "issue.open" && event.verified);
}

async function bootstrap(dir: string, input: NormalizedInput, owner: DirectoryIdentity) {
  function assertOwnership() {
    if (!ownsDirectory(dir, owner)) throw new Error("Project directory changed");
  }
  assertOwnership();
  if (!git(dir, ["init", "-b", "main"]).ok) throw new Error("Git initialization failed");
  commitFiles(dir, { "README.md": `# ${input.name}\n\n${input.description || "Created via Workbox."}\n` }, "init: repository created via Workbox");

  const initialized = await runHn(dir, ["init", "--name", input.name]);
  assertOwnership();
  if (initialized.exitCode !== 0 || !initialized.envelope.ok) throw new Error("Hubnot initialization failed");

  const identity = await runHn(dir, ["identity", "show", "--json"]);
  assertOwnership();
  const actor = envelopeData<{ actor?: unknown }>(identity.envelope)?.actor;
  if (identity.exitCode !== 0 || typeof actor !== "string" || !/^(?:sha256:)?[0-9a-f]{64}$/.test(actor)) {
    throw new Error("Hubnot identity unavailable");
  }

  const policy = {
    version: "hn.policy/0",
    maintainers: [actor],
    proposals: { requiredApprovals: 1, requiredAccepts: 1, trustedReviewers: [actor], allowAuthorApproval: false },
    pipelines: { test: { requiredResults: 1, trustedRunners: [actor] } },
  };
  commitFiles(dir, {
    ".hn/policy.json": JSON.stringify(policy, null, 2) + "\n",
    ...starterWorkflowFiles(),
  }, "governance: configure policy and starter workflow");

  const opened = await runHn(dir, [
    "issue", "open", "--json", "--body",
    `Created via the Workbox portal. Self-governed: ${actor.replace(/^sha256:/, "").slice(0, 12)} is maintainer and trusted runner.`,
    FOUNDING_TITLE,
  ]);
  assertOwnership();
  const issue = envelopeData<{ issue_id?: unknown; event_id?: unknown }>(opened.envelope);
  const issueId = issue?.issue_id ?? issue?.event_id;
  if (opened.exitCode !== 0 || typeof issueId !== "string" || !EVENT_ID.test(issueId)) {
    throw new Error("Founding issue unavailable");
  }
  const fingerprint = actor.replace(/^sha256:/, "");
  if (!verifiedFoundingIssue(dir, fingerprint, issueId)) throw new Error("Founding issue could not be verified");
  return { issueId, actor: fingerprint };
}

function removeFailedAttempt(dir: string, statePath: string, owner: DirectoryIdentity) {
  if (!ownsDirectory(dir, owner)) return false;
  const quarantine = join(dirname(statePath), `removed-${randomUUID()}`);
  renameSync(/*turbopackIgnore: true*/ dir, quarantine);
  // Check the directory that actually moved before recursively removing it.
  if (!ownsDirectory(quarantine, owner)) return false;
  rmSync(/*turbopackIgnore: true*/ quarantine, { recursive: true });
  if (entry(statePath)) unlinkSync(/*turbopackIgnore: true*/ statePath);
  return true;
}

function indexedProjectPath(id: string) {
  try {
    using db = openDb();
    return db.prepare("SELECT repo_path FROM projects WHERE id = ?").get(id);
  } catch {
    // A temporarily unavailable index can be recovered after repository creation.
    return undefined;
  }
}

function indexedFoundingIssue(db: ReturnType<typeof openDb>, projectId: string, issueId: string) {
  return db.prepare(`
    SELECT i.number FROM issues i JOIN events e
      ON e.project_id = i.project_id AND e.event_id = i.issue_id
    WHERE i.project_id = ? AND i.issue_id = ? AND e.kind = 'issue.open' AND e.verified = 1
  `).get(projectId, issueId) as { number: number } | undefined;
}

function finishIndexing(dir: string, statePath: string, state: Extract<AttemptState, { phase: "indexing" }>, input: NormalizedInput): CreateProjectResult {
  if (!ownsDirectory(dir, state) || !entry(join(dir, ".git"))?.isDirectory()) return recoveryRequired();
  let number: number;
  try {
    using db = openDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      const existing = db.prepare("SELECT repo_path FROM projects WHERE id = ?").get(input.id) as { repo_path: string } | undefined;
      if (existing) {
        let registered: string | undefined;
        try { registered = realpathSync(/*turbopackIgnore: true*/ existing.repo_path); } catch { /* missing or inaccessible */ }
        if (registered !== dir || !indexedFoundingIssue(db, input.id, state.issueId)) {
          db.exec("ROLLBACK");
          return failure("recovery_required", "The existing project index entry could not be matched to this signed repository. Resolve the registration before retrying.", "inspect");
        }
      }
      const [outcome] = fullIndex(db, [{ ...input, repoPath: dir }]);
      const issue = indexedFoundingIssue(db, input.id, state.issueId);
      if (!issue || !Number.isSafeInteger(issue.number) || issue.number < 1 || outcome.errors.length || !ownsDirectory(dir, state)) {
        throw new Error("Verified founding issue missing from index");
      }
      number = issue.number;
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch {
    return failure("indexing_failed", "The signed project was created, but indexing did not finish. Restore access to the Workbox index and submit the same project details to retry indexing.", "retry_indexing");
  }

  unlinkSync(/*turbopackIgnore: true*/ statePath);
  const url = `/p/${encodeURIComponent(input.id)}`;
  return { ok: true, data: { id: input.id, url, foundingIssue: { number, url: `${url}/issue/${encodeURIComponent(state.issueId)}` } } };
}

/** The browser and MCP use the same local project creation and recovery operation. */
export async function createProject(input: unknown): Promise<CreateProjectResult> {
  const normalized = normalize(input);
  if ("ok" in normalized) return normalized;
  if (GIT_REDIRECT_ENV.some((key) => process.env[key])) {
    return failure("initialization_failed", "Workbox cannot initialize a project with Git repository overrides. Clear those overrides and try again.");
  }

  try {
    const configuredRoot = projectsRoot();
    mkdirSync(/*turbopackIgnore: true*/ configuredRoot, { recursive: true });
    const root = realpathSync(/*turbopackIgnore: true*/ configuredRoot);
    const dir = join(root, normalized.id);
    const statePath = projectCreationStatePath(dir);
    const stateRoot = dirname(statePath);
    try {
      mkdirSync(/*turbopackIgnore: true*/ stateRoot, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (!entry(stateRoot)?.isDirectory()) return recoveryRequired();

    const lock = `${statePath}.lock`;
    const claim = randomUUID();
    try {
      writeFileSync(/*turbopackIgnore: true*/ lock, JSON.stringify({ pid: process.pid, claim }), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return activeClaim(lock) ? conflict() : recoveryRequired();
    }

    try {
      const inputHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
      if (entry(statePath)) {
        const saved = readState(statePath);
        if (saved.phase !== "indexing") return recoveryRequired();
        if (saved.inputHash !== inputHash) return conflict();
        if (!ownsDirectory(dir, saved) || !entry(join(dir, ".git"))?.isDirectory()
          || !verifiedFoundingIssue(dir, saved.actor, saved.issueId)) return recoveryRequired();
        return finishIndexing(dir, statePath, saved, normalized);
      }
      if (entry(dir) || indexedProjectPath(normalized.id)) return conflict();
      try {
        mkdirSync(/*turbopackIgnore: true*/ dir, { mode: 0o755 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return conflict();
        return failure("initialization_failed", "Workbox could not create the project directory. Check access to the projects folder and try again.");
      }
      const owner = directoryIdentity(dir);
      if (!owner) return recoveryRequired();
      let founding: Awaited<ReturnType<typeof bootstrap>>;
      try {
        writeState(statePath, { ...owner, version: 1, phase: "initializing", inputHash });
        founding = await bootstrap(dir, normalized, owner);
      } catch {
        if (!removeFailedAttempt(dir, statePath, owner)) return recoveryRequired();
        return failure("initialization_failed", "Workbox could not initialize the project. The failed attempt was removed. Check Git and Hubnot and try again.");
      }
      const ready = { ...owner, version: 1 as const, phase: "indexing" as const, inputHash, ...founding };
      writeState(statePath, ready);
      return finishIndexing(dir, statePath, ready, normalized);
    } finally {
      const current = readPrivateJson(lock) as { claim?: string } | null;
      if (current?.claim === claim) unlinkSync(/*turbopackIgnore: true*/ lock);
    }
  } catch {
    return recoveryRequired();
  }
}
