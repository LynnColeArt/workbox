import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { runHn } from "./runner";

export const eventId = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const actorId = z.string().regex(/^[a-f0-9]{64}$/);
export const operationId = z.string().regex(/^[!-~]{1,128}$/);

export type CollaborationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export function collaborationError(code: string, message: string) {
  return { ok: false, error: { code, message } } as const;
}

export async function nativeCollaboration<T>(
  repo: string, args: string[], schema: z.ZodType<T>, input?: unknown,
): Promise<CollaborationResult<{ value: T; cursor: string | null; snapshot: string | null }>> {
  let directory: string | undefined;
  try {
    const flags = [...args];
    if (input !== undefined) {
      directory = await mkdtemp(join(tmpdir(), "workbox-collaboration-"));
      const path = join(directory, "state.json");
      await writeFile(/*turbopackIgnore: true*/ path, JSON.stringify(input), { mode: 0o600, flag: "wx" });
      flags.push("--input", path);
    }
    const result = await runHn(repo, [...flags, "--json"], 30_000, { maxOutputBytes: 8 * 1024 * 1024, localRead: true });
    const { envelope } = result;
    if (result.exitCode !== 0 || !envelope.ok) {
      const code = envelope.error?.code ?? "native_unavailable";
      if (["prose_failure", "non_json_output", "native_unavailable", "resource_error"].includes(code)) {
        return collaborationError("native_unavailable", "Hubnot could not confirm this operation.");
      }
      return collaborationError(code, envelope.error?.message ?? "Hubnot refused this operation.");
    }
    const parsed = schema.safeParse(envelope.data);
    if (!parsed.success) return collaborationError("native_unavailable", "Hubnot returned an unsupported response.");
    const cursor = (envelope as { next_cursor?: unknown }).next_cursor;
    return {
      ok: true,
      data: {
        value: parsed.data,
        cursor: typeof cursor === "string" ? cursor : null,
        snapshot: typeof envelope.snapshot === "string" ? envelope.snapshot : null,
      },
    };
  } catch {
    return collaborationError("native_unavailable", "Hubnot could not confirm this operation.");
  } finally {
    if (directory) await rm(/*turbopackIgnore: true*/ directory, { recursive: true, force: true }).catch(() => {});
  }
}
