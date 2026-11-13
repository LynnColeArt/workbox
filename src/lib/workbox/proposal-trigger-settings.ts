import { spawnSync } from "node:child_process";
import { z } from "zod";
import { HN_BIN, runHn } from "../hn/runner";
import { readPinnedTree, readPinnedBlob, resolveCodeRevision } from "./repo";
import { isPipelineName } from "./settings-preview";

export const triggerPath = ".hn/proposal-checks.json";
export const triggerEvents = ["proposal.open", "proposal.revise"] as const;
const rules = z.object({
  version: z.literal("hn.proposal-checks/1"),
  pipelines: z.record(z.string(), z.array(z.enum(triggerEvents))),
});
export type TriggerConfiguration = z.infer<typeof rules>;
const unsupported = { ok: false, error: { code: "unsupported", message: "Upgrade Hubnot to configure automatic proposal checks." } } as const;
const invalid = { ok: false, error: { code: "invalid_input", message: "The proposed pipeline tree could not be read." } } as const;

export async function readProposalTriggers(repo: string, commit: string) {
  try {
    const discovery = await runHn(repo, ["capabilities", "--json"], 10_000, { localRead: true });
    const data = discovery.envelope.data as { capabilities?: Record<string, { version: number }> } | null;
    if (discovery.exitCode !== 0 || data?.capabilities?.["native.proposal-checks-config"]?.version !== 1) return unsupported;
    const read = await runHn(repo, ["proposal-checks", "read", commit, "--json"], 10_000, { localRead: true });
    const parsed = z.object({ source: z.literal(commit), digest: z.string().nullable(), configuration: rules }).safeParse(read.envelope.data);
    if (read.exitCode === 0 && parsed.success) return { ok: true, data: parsed.data } as const;
  } catch {
    // Native process failure is reported consistently to both callers.
  }
  return { ok: false, error: { code: "unavailable", message: "Hubnot could not read the committed trigger configuration." } } as const;
}

export function validateProposalTriggers(repo: string, base: string, configuration: unknown, change?: { name: string; definition: string }) {
  const directory = readPinnedTree(repo, base, ".hn/pipelines");
  const pipelines: Record<string, unknown> = Object.create(null);
  if (directory?.incomplete) return invalid;
  try {
    for (const entry of directory?.entries ?? []) {
      const name = entry.name.endsWith(".json") ? entry.name.slice(0, -5) : "";
      if (!isPipelineName(name) || name === change?.name) continue;
      if (entry.type !== "blob" || !/^100(644|755)$/.test(entry.mode)) return invalid;
      const blob = readPinnedBlob(repo, entry.sha, entry.size);
      if (blob.content === null) return invalid;
      pipelines[name] = JSON.parse(blob.content);
    }
    if (change) pipelines[change.name] = JSON.parse(change.definition);
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^GIT_/i.test(key)) delete env[key];
    const native = spawnSync(HN_BIN, ["proposal-checks", "validate", "-", "--json"], {
      cwd: repo, env, input: JSON.stringify({ configuration, pipelines }), encoding: "utf8", timeout: 10_000,
    });
    const envelope = JSON.parse(native.stdout ?? "");
    const output = z.object({ configuration: rules, canonical: z.string() }).safeParse(envelope.data);
    if (native.status === 0 && envelope.ok === true && output.success) return { ok: true, data: output.data } as const;
    if (envelope.error?.code === "invalid_input" && typeof envelope.error.message === "string") {
      return { ok: false, error: { code: "invalid_input", message: envelope.error.message } } as const;
    }
  } catch {
    return invalid;
  }
  return unsupported;
}

export function readTriggerSource(repo: string, commit: string) {
  const entry = readPinnedTree(repo, commit, ".hn")?.entries.find(item => item.name === "proposal-checks.json");
  if (!entry) return null;
  const blob = readPinnedBlob(repo, entry.sha, entry.size);
  return blob.content;
}

export async function readCurrentProposalTriggers(repo: string) {
  const revision = resolveCodeRevision(repo);
  return revision ? readProposalTriggers(repo, revision.commit) : unsupported;
}
