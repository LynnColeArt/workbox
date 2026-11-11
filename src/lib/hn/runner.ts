import { spawn } from "node:child_process";
import type { Envelope } from "./types";

/**
 * Adapter: spawn the real `hn` binary and consume the documented envelope
 * contract ({ok,data,error}, exit 0/1). Never parse human prose except as
 * an explicit last resort. The binary is resolved once from env with a
 * default that can be overridden per deployment.
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
  // `hn` operates on the working directory; pin it per call so concurrent
  // calls against different registered repos cannot cross artifacts.
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
      try {
        envelope = trimmed ? (JSON.parse(trimmed) as Envelope) : { ok: code === 0, data: null };
      } catch {
        envelope = {
          ok: false,
          data: null,
          error: { code: "non_json_output", message: trimmed.slice(0, 500) || stderr.slice(0, 500) },
        };
      }
      resolve({ envelope, exitCode: code ?? -1, stderr });
    });
  });
}

export function isOkEnvelope<T>(env: Envelope<T>): env is Envelope<T> & { ok: true; data: T } {
  return env.ok === true;
}
