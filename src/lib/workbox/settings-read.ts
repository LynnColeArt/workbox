import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { runHn } from "../hn/runner";
import { codeHref } from "./code-browser";
import { projectSummaryColumns } from "./queries";
import { readPinnedBlob, readPinnedTree, resolveCodeRevision, type CodeRevision } from "./repo";
import { isPipelineName, PIPELINE_MAX_BYTES, validatePipelineDefinition, type PipelineStep } from "./settings-preview";

const detailPatch = z.strictObject({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().max(1024).optional(),
}).refine(patch => patch.name !== undefined || patch.description !== undefined);

interface DetailsRow {
  id: string;
  name: string;
  description: string;
  repoPath: string;
  nameCurated: number;
  descriptionCurated: number;
}

function getDetails(db: DatabaseSync, id: string) {
  return db.prepare(`
    SELECT ${projectSummaryColumns},
      m.name IS NOT NULL AS nameCurated,
      COALESCE(m.description_curated, 0) AS descriptionCurated
    FROM projects p LEFT JOIN project_meta m ON m.id = p.id
    WHERE p.id = ?`).get(id) as DetailsRow | undefined;
}

function publicDetails(row: DetailsRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    curation: { name: row.nameCurated === 1, description: row.descriptionCurated === 1 },
  };
}

export function updateRepoDetails(db: DatabaseSync, id: string, input: unknown) {
  const patch = detailPatch.safeParse(input);
  if (!patch.success) {
    return { ok: false, error: { code: "invalid_input", message: "Provide a display name of 1–256 characters or a description of up to 1024 characters." } } as const;
  }
  const { name, description } = patch.data;
  const result = db.prepare(`
    INSERT INTO project_meta (id, name, description, description_curated)
      SELECT id, ?, COALESCE(?, ''), ? FROM projects WHERE id = ?
    ON CONFLICT(id) DO UPDATE SET
      name = COALESCE(excluded.name, project_meta.name),
      description = CASE WHEN excluded.description_curated = 1 THEN excluded.description ELSE project_meta.description END,
      description_curated = MAX(excluded.description_curated, project_meta.description_curated)`
  ).run(name ?? null, description ?? null, Number(description !== undefined), id);
  const row = result.changes ? getDetails(db, id) : undefined;
  return row
    ? { ok: true, data: publicDetails(row) } as const
    : { ok: false, error: { code: "not_found", message: "Project not found." } } as const;
}

type PolicyState = "ready" | "absent" | "invalid" | "unavailable";
interface PolicyContext {
  state: PolicyState;
  href: string | null;
  thresholds: Record<string, number>;
}

interface PipelineItem {
  name: string;
  path: string;
  href: string;
  definition: string | null;
  steps: PipelineStep[];
  state: "valid" | "invalid" | "unavailable";
  required: boolean | null;
  requiredResults: number | null;
}

type InventoryState = "ready" | "empty" | "incomplete" | "unavailable";
const policyActor = z.string().regex(/^[a-f0-9]{64}$/);
const policySchema = z.object({
  version: z.literal("hn.policy/0"),
  maintainers: z.array(policyActor).min(1),
  proposals: z.object({ requiredAccepts: z.number().int().positive() }),
  pipelines: z.record(z.string(), z.object({
    requiredResults: z.number().int().positive().max(64),
    trustedRunners: z.array(policyActor),
  })).nullish(),
});

async function readPinnedPolicy(repoPath: string, id: string, revision: CodeRevision, tree: ReturnType<typeof readPinnedTree>, run: typeof runHn): Promise<PolicyContext> {
  const unavailable: PolicyContext = { state: "unavailable", href: null, thresholds: {} };
  if (!tree) return unavailable;
  const entry = tree.entries.find(item => item.name === "policy.json");
  if (!entry) return tree.incomplete ? unavailable : { state: "absent", href: null, thresholds: {} };

  const href = codeHref(id, { rev: revision.branch, at: revision.commit, path: entry.path });
  if (entry.type !== "blob" || entry.mode === "120000") return { state: "invalid", href, thresholds: {} };
  const file = readPinnedBlob(repoPath, entry.sha, entry.size, PIPELINE_MAX_BYTES);
  if (file.unavailable) return { ...unavailable, href };
  let parsed: z.infer<typeof policySchema>;
  try {
    parsed = policySchema.parse(JSON.parse(file.content ?? ""));
  } catch {
    return { state: "invalid", href, thresholds: {} };
  }
  try {
    const inspected = await run(repoPath, ["policy", "show", revision.commit], 3_000, { maxOutputBytes: PIPELINE_MAX_BYTES, localRead: true });
    if (inspected.exitCode !== 0 || !inspected.envelope.ok) return { ...unavailable, href };
  } catch {
    return { ...unavailable, href };
  }
  const thresholds = Object.fromEntries(Object.entries(parsed.pipelines ?? {}).map(([name, rule]) => [name, rule.requiredResults]));
  return { state: "ready", href, thresholds };
}

async function readPipelines(repoPath: string, id: string, revision: CodeRevision | null, run: typeof runHn) {
  const items: PipelineItem[] = [];
  const result = (state: InventoryState, policy: PolicyContext = { state: "unavailable", href: null, thresholds: {} }) => ({
    state, items, policy: { state: policy.state, href: policy.href },
  });
  if (!revision) return result("unavailable");
  const root = readPinnedTree(repoPath, revision.commit, "");
  if (!root) return result("unavailable");
  const hn = root.entries.find(entry => entry.name === ".hn");
  if (!hn) {
    return root.incomplete ? result("incomplete") : result("empty", { state: "absent", href: null, thresholds: {} });
  }
  if (hn.type !== "tree") return result("incomplete");

  const tree = readPinnedTree(repoPath, revision.commit, ".hn");
  if (!tree) return result("unavailable");
  const policy = await readPinnedPolicy(repoPath, id, revision, tree, run);
  const directory = tree.entries.find(entry => entry.name === "pipelines");
  if (!directory) return result(tree.incomplete ? "incomplete" : "empty", policy);
  if (directory.type !== "tree") return result("incomplete", policy);

  const pipelines = readPinnedTree(repoPath, revision.commit, directory.path);
  if (!pipelines) return result("unavailable", policy);
  const candidates = pipelines.entries.filter(entry => entry.name.endsWith(".json"));
  const limit = 100;
  let bytesRemaining = 4 * PIPELINE_MAX_BYTES;
  for (const entry of candidates.slice(0, limit)) {
    const name = entry.name.slice(0, -5);
    const href = codeHref(id, { rev: revision.branch, at: revision.commit, path: entry.path });
    const maxBytes = Math.min(PIPELINE_MAX_BYTES, bytesRemaining);
    const file = entry.type === "blob" && entry.mode !== "120000" && maxBytes > 0
      ? readPinnedBlob(repoPath, entry.sha, entry.size, maxBytes)
      : null;
    if (file?.content != null && entry.size !== null) bytesRemaining -= entry.size;
    const validation = file?.content != null && isPipelineName(name) ? validatePipelineDefinition(file.content) : null;
    const state = file?.unavailable || maxBytes === 0 ? "unavailable" : validation?.ok ? "valid" : "invalid";
    const requiredResults = Object.hasOwn(policy.thresholds, name) ? policy.thresholds[name] : null;
    const required = policy.state === "ready" || policy.state === "absent" ? requiredResults !== null : null;
    items.push({
      name, path: entry.path, href, definition: file?.content ?? null, state, required, requiredResults,
      steps: validation?.ok ? validation.data.steps : [],
    });
  }
  const incomplete = root.incomplete || tree.incomplete || pipelines.incomplete ||
    candidates.length > limit || items.some(item => item.state === "unavailable");
  return result(incomplete ? "incomplete" : items.length ? "ready" : "empty", policy);
}

const nativeId = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const nativeState = z.object({
  schema: z.literal("hn.workflow/1"),
  name: z.string().min(1).max(64),
  title: z.string().max(1024),
  enabled: z.boolean(),
  pipeline: z.object({ version: z.literal("hn.pipeline/0") }).nullish(),
  source_documents: z.array(z.unknown()).max(8).nullish(),
});
const workflowView = z.object({
  id: nativeId,
  family: z.literal("workflow"),
  conflict: z.boolean(),
  heads: z.array(z.object({ id: nativeId })).min(1),
  state: nativeState.nullable(),
}).refine(view => view.conflict
  ? view.heads.length > 1 && view.state === null
  : view.heads.length === 1 && view.state !== null);
const workflowPage = z.object({
  items: z.array(z.unknown()).max(10),
  snapshot: nativeId,
  next_cursor: z.string().min(1).max(8192).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

interface SignedWorkflow {
  id: string;
  name: string | null;
  title: string | null;
  revision: string | null;
  heads: string[];
  status: "conflicted" | "inert-source" | "missing-native-definition" | "disabled" | "native-runnable";
}

async function readSignedWorkflows(repoPath: string, run: typeof runHn) {
  const items: SignedWorkflow[] = [];
  const result = (state: InventoryState | "unsupported") => ({ state, items });
  const ids = new Set<string>();
  let cursor: string | undefined;
  let snapshot: string | undefined;
  let incomplete = false;
  try {
    for (let i = 0; i < 10; i++) {
      const args = ["workflow", "list", "--limit", "10", "--json"];
      if (cursor) args.push("--cursor", cursor);
      const response = await run(repoPath, args, 3_000, { maxOutputBytes: 8 * PIPELINE_MAX_BYTES, localRead: true });
      if (response.exitCode !== 0 || !response.envelope.ok) {
        if (i === 0 && response.envelope.error?.code === "prose_failure" &&
            /(?:unknown|unrecognized|unsupported) (?:command|subcommand).*workflow/i.test(response.stderr)) {
          return result("unsupported");
        }
        return result(i === 0 ? "unavailable" : "incomplete");
      }
      const page = workflowPage.safeParse(response.envelope.data);
      if (!page.success || (snapshot && page.data.snapshot !== snapshot)) {
        return result(i === 0 ? "unavailable" : "incomplete");
      }
      snapshot = page.data.snapshot;
      for (const item of page.data.items) {
        const parsed = workflowView.safeParse(item);
        if (!parsed.success || ids.has(parsed.data.id)) {
          incomplete = true;
          continue;
        }
        const { id, heads, state } = parsed.data;
        ids.add(id);
        const status = state === null ? "conflicted"
          : !state.pipeline ? state.source_documents?.length ? "inert-source" : "missing-native-definition"
          : state.enabled ? "native-runnable" : "disabled";
        items.push({
          id, name: state?.name ?? null, title: state?.title ?? null,
          revision: state ? heads[0].id : null, heads: heads.map(head => head.id), status,
        });
      }
      cursor = page.data.next_cursor;
      if (!cursor) return result(incomplete ? "incomplete" : items.length ? "ready" : "empty");
    }
    return result("incomplete");
  } catch {
    return result(items.length ? "incomplete" : "unavailable");
  }
}

export async function readRepoSettings(db: DatabaseSync, id: string, run = runHn) {
  const row = getDetails(db, id);
  if (!row) return null;
  const revision = resolveCodeRevision(row.repoPath);
  const [pipelines, workflows] = await Promise.all([
    readPipelines(row.repoPath, row.id, revision, run),
    readSignedWorkflows(row.repoPath, run),
  ]);
  return {
    details: { ...publicDetails(row), branch: revision?.branch ?? null, commit: revision?.commit ?? null },
    pipelines,
    workflows,
  };
}
