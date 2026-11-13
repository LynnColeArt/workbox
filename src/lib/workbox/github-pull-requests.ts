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
  })),
});

export async function readGitHubPullRequests(repoPath: string, page = 1, status: "open" | "closed" = "open") {
  try {
    const result = await runHn(repoPath, ["migrate", "pull-requests", "--repository", repoPath], 30_000, {
      localRead: true, maxOutputBytes: 16 * 1024 * 1024,
    });
    const parsed = nativeHistory.safeParse(result.envelope);
    if (result.exitCode !== 0 || !parsed.success) return { kind: "unavailable" } as const;
    const records = parsed.data.pull_requests;
    const open = records.filter(record => record.state === "open").length;
    const closed = records.length - open;
    const filtered = records.filter(record => status === "open" ? record.state === "open" : record.state !== "open");
    const pageSize = workboxPageSize();
    const totalPages = Math.ceil(filtered.length / pageSize);
    const currentPage = Math.min(page, Math.max(1, totalPages));
    const offset = (currentPage - 1) * pageSize;
    return {
      kind: "available", status, page: currentPage, pageSize, totalPages, open, closed,
      requests: filtered.slice(offset, offset + pageSize),
      nextPage: currentPage < totalPages ? currentPage + 1 : null,
    } as const;
  } catch {
    return { kind: "unavailable" } as const;
  }
}
