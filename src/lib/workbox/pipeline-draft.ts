import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { expandPipelineTemplate, readPipelineTemplates } from "./pipeline-templates";
import { isGitObjectId, isReachableCodeCommit, readPinnedBlob, readPinnedTree, resolveCodeRevision } from "./repo";
import { isPipelineName, PIPELINE_MAX_BYTES, validatePipelineDefinition, type PipelineDiagnostic, type PipelineStep } from "./settings-preview";

const textSchema = z.string().refine(text => Buffer.byteLength(text) <= PIPELINE_MAX_BYTES);
const nameSchema = z.string().refine(isPipelineName);
const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const nodeIdSchema = z.string().regex(/^step-[a-f0-9]{24}$/);
const baseSchema = z.object({
  branch: z.string().min(1).max(1024),
  commit: z.string().refine(isGitObjectId),
});
const stateSchema = z.object({
  projectId: z.string(),
  name: nameSchema,
  base: baseSchema,
  before: textSchema.nullable(),
  definition: textSchema,
  lastValid: textSchema.nullable(),
  editor: z.enum(["json", "graph"]),
  nodeIds: z.array(nodeIdSchema).max(64).refine(ids => new Set(ids).size === ids.length),
});
const snapshotSchema = stateSchema.extend({ revision: revisionSchema });
const nativeStepSchema = z.strictObject({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).max(256).optional(),
  workingDirectory: z.string().optional(),
  timeoutSeconds: z.number().optional(),
});
const nativeDefinitionSchema = z.strictObject({
  version: z.literal("hn.pipeline/0"),
  steps: z.array(nativeStepSchema).max(64),
});
const patchSchema = z.strictObject({
  name: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).max(256).nullable().optional(),
  workingDirectory: z.string().nullable().optional(),
  timeoutSeconds: z.number().nullable().optional(),
});
const editSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("replace_json"), definition: textSchema }),
  z.strictObject({ kind: z.literal("restore") }),
  z.strictObject({ kind: z.literal("add") }),
  z.strictObject({ kind: z.literal("expand_template"), templateId: z.string(), inputs: z.record(z.string(), z.unknown()).optional() }),
  z.strictObject({ kind: z.literal("patch"), nodeId: nodeIdSchema, patch: patchSchema }),
  z.strictObject({ kind: z.literal("duplicate"), nodeId: nodeIdSchema }),
  z.strictObject({ kind: z.literal("remove"), nodeId: nodeIdSchema }),
  z.strictObject({ kind: z.literal("reorder"), nodeId: nodeIdSchema, index: z.number().int().nonnegative().max(63) }),
]);
const expectedSnapshotSchema = z.object({ draft: snapshotSchema, expectedRevision: revisionSchema });

type DraftState = z.infer<typeof stateSchema>;
export type PipelineDraftEdit = z.infer<typeof editSchema>;
export type PipelineDraftDiagnostic = PipelineDiagnostic & { nodeId?: string };
export interface PipelineDraft extends DraftState {
  path: string;
  revision: string;
  projection: "valid" | "incomplete" | "stale";
  nodes: { id: string; step: PipelineStep }[];
  edges: { from: string; to: string }[];
  diagnostics: PipelineDraftDiagnostic[];
}

type DraftErrorCode = "invalid_input" | "not_found" | "unavailable" | "stale_revision";
export type PipelineDraftResult = { ok: true; data: PipelineDraft } | {
  ok: false;
  error: { code: DraftErrorCode; message: string; diagnostics?: PipelineDraftDiagnostic[] };
};

function failure(code: DraftErrorCode, message: string, diagnostics?: PipelineDraftDiagnostic[]): PipelineDraftResult {
  return { ok: false, error: { code, message, ...(diagnostics && { diagnostics }) } };
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function draftRevision(state: DraftState) {
  const { projectId, name, base, before, definition, lastValid, editor, nodeIds } = state;
  return hash(["workbox.pipeline-draft/1", projectId, name, base.branch, base.commit, before, definition, lastValid, editor, nodeIds]);
}

function nodeId(seed: string, index: number) {
  return "step-" + hash([seed, index]).slice(0, 24);
}

function initialNodeIds(definition: string, count: number) {
  const seed = hash(["workbox.pipeline-nodes/1", definition]);
  return Array.from({ length: count }, (_, index) => nodeId(seed, index));
}

// JSON.parse already established the grammar. Scan string tokens and delimiters
// to find duplicate decoded keys before projection can discard either value.
function hasDuplicateKey(definition: string) {
  const objects: (Set<string> | null)[] = [];
  for (let index = 0; index < definition.length; index++) {
    const char = definition[index];
    if (char === "{") objects.push(new Set());
    else if (char === "[") objects.push(null);
    else if (char === "}" || char === "]") objects.pop();
    else if (char === '"') {
      const start = index++;
      for (; definition[index] !== '"'; index++) {
        if (definition[index] === "\\") index++;
      }
      const keys = objects[objects.length - 1];
      if (!keys || !/^\s*:/.test(definition.slice(index + 1))) continue;
      const key = JSON.parse(definition.slice(start, index + 1)) as string;
      if (keys.has(key)) return true;
      keys.add(key);
    }
  }
  return false;
}

function projectDefinition(definition: string, editor: DraftState["editor"]) {
  const validated = validatePipelineDefinition(definition);
  const diagnostics = validated.ok ? [] : validated.diagnostics;
  if (validated.ok) {
    if (hasDuplicateKey(definition)) {
      return { steps: null, valid: false, diagnostics: [{ path: "definition", message: "Remove duplicate JSON keys before editing the graph." }] };
    }
    return { steps: validated.data.steps, valid: true, diagnostics };
  }
  if (editor === "graph") {
    try {
      const shape = nativeDefinitionSchema.safeParse(JSON.parse(definition));
      if (shape.success && serialize(shape.data.steps) === definition) {
        return { steps: shape.data.steps, valid: false, diagnostics };
      }
    } catch {
      // The validator already recorded a diagnostic for this text.
    }
  }
  return { steps: null, valid: false, diagnostics };
}

function makeDraft(state: DraftState): PipelineDraft {
  const projected = projectDefinition(state.definition, state.editor);
  const projection = projected.valid ? "valid" : projected.steps ? "incomplete" : "stale";
  const last = projected.valid || state.lastValid === null ? null : projectDefinition(state.lastValid, "json");
  const steps = projected.steps ?? last?.steps ?? [];
  const nodeIds = state.nodeIds.length === steps.length ? state.nodeIds : initialNodeIds(projected.steps ? state.definition : state.lastValid ?? "", steps.length);
  const nodes = steps.map((step, index) => ({ id: nodeIds[index], step }));
  const edges = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id }));
  const diagnostics = projected.diagnostics.map(diagnostic => {
    const index = /^steps\[(\d+)\]/.exec(diagnostic.path)?.[1];
    const node = projected.steps && index !== undefined ? nodes[Number(index)] : undefined;
    return node ? { ...diagnostic, nodeId: node.id } : diagnostic;
  });
  const normalized = {
    ...state,
    nodeIds,
    lastValid: projected.valid ? state.definition : last?.valid ? state.lastValid : null,
  };
  return {
    ...normalized,
    path: `.hn/pipelines/${state.name}.json`,
    revision: draftRevision(normalized),
    projection,
    nodes,
    edges,
    diagnostics,
  };
}

function getProjectPath(db: DatabaseSync, projectId: string) {
  const project = db.prepare("SELECT repo_path AS repoPath FROM projects WHERE id = ?").get(projectId) as { repoPath: string } | undefined;
  return project?.repoPath;
}

/** Null means the pinned path is absent. Undefined means the exact text is unavailable. */
function readCommittedPipeline(repoPath: string, commit: string, name: string) {
  const parts = [".hn", "pipelines", `${name}.json`];
  let directory = "";
  for (const [index, part] of parts.entries()) {
    const tree = readPinnedTree(repoPath, commit, directory);
    if (!tree) return undefined;
    const entry = tree.entries.find(candidate => candidate.name === part);
    if (!entry) return tree.incomplete ? undefined : null;
    if (index === parts.length - 1) {
      if (entry.type !== "blob" || !/^100(?:644|755)$/.test(entry.mode)) return undefined;
      return readPinnedBlob(repoPath, entry.sha, entry.size, PIPELINE_MAX_BYTES).content ?? undefined;
    }
    if (entry.type !== "tree") return undefined;
    directory = entry.path;
  }
  return undefined;
}

function serialize(steps: PipelineStep[]) {
  return JSON.stringify({ version: "hn.pipeline/0", steps }, null, 2) + "\n";
}

function openBase(repoPath: string, name: string) {
  const resolved = resolveCodeRevision(repoPath);
  if (!resolved?.branch) return null;
  const base = { branch: resolved.branch, commit: resolved.commit };
  const before = readCommittedPipeline(repoPath, base.commit, name);
  return before === undefined ? null : { base, before };
}

export function openPipelineDraft(db: DatabaseSync, projectId: string, input: unknown): PipelineDraftResult {
  const request = z.object({ name: nameSchema }).safeParse(input);
  if (!request.success) return failure("invalid_input", "Enter a valid pipeline name.");
  const repoPath = getProjectPath(db, projectId);
  if (!repoPath) return failure("not_found", "The repository was not found.");
  const { name } = request.data;
  const pinned = openBase(repoPath, name);
  if (!pinned) return failure("unavailable", "The exact committed pipeline baseline is unavailable.");
  return {
    ok: true,
    data: makeDraft({
      projectId, name, ...pinned,
      definition: pinned.before ?? serialize([]),
      lastValid: null,
      editor: pinned.before === null ? "graph" : "json",
      nodeIds: [],
    }),
  };
}

function validatedSnapshot(projectId: string, input: unknown) {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success || parsed.data.projectId !== projectId) return null;
  const draft = makeDraft(parsed.data);
  return draft.revision === parsed.data.revision ? draft : null;
}

/** Derive the graph again and authorize the baseline against reachable repository history. */
export function readPipelineDraft(db: DatabaseSync, projectId: string, input: unknown): PipelineDraftResult {
  const draft = validatedSnapshot(projectId, input);
  if (!draft) return failure("invalid_input", "The pipeline draft snapshot is invalid.");
  const repoPath = getProjectPath(db, projectId);
  if (!repoPath) return failure("not_found", "The repository was not found.");
  const tip = resolveCodeRevision(repoPath, draft.base.branch);
  if (!tip || !isReachableCodeCommit(repoPath, draft.base.commit, tip.commit)) {
    return failure("unavailable", "The pinned pipeline baseline is unavailable. Refresh the draft base.");
  }
  const before = readCommittedPipeline(repoPath, draft.base.commit, draft.name);
  if (before === undefined) return failure("unavailable", "The exact committed pipeline baseline is unavailable.");
  if (before !== draft.before) return failure("invalid_input", "The supplied pipeline baseline does not match the pinned file.");
  return { ok: true, data: draft };
}

export function refreshPipelineDraft(db: DatabaseSync, projectId: string, input: unknown): PipelineDraftResult {
  const request = expectedSnapshotSchema.safeParse(input);
  if (!request.success) return failure("invalid_input", "Enter a valid draft and expected revision.");
  const { draft: snapshot, expectedRevision } = request.data;
  if (snapshot.revision !== expectedRevision) return failure("stale_revision", "The draft revision changed. Retry against the current draft.");
  const draft = validatedSnapshot(projectId, snapshot);
  if (!draft) return failure("invalid_input", "The pipeline draft snapshot is invalid.");
  const repoPath = getProjectPath(db, projectId);
  if (!repoPath) return failure("not_found", "The repository was not found.");
  const pinned = openBase(repoPath, draft.name);
  if (!pinned) return failure("unavailable", "The exact committed pipeline baseline is unavailable.");
  return { ok: true, data: makeDraft({ ...draft, ...pinned }) };
}

function applyPatch(step: PipelineStep, patch: z.infer<typeof patchSchema>): PipelineStep {
  const next = { ...step };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.command !== undefined) next.command = patch.command;
  if (patch.args === null) delete next.args;
  else if (patch.args !== undefined) next.args = patch.args;
  if (patch.workingDirectory === null) delete next.workingDirectory;
  else if (patch.workingDirectory !== undefined) next.workingDirectory = patch.workingDirectory;
  if (patch.timeoutSeconds === null) delete next.timeoutSeconds;
  else if (patch.timeoutSeconds !== undefined) next.timeoutSeconds = patch.timeoutSeconds;
  return nativeStepSchema.parse(next);
}

function editGraph(draft: PipelineDraft, edit: Exclude<PipelineDraftEdit, { kind: "replace_json" | "restore" }>, repoPath: string): PipelineDraftResult {
  if (draft.projection === "stale") {
    return failure("invalid_input", "Resolve or restore the JSON draft before editing the graph.", draft.diagnostics);
  }
  const nodes = [...draft.nodes];
  const newId = nodeId(draft.revision, nodes.length);
  if (edit.kind === "add" || edit.kind === "expand_template") {
    if (nodes.length === 64) return failure("invalid_input", "A pipeline can contain at most 64 steps.");
    let step: PipelineStep = { name: "", command: "" };
    if (edit.kind === "expand_template") {
      const catalog = readPipelineTemplates(repoPath, draft.projectId, draft.base);
      const expanded = expandPipelineTemplate(catalog, edit.templateId, edit.inputs ?? {});
      if (!expanded.ok) return failure("invalid_input", "The template could not be expanded.", expanded.diagnostics);
      step = expanded.data;
    }
    nodes.push({ id: newId, step });
  } else {
    const index = nodes.findIndex(node => node.id === edit.nodeId);
    if (index < 0) return failure("invalid_input", "The selected step does not exist in this draft.");
    const node = nodes[index];
    switch (edit.kind) {
      case "patch":
        nodes[index] = { ...node, step: applyPatch(node.step, edit.patch) };
        break;
      case "duplicate":
        if (nodes.length === 64) return failure("invalid_input", "A pipeline can contain at most 64 steps.");
        nodes.splice(index + 1, 0, { id: newId, step: node.step });
        break;
      case "remove":
        nodes.splice(index, 1);
        break;
      case "reorder":
        if (edit.index >= nodes.length) return failure("invalid_input", "The destination is outside the draft step list.");
        if (edit.index === index) return { ok: true, data: draft };
        nodes.splice(index, 1);
        nodes.splice(edit.index, 0, node);
        break;
    }
  }
  const definition = serialize(nodes.map(node => nativeStepSchema.parse(node.step)));
  if (!textSchema.safeParse(definition).success) return failure("invalid_input", "Use a definition of at most 1 MiB.");
  return {
    ok: true,
    data: makeDraft({ ...draft, definition, editor: "graph", nodeIds: nodes.map(node => node.id) }),
  };
}

export function editPipelineDraft(db: DatabaseSync, projectId: string, input: unknown): PipelineDraftResult {
  const request = expectedSnapshotSchema.extend({ edit: editSchema }).safeParse(input);
  if (!request.success) return failure("invalid_input", "Enter a valid draft, expected revision, and edit.");
  const { draft: snapshot, expectedRevision, edit } = request.data;
  if (snapshot.revision !== expectedRevision) return failure("stale_revision", "The draft revision changed. Retry against the current draft.");
  const current = readPipelineDraft(db, projectId, snapshot);
  if (!current.ok) return current;
  const draft = current.data;
  if (edit.kind === "replace_json") {
    if (edit.definition === draft.definition) return current;
    const nodeIds = draft.projection === "valid" ? draft.nodeIds : [];
    return { ok: true, data: makeDraft({ ...draft, definition: edit.definition, editor: "json", nodeIds }) };
  }
  if (edit.kind === "restore") {
    if (draft.lastValid === null) return failure("invalid_input", "There is no valid draft to restore.");
    if (draft.lastValid === draft.definition) return current;
    return { ok: true, data: makeDraft({ ...draft, definition: draft.lastValid, editor: "json", nodeIds: [] }) };
  }
  const repoPath = getProjectPath(db, projectId);
  if (!repoPath) return failure("not_found", "The repository was not found.");
  return editGraph(draft, edit, repoPath);
}
