import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { runHn } from "../hn/runner";
import { openDb } from "./db";
import { getProject } from "./queries";

const sessionId = z.uuid();
const fields = z.string().min(1).max(2048);
const inputSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("catalog") }),
  z.strictObject({ action: z.literal("sessions") }),
  z.strictObject({ action: z.literal("plan"), source: fields, repository: fields,
    endpoint: fields.optional(), version: fields.optional(), credentialMode: fields.optional(),
    kinds: z.array(z.string().regex(/^[a-z_]+$/)).max(50).default([]),
    decisions: z.array(z.string().regex(/^[\w./:-]+=\w+$/)).max(100).default([]) }),
  z.strictObject({ action: z.literal("inspect"), session: sessionId }),
  z.strictObject({ action: z.enum(["apply", "resume"]), session: sessionId, confirmation: z.string().regex(/^[a-f0-9]{64}$/) }),
]);
const catalogSchema = z.object({
  schema: z.literal("hn.migration-catalog/1"),
  providers: z.array(z.string()),
  sources: z.array(z.string()),
  destinations: z.array(z.string()),
});
const inspectionSchema = z.object({
  schema: z.literal("hn.migration-inspect/1"),
  plan: z.object({
    snapshot_digest: z.string(), destination: z.object({ kind: z.string(), repository: z.string() }),
    intents: z.array(z.object({ id: z.string(), kind: z.string(), action: z.string() })),
    findings: z.array(z.object({ id: z.string(), status: z.string(), message: z.string() })),
  }).passthrough(),
  progress: z.record(z.string(), z.number().int().nonnegative()).optional(),
  snapshot: z.object({ source: z.object({ kind: z.string() }), records: z.array(z.unknown()) }),
});

const failure = (code: string, message: string) => ({ ok: false, error: { code, message } } as const);
const unavailable = () => failure("unavailable", "Hubnot could not complete this migration operation. Inspect the saved session before retrying.");
const success = <T>(data: T) => ({ ok: true, data } as const);

export async function runMigrationOperation(project: string, args: unknown) {
  const parsed = inputSchema.safeParse(args);
  if (!parsed.success) return failure("invalid_input", "Review the migration inputs.");
  using db = openDb();
  const selected = getProject(db, project);
  if (!selected) return failure("not_found", "Project unavailable.");
  const input = parsed.data;
  const root = resolve(process.env.WORKBOX_MIGRATIONS_PATH ?? ".workbox/migrations",
    createHash("sha256").update(JSON.stringify([project, selected.repoPath])).digest("hex"));
  const native = (argv: string[], localRead: boolean) => runHn(selected.repoPath, ["migrate", ...argv],
    localRead ? 30_000 : 120_000, { localRead, maxOutputBytes: 24 * 1024 * 1024 });
  const readCatalog = async () => {
    const result = await native(["catalog"], true);
    return result.exitCode === 0 ? catalogSchema.safeParse(result.envelope) : null;
  };
  const inspect = async (session: string) => {
    const result = await native(["inspect", "--session", join(root, session)], true);
    const read = inspectionSchema.safeParse(result.envelope);
    if (result.exitCode !== 0 || !read.success) return null;
    const { plan, snapshot } = read.data;
    if (plan.destination.kind !== "local" || plan.destination.repository !== resolve(selected.repoPath)) return null;
    return {
      session, source: snapshot.source.kind, records: snapshot.records.length, destination: project,
      intents: plan.intents, findings: plan.findings, progress: read.data.progress,
      confirmation: createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
    };
  };

  try {
    if (input.action === "sessions") {
      const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      return success({ sessions: entries.filter(entry => entry.isDirectory() && sessionId.safeParse(entry.name).success)
        .map(entry => entry.name).sort() });
    }
    if (input.action === "inspect") {
      const details = await inspect(input.session);
      return details ? success(details) : unavailable();
    }
    const catalog = await readCatalog();
    if (!catalog?.success) return unavailable();
    if (input.action === "catalog") return success(catalog.data);
    if (input.action === "plan") {
      if (!catalog.data.sources.includes(input.source)) return failure("unsupported", "This migration source is unavailable.");
      const session = randomUUID();
      await mkdir(root, { recursive: true, mode: 0o700 });
      const argv = ["plan", "--session", join(root, session), "--source-kind", input.source,
        "--source-repository", input.repository, "--destination-kind", "local",
        "--destination-repository", selected.repoPath];
      for (const [flag, value] of [["--source-endpoint", input.endpoint], ["--source-api-version", input.version],
        ["--source-credential-mode", input.credentialMode]] as const) {
        if (value !== undefined) argv.push(flag, value);
      }
      for (const kind of input.kinds) argv.push("--kind", kind);
      for (const decision of input.decisions) argv.push("--decision", decision);
      const result = await native(argv, false);
      if (result.exitCode !== 0) return unavailable();
      const details = await inspect(session);
      return details ? success(details) : unavailable();
    }
    const details = await inspect(input.session);
    if (!details) return unavailable();
    if (!catalog.data.sources.includes(details.source)) return failure("unsupported", "The saved source provider is unavailable.");
    if (details.confirmation !== input.confirmation) return failure("stale_plan", "Inspect the saved plan again before confirming.");
    const result = await native([input.action, "--session", join(root, input.session), "--confirm-apply"], false);
    return result.exitCode === 0 ? success({ session: input.session, state: "applied" }) : unavailable();
  } catch {
    return unavailable();
  }
}
