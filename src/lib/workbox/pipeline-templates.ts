import { z } from "zod";
import { codeHref } from "./code-browser";
import { isGitObjectId, readPinnedBlob, readPinnedTree } from "./repo";
import { validatePipelineDefinition, type PipelineDiagnostic, type PipelineStep } from "./settings-preview";

const CATALOG_PATH = ".hn/pipeline-templates.json";
const CATALOG_MAX_BYTES = 256 * 1024;

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/);
const label = z.string().trim().min(1).max(120);
const stringValue = z.string().max(16 * 1024);
const integerValue = z.number().int();
const input = z.discriminatedUnion("type", [
  z.strictObject({ key: identifier, label, type: z.literal("string"), default: stringValue.optional() }),
  z.strictObject({ key: identifier, label, type: z.literal("integer"), default: integerValue.optional() }),
]);
const reference = z.strictObject({ input: identifier });
const stringExpression = z.union([stringValue, reference]);
const integerExpression = z.union([integerValue, reference]);
const step = z.strictObject({
  name: stringExpression,
  command: stringExpression,
  args: z.array(stringExpression).max(256).optional(),
  workingDirectory: stringExpression.optional(),
  timeoutSeconds: integerExpression.optional(),
});
const template = z.strictObject({
  id: identifier,
  label,
  description: z.string().max(1024).optional(),
  inputs: z.array(input).max(16),
  step,
});
const catalog = z.strictObject({
  schema: z.literal("workbox.pipeline-templates/1"),
  templates: z.array(z.unknown()).max(64),
});

export type PipelineTemplate = z.infer<typeof template>;

export interface PipelineTemplateCatalog {
  state: "ready" | "partial" | "absent" | "empty" | "invalid" | "unavailable";
  path: string;
  base: { branch: string; commit: string };
  href: string | null;
  templates: PipelineTemplate[];
  diagnostics: PipelineDiagnostic[];
}

type Expansion =
  | { ok: true; data: PipelineStep }
  | { ok: false; diagnostics: PipelineDiagnostic[] };

function schemaDiagnostics(error: z.ZodError, path: string): PipelineDiagnostic[] {
  return error.issues.map(issue => ({
    path: issue.path.reduce<string>((prefix, part) => typeof part === "number" ? `${prefix}[${part}]` : `${prefix}.${String(part)}`, path),
    message: issue.message,
  }));
}

function templateDiagnostics(value: PipelineTemplate, path: string): PipelineDiagnostic[] {
  const diagnostics: PipelineDiagnostic[] = [];
  const declared = new Map(value.inputs.map(field => [field.key, field.type]));
  const labels = new Set(value.inputs.map(field => field.label));
  if (declared.size !== value.inputs.length || labels.size !== value.inputs.length) {
    diagnostics.push({ path: `${path}.inputs`, message: "Input keys and labels must be unique." });
  }
  function check(expression: string | number | { input: string } | undefined, type: "string" | "integer", field: string) {
    if (expression && typeof expression === "object" && declared.get(expression.input) !== type) {
      diagnostics.push({ path: `${path}.step.${field}`, message: `Reference a declared ${type} input.` });
    }
  }
  check(value.step.name, "string", "name");
  check(value.step.command, "string", "command");
  check(value.step.workingDirectory, "string", "workingDirectory");
  check(value.step.timeoutSeconds, "integer", "timeoutSeconds");
  value.step.args?.forEach((argument, index) => check(argument, "string", `args[${index}]`));
  return diagnostics;
}

function parseCatalog(text: string): Pick<PipelineTemplateCatalog, "state" | "templates" | "diagnostics"> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return { state: "invalid", templates: [], diagnostics: [{ path: "catalog", message: "Use one valid JSON object for the template catalog." }] };
  }

  const parsed = catalog.safeParse(decoded);
  if (!parsed.success) return { state: "invalid", templates: [], diagnostics: schemaDiagnostics(parsed.error, "catalog") };
  if (!parsed.data.templates.length) return { state: "empty", templates: [], diagnostics: [] };

  const identifiers = new Map<string, number>();
  for (const candidate of parsed.data.templates) {
    if (candidate && typeof candidate === "object" && "id" in candidate && typeof candidate.id === "string") {
      identifiers.set(candidate.id, (identifiers.get(candidate.id) ?? 0) + 1);
    }
  }
  const templates: PipelineTemplate[] = [];
  const diagnostics: PipelineDiagnostic[] = [];
  for (const [index, candidate] of parsed.data.templates.entries()) {
    const path = `catalog.templates[${index}]`;
    const entry = template.safeParse(candidate);
    if (!entry.success) {
      diagnostics.push(...schemaDiagnostics(entry.error, path));
      continue;
    }
    if ((identifiers.get(entry.data.id) ?? 0) > 1) {
      diagnostics.push({ path: `${path}.id`, message: "Template IDs must be unique." });
      continue;
    }
    const issues = templateDiagnostics(entry.data, path);
    if (issues.length) diagnostics.push(...issues);
    else templates.push(entry.data);
  }

  const state = diagnostics.length ? templates.length ? "partial" : "invalid" : "ready";
  return { state, templates, diagnostics };
}

export function readPipelineTemplates(
  repoPath: string,
  projectId: string,
  base: PipelineTemplateCatalog["base"],
): PipelineTemplateCatalog {
  const common = { path: CATALOG_PATH, base };
  const result = (state: PipelineTemplateCatalog["state"], message?: string, href: string | null = null): PipelineTemplateCatalog => ({
    ...common, state, href, templates: [], diagnostics: message ? [{ path: "catalog", message }] : [],
  });
  const unavailable = "The pinned template catalog could not be read.";
  if (!isGitObjectId(base.commit)) return result("unavailable", unavailable);

  const root = readPinnedTree(repoPath, base.commit, "");
  if (!root) return result("unavailable", unavailable);
  const directory = root.entries.find(entry => entry.name === ".hn");
  if (!directory) return root.incomplete ? result("unavailable", unavailable) : result("absent");
  if (directory.type !== "tree") return result("invalid", "Use a tracked .hn directory for the catalog.");
  const tree = readPinnedTree(repoPath, base.commit, directory.path);
  if (!tree) return result("unavailable", unavailable);
  const entry = tree.entries.find(item => item.path === CATALOG_PATH);
  if (!entry) return tree.incomplete ? result("unavailable", unavailable) : result("absent");

  const href = codeHref(projectId, { rev: base.branch, at: base.commit, path: CATALOG_PATH });
  if (entry.type !== "blob" || !/^100(?:644|755)$/.test(entry.mode)) {
    return result("invalid", "Use a regular tracked file for the template catalog.", href);
  }
  if (entry.size !== null && entry.size > CATALOG_MAX_BYTES) {
    return result("invalid", "Use a template catalog of at most 256 KiB.", href);
  }
  const blob = readPinnedBlob(repoPath, entry.sha, entry.size, CATALOG_MAX_BYTES);
  if (blob.unavailable) return result("unavailable", unavailable, href);
  if (blob.content === null) return result("invalid", "Use a UTF-8 JSON file for the template catalog.", href);
  return { ...common, href, ...parseCatalog(blob.content) };
}

export function expandPipelineTemplate(
  catalog: PipelineTemplateCatalog,
  templateId: string,
  inputs: unknown,
): Expansion {
  const selected = catalog.templates.find(entry => entry.id === templateId);
  if (!selected) return { ok: false, diagnostics: [{ path: "templateId", message: "Choose an available repository template." }] };
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return { ok: false, diagnostics: [{ path: "inputs", message: "Provide an object containing the template inputs." }] };
  }

  const diagnostics: PipelineDiagnostic[] = [];
  const values = new Map<string, string | number>();
  const declared = new Map(selected.inputs.map(field => [field.key, field]));
  for (const field of selected.inputs) {
    if (field.default !== undefined) values.set(field.key, field.default);
  }
  for (const [key, value] of Object.entries(inputs)) {
    const field = declared.get(key);
    const path = `inputs.${key}`;
    if (!field) diagnostics.push({ path, message: "This input is not declared by the template." });
    else if (field.type === "string" && typeof value === "string" && stringValue.safeParse(value).success) values.set(key, value);
    else if (field.type === "integer" && typeof value === "number" && integerValue.safeParse(value).success) values.set(key, value);
    else diagnostics.push({ path, message: `Use a valid ${field.type} value for this input.` });
  }
  if (diagnostics.length) return { ok: false, diagnostics };

  const missing = new Set<string>();
  function resolve(expression: string | number | { input: string } | undefined) {
    if (!expression || typeof expression !== "object") return expression;
    const value = values.get(expression.input);
    if (value === undefined) missing.add(expression.input);
    return value;
  }
  const step = {
    name: resolve(selected.step.name),
    command: resolve(selected.step.command),
    args: selected.step.args?.map(resolve),
    workingDirectory: resolve(selected.step.workingDirectory),
    timeoutSeconds: resolve(selected.step.timeoutSeconds),
  };
  if (missing.size) {
    return { ok: false, diagnostics: Array.from(missing, key => ({ path: `inputs.${key}`, message: "Provide a value for this input." })) };
  }
  const validated = validatePipelineDefinition(JSON.stringify({ version: "hn.pipeline/0", steps: [step] }));
  return validated.ok
    ? { ok: true, data: validated.data.steps[0] }
    : { ok: false, diagnostics: validated.diagnostics.map(issue => ({ ...issue, path: issue.path.replace(/^steps\[0\]/, "step") })) };
}
