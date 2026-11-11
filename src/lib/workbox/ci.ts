import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * CI surface: pipelines are canonical .hn/pipelines/<name>.json files in
 * the worktree; policy is .hn/policy.json. Run requests/execution are
 * signed-event families (projected when they occur); this module surfaces
 * the governing definitions and trust config.
 */
export interface PipelineDef {
  name: string;
  description: string;
  steps: Array<{ command: string; args?: string[]; workingDirectory?: string; env?: Record<string, string> }>;
  backend?: string;
  raw: string;
  error?: string;
}

export function listPipelines(repoPath: string): PipelineDef[] {
  const dir = join(repoPath, ".hn", "pipelines");
  if (!existsSync(dir)) return [];
  let files: string[];
  try {
    files = readdirSync(/*turbopackIgnore: true*/ dir);
  } catch {
    return [];
  }
  const out: PipelineDef[] = [];
  for (const f of files.filter((x) => x.endsWith(".json")).sort()) {
    const full = join(dir, f);
    let text = "{}";
    try {
      text = readFileSync(/*turbopackIgnore: true*/ full, "utf8");
    } catch {
      continue; // unreadable → skip, never fabricate
    }
    try {
      const parsed = JSON.parse(text) as {
        name?: string; description?: string; backend?: string;
        steps?: Array<{ command: string; args?: string[]; workingDirectory?: string; env?: Record<string, string> }>;
      };
      out.push({
        name: parsed.name ?? f.replace(/\.json$/, ""),
        description: parsed.description ?? "",
        backend: parsed.backend,
        steps: (parsed.steps ?? []).map((s) => ({
          command: s.command, args: s.args, workingDirectory: s.workingDirectory, env: s.env,
        })),
        raw: text,
      });
    } catch (e) {
      out.push({ name: f.replace(/\.json$/, ""), description: "", steps: [], raw: text, error: `unparseable: ${(e as Error).message}` });
    }
  }
  return out;
}

export interface PolicyView {
  version: string;
  maintainers: string[];
  proposals?: unknown;
  pipelines: Record<string, unknown>;
  raw: string;
  exists: boolean;
}

export function readPolicy(repoPath: string): PolicyView | null {
  const p = join(repoPath, ".hn", "policy.json");
  if (!existsSync(p)) return null;
  let text = "";
  try {
    text = readFileSync(/*turbopackIgnore: true*/ p, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as {
      version?: string; maintainers?: string[]; proposals?: unknown; pipelines?: Record<string, unknown>;
    };
    return {
      version: parsed.version ?? "unknown",
      maintainers: parsed.maintainers ?? [],
      proposals: parsed.proposals,
      pipelines: parsed.pipelines ?? {},
      raw: text,
      exists: true,
    };
  } catch {
    return {
      version: "?", maintainers: [], pipelines: {}, raw: text, exists: true,
    };
  }
}
