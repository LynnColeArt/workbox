import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isGitObjectId } from "./repo";
import { isPipelineName } from "./settings-preview";

interface CandidateInput {
  base: string;
  path: string;
  definition: string;
  operationId: string;
}

/** Build a reproducible commit in the repository's object store using a private index. */
export function prepareSettingsCandidate(repoPath: string, input: CandidateInput): string | null {
  const { base, path, definition, operationId } = input;
  const name = /^\.hn\/pipelines\/([^/]+)\.json$/.exec(path)?.[1];
  if (!isGitObjectId(base) || !isPipelineName(name) ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(operationId)) return null;

  let scratch: string | undefined;
  try {
    scratch = mkdtempSync(join(tmpdir(), "workbox-candidate-"));
    // Do not let caller environment select another repository, object store, or index.
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^GIT_/i.test(key)) delete env[key];
    }
    Object.assign(env, {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: join(scratch, "empty-config"),
      GIT_INDEX_FILE: join(scratch, "index"),
      GIT_NO_LAZY_FETCH: "1",
      GIT_ALLOW_PROTOCOL: "",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "Workbox",
      GIT_AUTHOR_EMAIL: "workbox@localhost",
      GIT_COMMITTER_NAME: "Workbox",
      GIT_COMMITTER_EMAIL: "workbox@localhost",
      LC_ALL: "C",
    });
    function git(args: string[], stdin?: string) {
      const result = spawnSync("git", [
        "--no-replace-objects", "-c", `core.hooksPath=${scratch}`,
        "-c", "core.splitIndex=false", "-c", "core.sparseCheckout=false",
        "-c", "i18n.commitEncoding=UTF-8", "-c", "commit.gpgSign=false",
        "-C", repoPath, ...args,
      ], { env, input: stdin, encoding: "utf8", timeout: 10_000, killSignal: "SIGKILL", windowsHide: true });
      return result.status === 0 ? result.stdout.trim() : null;
    }

    if (git(["cat-file", "-t", base]) !== "commit" || git(["read-tree", base]) === null) return null;
    const entry = git(["ls-files", "--stage", "--", path]);
    if (entry === null) return null;
    const mode = entry ? /^100(644|755) /.exec(entry)?.[0].trim() : "100644";
    if (!mode || entry.includes("\n")) return null;

    const blob = git(["hash-object", "-w", "--stdin"], definition);
    if (!blob || !isGitObjectId(blob)) return null;
    if (git(["update-index", "--add", "--cacheinfo", mode, blob, path]) === null) return null;
    const tree = git(["write-tree"]);
    if (!tree || !isGitObjectId(tree)) return null;
    const timestamp = git(["show", "-s", "--format=%ct", base]);
    if (!timestamp || !/^\d+$/.test(timestamp)) return null;
    env.GIT_AUTHOR_DATE = env.GIT_COMMITTER_DATE = `@${timestamp} +0000`;
    const head = git(["commit-tree", tree, "-p", base, "--no-gpg-sign"], `Workbox pipeline proposal\n\nOperation: ${operationId}\n`);
    return head && isGitObjectId(head) ? head : null;
  } catch {
    return null;
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true, maxRetries: 2 });
  }
}
