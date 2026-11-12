import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { readPinnedBlob, readPinnedTree, resolveCodeRevision } from "./repo";

export const PIPELINE_MAX_BYTES = 1024 * 1024;

export interface PipelineStep {
  name: string;
  command: string;
  args?: string[];
  workingDirectory?: string;
  timeoutSeconds?: number;
}

export interface PipelineDefinition {
  version: "hn.pipeline/0";
  steps: PipelineStep[];
}

export interface PipelineDiagnostic {
  path: string;
  message: string;
}

interface PipelinePreview {
  projectId: string;
  name: string;
  path: string;
  base: { branch: string; commit: string };
  before: string | null;
  definition: string;
  digest: string;
  checks: { format: "passed"; native: "unavailable" };
}

export type PipelinePreviewResult =
  | { ok: true; data: PipelinePreview }
  | {
    ok: false;
    error: {
      code: "not_found" | "invalid_input" | "unavailable" | "unchanged";
      message: string;
      diagnostics?: PipelineDiagnostic[];
    };
  };

type PipelineValidation =
  | { ok: true; data: PipelineDefinition }
  | { ok: false; diagnostics: PipelineDiagnostic[] };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function checkoutRelative(value: string) {
  const path = posix.normalize(value.replaceAll("\\", "/"));
  return !value.includes("\0") && !win32.isAbsolute(value) && !/^[a-z]:/i.test(value)
    && path !== ".." && !path.startsWith("../");
}

function validateStep(value: unknown, index: number, diagnostics: PipelineDiagnostic[]) {
  const path = `steps[${index}]`;
  if (!record(value)) {
    diagnostics.push({ path, message: "Use an object for this step." });
    return;
  }

  const add = (field: string, message: string) => diagnostics.push({ path: `${path}.${field}`, message });
  const { name, command, args, workingDirectory, timeoutSeconds } = value;
  const fields = ["name", "command", "args", "workingDirectory", "timeoutSeconds"];
  if (Object.keys(value).some((key) => !fields.includes(key))) {
    diagnostics.push({ path, message: "Remove fields outside the native pipeline step format." });
  }
  if (!nonempty(name)) add("name", "Enter a step name.");
  if (!nonempty(command) || !checkoutRelative(command)) {
    add("command", "Enter an executable name or a path inside the checkout.");
  }
  if (args !== undefined) {
    if (!Array.isArray(args) || args.length > 256) {
      add("args", "Use an array of at most 256 arguments.");
    } else {
      for (const [argIndex, arg] of args.entries()) {
        if (typeof arg !== "string" || arg.includes("\0") || Buffer.byteLength(arg) > 16 * 1024) {
          add(`args[${argIndex}]`, "Use a string of at most 16 KiB without a null character.");
        }
      }
    }
  }
  if (workingDirectory !== undefined && (typeof workingDirectory !== "string" || !checkoutRelative(workingDirectory))) {
    add("workingDirectory", "Use a directory inside the checkout.");
  }
  if (timeoutSeconds !== undefined && (typeof timeoutSeconds !== "number" || !Number.isInteger(timeoutSeconds)
    || timeoutSeconds < 0 || timeoutSeconds > 3600)) {
    add("timeoutSeconds", "Use a whole number of seconds from 0 to 3600.");
  }
}

/** Local format checks for the committed hn.pipeline/0 contract. */
export function validatePipelineDefinition(definition: string): PipelineValidation {
  if (Buffer.byteLength(definition) > PIPELINE_MAX_BYTES) {
    return { ok: false, diagnostics: [{ path: "definition", message: "Use a definition of at most 1 MiB." }] };
  }
  if (/[\uD800-\uDFFF]/u.test(definition)) {
    return { ok: false, diagnostics: [{ path: "definition", message: "Use well-formed Unicode text." }] };
  }

  let parsed: unknown;
  try {
    // Go decodes timeoutSeconds into an integer and rejects fractional or exponent syntax.
    parsed = JSON.parse(definition, (key, value: unknown, context?: { source?: string }) => {
      if (key === "timeoutSeconds" && typeof value === "number" && context?.source
        && !/^-?\d+$/.test(context.source)) return Number.NaN;
      return value;
    });
  } catch {
    return { ok: false, diagnostics: [{ path: "definition", message: "Use one valid JSON object." }] };
  }
  if (!record(parsed)) return { ok: false, diagnostics: [{ path: "definition", message: "Use one JSON object." }] };

  const diagnostics: PipelineDiagnostic[] = [];
  if (Object.keys(parsed).some((key) => key !== "version" && key !== "steps")) {
    diagnostics.push({ path: "definition", message: "Use only version and steps at the top level." });
  }
  if (parsed.version !== "hn.pipeline/0") diagnostics.push({ path: "version", message: "Use hn.pipeline/0." });
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0 || parsed.steps.length > 64) {
    diagnostics.push({ path: "steps", message: "Include 1 to 64 steps." });
  } else {
    for (const [index, step] of parsed.steps.entries()) validateStep(step, index, diagnostics);
  }
  return diagnostics.length ? { ok: false, diagnostics } : { ok: true, data: parsed as unknown as PipelineDefinition };
}

function previewError(
  code: Extract<PipelinePreviewResult, { ok: false }>["error"]["code"],
  message: string,
  diagnostics?: PipelineDiagnostic[],
): PipelinePreviewResult {
  return { ok: false, error: { code, message, ...(diagnostics && { diagnostics }) } };
}

/** Returns null for a confirmed absent path and undefined when exact text is unavailable. */
function readPipelineBefore(repoPath: string, commit: string, filename: string): string | null | undefined {
  let directory = "";
  for (const name of [".hn", "pipelines", filename]) {
    const tree = readPinnedTree(repoPath, commit, directory);
    if (!tree || tree.incomplete) return undefined;
    const entry = tree.entries.find((entry) => entry.name === name);
    if (!entry) return null;
    if (name === filename) {
      if (entry.type !== "blob" || !/^100[67]/.test(entry.mode)) return undefined;
      return readPinnedBlob(repoPath, entry.sha, entry.size, PIPELINE_MAX_BYTES).content ?? undefined;
    }
    if (entry.type !== "tree") return undefined;
    directory = entry.path;
  }
  return undefined;
}

export function isPipelineName(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value) && value !== "." && value !== "..";
}

export function previewPipeline(db: DatabaseSync, projectId: string, input: unknown): PipelinePreviewResult {
  if (!record(input) || !isPipelineName(input.name)) {
    return previewError("invalid_input", "Enter a valid pipeline name.", [
      { path: "name", message: "Use 1 to 64 letters, digits, periods, underscores or hyphens. Names cannot be . or .." },
    ]);
  }
  if (typeof input.definition !== "string") {
    return previewError("invalid_input", "Enter a pipeline definition.", [{ path: "definition", message: "Use JSON text." }]);
  }
  const { name, definition } = input;
  const validation = validatePipelineDefinition(definition);
  if (!validation.ok) return previewError("invalid_input", "The pipeline definition needs changes.", validation.diagnostics);

  const project = db.prepare("SELECT repo_path AS repoPath FROM projects WHERE id = ?").get(projectId) as { repoPath: string } | undefined;
  if (!project) return previewError("not_found", "The repository was not found.");
  const revision = resolveCodeRevision(project.repoPath);
  if (!revision?.branch) return previewError("unavailable", "The repository default branch is unavailable.");

  const filename = `${name}.json`;
  const path = `.hn/pipelines/${filename}`;
  const before = readPipelineBefore(project.repoPath, revision.commit, filename);
  if (before === undefined) return previewError("unavailable", "The exact committed pipeline text is unavailable.");
  if (before === definition) return previewError("unchanged", "The draft matches the committed pipeline.");

  const base = { branch: revision.branch, commit: revision.commit };
  const digest = createHash("sha256")
    .update(JSON.stringify(["workbox.pipeline-preview/1", projectId, path, base.branch, base.commit, before, definition]))
    .digest("hex");
  return {
    ok: true,
    data: { projectId, name, path, base, before, definition, digest, checks: { format: "passed", native: "unavailable" } },
  };
}
