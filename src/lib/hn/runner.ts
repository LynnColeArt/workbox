import { spawn } from "node:child_process";
import type { Envelope } from "./types";

/**
 * Adapter: spawn the real `hn` binary and consume the documented envelope
 * contract ({ok,data,error}, exit 0/1). Some commands (hn init, proposal
 * open, run execute, …) still speak prose with exit codes as the success
 * contract — the adapter accepts both, and never parses prose for identity.
 */
export const HN_BIN = process.env.WORKBOX_HN_BIN ?? "/tmp/hn";

const SPAWN_TIMEOUT_MS = 30_000;

export interface RunResult {
  envelope: Envelope;
  exitCode: number;
  stderr: string;
}

interface RunOptions {
  maxOutputBytes?: number;
  localRead?: boolean;
}

export async function runHn(
  repoPath: string,
  args: string[],
  timeoutMs = SPAWN_TIMEOUT_MS,
  { maxOutputBytes = Infinity, localRead = false }: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
    if (localRead) {
      for (const key of ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_NAMESPACE", "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_LITERAL_PATHSPECS", "GIT_GLOB_PATHSPECS", "GIT_NOGLOB_PATHSPECS",
        "GIT_ICASE_PATHSPECS", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS"]) {
        delete env[key];
      }
      Object.assign(env, { GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "", GIT_OPTIONAL_LOCKS: "0" });
    }
    const child = spawn(HN_BIN, args, {
      cwd: repoPath,
      timeout: timeoutMs,
      env,
    });
    const stdout: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let outputBytes = 0;
    let outputLimit = false;
    const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
      if (outputLimit) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        outputLimit = true;
        child.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderrChunks));
    child.on("error", reject);
    child.on("close", (code) => {
      if (outputLimit) {
        resolve({ envelope: { ok: false, data: null, error: { code: "output_limit", message: "Hubnot output exceeded the read limit." } }, exitCode: -1, stderr: "" });
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString();
      const trimmed = Buffer.concat(stdout).toString().trim();
      let envelope: Envelope;
      if (trimmed.startsWith("{")) {
        try {
          envelope = JSON.parse(trimmed) as Envelope;
        } catch {
          envelope = { ok: false, data: null, error: { code: "non_json_output", message: trimmed.slice(0, 500) } };
        }
      } else if (code === 0) {
        envelope = { ok: true, data: { prose: trimmed.slice(0, 2000) } };
      } else {
        envelope = { ok: false, data: null, error: { code: "prose_failure", message: (stderr || trimmed || "nonzero exit").slice(0, 500) } };
      }
      resolve({ envelope, exitCode: code ?? -1, stderr });
    });
  });
}

export function isOkEnvelope<T>(env: Envelope<T>): env is Envelope<T> & { ok: true; data: T } {
  return env.ok === true;
}

/** Extract `data` from an accepted envelope, typed; null when not ok. */
export function envelopeData<T>(env: Envelope): T | null {
  return env.ok ? (env.data as T) : null;
}
