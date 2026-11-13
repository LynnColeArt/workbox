import { createHash } from "node:crypto";
import { z } from "zod";
import { runHn } from "../hn/runner";
import { workboxPageSize } from "./list-settings";

const nativeHistory = z.object({
  schema: z.literal("hn.migration-pull-requests/1"),
  pull_requests: z.array(z.object({
    source: z.object({ provider: z.string(), instance: z.string(), project_id: z.string(), id: z.string() }),
    revision: z.string(),
    number: z.number().int().positive(),
    title: z.string(),
    state: z.enum(["open", "closed", "merged"]),
    author: z.string(),
    url: z.url().refine(value => new URL(value).protocol === "https:"),
    created_at: z.string(),
    updated_at: z.string().optional(),
    body: z.string().optional(),
  })),
});

async function readImportedPullRequests(repoPath: string) {
  try {
    const result = await runHn(repoPath, ["migrate", "pull-requests", "--repository", repoPath], 30_000, {
      localRead: true, maxOutputBytes: 16 * 1024 * 1024,
    });
    const parsed = nativeHistory.safeParse(result.envelope);
    return result.exitCode === 0 && parsed.success ? parsed.data.pull_requests : null;
  } catch {
    return null;
  }
}

type ImportedPullRequest = z.infer<typeof nativeHistory>["pull_requests"][number];

function localPullRequest(project: string, { body: _body, ...record }: ImportedPullRequest) {
  const { provider, instance, project_id, id } = record.source;
  const localId = createHash("sha256").update(JSON.stringify([provider, instance, project_id, id])).digest("hex");
  return { ...record, localId, href: `/p/${encodeURIComponent(project)}/pull-requests/${localId}` };
}

export async function readPullRequestDetail(project: string, repoPath: string, localId: string) {
  if (!/^[a-f0-9]{64}$/.test(localId)) return { kind: "not_found" } as const;
  const records = await readImportedPullRequests(repoPath);
  if (!records) return { kind: "unavailable" } as const;
  for (const record of records) {
    const local = localPullRequest(project, record);
    if (local.localId === localId) return { kind: "available", request: { ...local, body: record.body ?? null } } as const;
  }
  return { kind: "not_found" } as const;
}

export async function readGitHubPullRequests(project: string, repoPath: string, page = 1, status: "open" | "closed" = "open") {
  const records = await readImportedPullRequests(repoPath);
  if (!records) return { kind: "unavailable" } as const;
  const open = records.filter(record => record.state === "open").length;
  const closed = records.length - open;
  const filtered = records.filter(record => status === "open" ? record.state === "open" : record.state !== "open");
  const pageSize = workboxPageSize();
  const totalPages = Math.ceil(filtered.length / pageSize);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const offset = (currentPage - 1) * pageSize;
  return {
    kind: "available", status, page: currentPage, pageSize, totalPages, open, closed,
    requests: filtered.slice(offset, offset + pageSize).map(record => localPullRequest(project, record)),
    nextPage: currentPage < totalPages ? currentPage + 1 : null,
  } as const;
}
