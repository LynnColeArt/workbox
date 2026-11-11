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

export async function runHn(
  repoPath: string,
  args: string[],
  timeoutMs = SPAWN_TIMEOUT_MS,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(HN_BIN, args, {
      cwd: repoPath,
      timeout: timeoutMs,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      const trimmed = stdout.trim();
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
