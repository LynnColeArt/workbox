import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { git } from "../hn/gitread";
import { runHn, envelopeData } from "../hn/runner";
import { projectsRoot } from "./discover";

/**
 * Project creation — the human "new repo" flow. Creates a genuine hubnot
 * repository in the projects root: git tree, instance identity (.git/hn),
 * live governance policy, and a founding signed issue (which is what makes
 * the repo discoverable: discovery keys on hn state, and the founding
 * event doubles as the first feed entry).
 *
 * Custody v1: the instance's hn identity lives in the repo it governs.
 * The compose/sign/append seam for browser-held keys replaces runHn later
 * without changing this function's contract.
 *
 * Failure contract: any failure removes everything this call created —
 * a half-built repo is never left behind.
 */

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const RESERVED = new Set(["workbox", "node_modules", "logs", "var"]);

export interface CreateProjectInput {
  /** Directory id under the projects root (also the registry id). */
  id: string;
  /** Display name for humans and the hn identity. */
  name: string;
  description: string;
}

export interface CreateProjectOk {
  ok: true;
  id: string;
  repoPath: string;
  actor: string;
  issueId: string;
}

export interface CreateProjectFail {
  ok: false;
  step: string;
  error: string;
}

const GIT_AUTHOR = ["-c", "user.name=Workbox", "-c", "user.email=workbox@localhost"];

function validateId(id: string): string | null {
  if (!SLUG_RE.test(id)) return "id must match [A-Za-z0-9][A-Za-z0-9._-]{0,63}";
  if (id.includes("..")) return "id must not contain '..'";
  if (RESERVED.has(id.toLowerCase())) return "id is reserved";
  return null;
}

function commitFile(repoPath: string, path: string, content: string, message: string): void {
  const full = join(repoPath, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  const add = git(repoPath, ["add", path]);
  if (!add.ok) throw new Error(`git add failed for ${path}: ${add.err}`);
  const commit = git(repoPath, [...GIT_AUTHOR, "commit", "-m", message]);
  if (!commit.ok) throw new Error(`git commit failed: ${commit.err}`);
}

export async function createProject(input: CreateProjectInput): Promise<CreateProjectOk | CreateProjectFail> {
  const slugError = validateId(input.id);
  if (slugError) return { ok: false, step: "validate", error: slugError };

  const dir = join(projectsRoot(), input.id);
  if (existsSync(dir)) return { ok: false, step: "validate", error: `directory already exists: ${dir}` };

  mkdirSync(dir, { recursive: true });

  try {
    const gitInit = git(dir, ["init", "-b", "main"]);
    if (!gitInit.ok) throw new CreateError("git init", gitInit.err);
    commitFile(dir, "README.md", `# ${input.name}\n\n${input.description || "Created via Workbox."}\n`, "init: repository created via Workbox");

    // Instance identity: private key under .git/hn/identities, never copied out.
    const hnInit = await runHn(dir, ["init", "--name", input.name]);
    if (hnInit.exitCode !== 0 || !hnInit.envelope.ok) {
      throw new CreateError("hn init", hnInit.stderr.trim() || JSON.stringify(hnInit.envelope.error ?? {}));
    }

    const idRes = await runHn(dir, ["identity", "show", "--json"]);
    const idData = envelopeData<{ actor: string; name: string; public_key: string }>(idRes.envelope);
    if (!idData?.actor) {
      throw new CreateError("identity show", idRes.stderr.trim() || "no actor in identity envelope");
    }
    const actor = idData.actor;

    // Governance from day one: the instance actor is maintainer and trusted runner.
    const policy = {
      version: "hn.policy/0",
      maintainers: [actor],
      proposals: {
        requiredApprovals: 1,
        requiredAccepts: 1,
        trustedReviewers: [actor],
        allowAuthorApproval: false,
      },
      pipelines: { test: { requiredResults: 1, trustedRunners: [actor] } },
    };
    commitFile(dir, ".hn/policy.json", JSON.stringify(policy, null, 2) + "\n", "governance: instance actor as maintainer and trusted runner");

    // Founding signed fact: makes the repo discoverable and seeds the feed.
    const open = await runHn(dir, [
      "issue", "open", "--json",
      "--body", `Created via the Workbox portal. Self-governed: ${actor.slice(7, 19)} is maintainer and trusted runner.`,
      "Project created by Workbox",
    ]);
    if (open.exitCode !== 0 || !open.envelope.ok) {
      throw new CreateError("founding issue", open.stderr.trim() || JSON.stringify(open.envelope.error ?? {}));
    }
    const issue = envelopeData<{ issue_id?: string; event_id?: string }>(open.envelope);
    const issueId = issue?.issue_id ?? issue?.event_id ?? "";

    return { ok: true, id: input.id, repoPath: dir, actor, issueId };
  } catch (e) {
    // Failure contract: remove everything this call created.
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    if (e instanceof CreateError) return { ok: false, step: e.step, error: e.error };
    return { ok: false, step: "unexpected", error: (e as Error).message };
  }
}

class CreateError extends Error {
  constructor(public step: string, public error: string) {
    super(`${step}: ${error}`);
  }
}

/** Cheap check for identity-only repos (existence only — never reads key content). */
export function hasIdentityState(repoPath: string): boolean {
  const dir = join(repoPath, ".git", "hn", "identities");
  try {
    return readdirSync(dir).filter((x) => !x.startsWith(".")).length > 0;
  } catch {
    return false;
  }
}
