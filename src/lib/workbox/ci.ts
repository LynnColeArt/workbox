import { readPinnedBlob, readPinnedTree, resolveCodeRevision } from "./repo";

export interface PipelineDef {
  name: string;
  description: string;
  steps: Array<{ command: string; args?: string[]; workingDirectory?: string; env?: Record<string, string> }>;
  backend?: string;
  raw: string;
  error?: string;
}

export function listPipelines(repoPath: string, revision = resolveCodeRevision(repoPath)?.commit): PipelineDef[] {
  if (!revision) return [];
  const files = readPinnedTree(repoPath, revision, ".hn/pipelines")?.entries ?? [];
  const out: PipelineDef[] = [];
  for (const entry of files) {
    if (entry.type !== "blob" || entry.mode === "120000" || !entry.name.endsWith(".json")) continue;
    const f = entry.name;
    const { content: text } = readPinnedBlob(repoPath, entry.sha, entry.size, 1024 * 1024);
    if (text === null) continue;
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

export function readPolicy(repoPath: string, revision = resolveCodeRevision(repoPath)?.commit): PolicyView | null {
  if (!revision) return null;
  const file = readPinnedTree(repoPath, revision, ".hn")?.entries.find(entry => entry.name === "policy.json");
  if (!file || file.type !== "blob" || file.mode === "120000") return null;
  const { content: text } = readPinnedBlob(repoPath, file.sha, file.size, 1024 * 1024);
  if (text === null) return null;
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
