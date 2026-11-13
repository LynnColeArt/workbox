import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const git = promisify(execFile);
const pageSize = 25;
const pullRequest = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  merged_at: z.string().nullable(),
  user: z.object({ login: z.string() }).nullable(),
});

export async function readGitHubPullRequests(repoPath: string, page = 1) {
  let origin: string;
  try {
    const result = await git("git", ["config", "--local", "--get", "remote.origin.url"], {
      cwd: repoPath, timeout: 3000, maxBuffer: 4096,
    });
    origin = result.stdout.trim();
  } catch {
    return { kind: "no_source" } as const;
  }
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(origin);
  if (!match || [".", ".."].includes(match[2])) return { kind: "no_source" } as const;
  const repository = `${match[1]}/${match[2]}`;
  try {
    const url = `https://api.github.com/repos/${repository}/pulls?state=all&sort=created&direction=desc&per_page=${pageSize}&page=${page}`;
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { kind: "unavailable" } as const;
    const requests = z.array(pullRequest).parse(await response.json());
    return {
      kind: "available",
      requests: requests.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.merged_at ? "merged" : pr.state,
        author: pr.user?.login ?? null,
        url: `https://github.com/${repository}/pull/${pr.number}`,
      })),
      nextPage: /rel="next"/.test(response.headers.get("link") ?? "") ? page + 1 : null,
    } as const;
  } catch {
    return { kind: "unavailable" } as const;
  }
}
