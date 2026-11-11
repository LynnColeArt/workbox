import { git } from "../hn/gitread";

/**
 * Worktree browsing for the Code tab. Read-only git plumbing; the worktree
 * is never modified. Every path is validated against the repo — no `..`,
 * no absolute paths escape the repository.
 */
export interface TreeEntry {
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size: number | null;
  path: string;
  name: string;
}

export function safeRelPath(raw: string): string | null {
  const cleaned = raw.replaceAll("\\", "/").replace(/^\/+/, "");
  const parts = cleaned.split("/").filter((p) => p.length > 0 && p !== "." && p !== "..");
  if (parts.some((p) => p.includes("\0"))) return null;
  return parts.join("/");
}

export function listTree(repoPath: string, rev: string, subpath: string): { entries: TreeEntry[]; error?: string } {
  const treePath = subpath ? `${rev}:${subpath}` : rev;
  const r = git(repoPath, ["ls-tree", "-l", treePath]);
  if (!r.ok) return { entries: [], error: r.err.trim() || "not found" };
  const entries: TreeEntry[] = [];
  for (const line of r.out.split("\n")) {
    if (!line.trim()) continue;
    // format: <mode> SP <type> SP <sha> SP <size(-> with -l)> TAB <path>
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const meta = line.slice(0, tab);
    const relPath = line.slice(tab + 1);
    const [mode, type, sha, sizeTok] = meta.split(/\s+/);
    entries.push({
      mode: mode ?? "",
      type: (type as TreeEntry["type"]) ?? "blob",
      sha: sha ?? "",
      size: sizeTok && sizeTok !== "-" ? Number(sizeTok) : null,
      path: relPath,
      name: relPath.split("/").pop() ?? relPath,
    });
  }
  entries.sort((a, b) =>
    (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "tree" ? -1 : 1),
  );
  return { entries };
}

export function readBlob(repoPath: string, rev: string, path: string): { content: string | null; error?: string; binary: boolean } {
  const r = git(repoPath, ["show", `${rev}:${path}`], );
  if (!r.ok) return { content: null, error: r.err.trim() || "not found", binary: false };
  const buf = Buffer.from(r.out, "utf8");
  // crude binary sniff: NUL byte in first 8KiB
  const binary = buf.subarray(0, 8192).includes(0);
  return { content: binary ? null : r.out, binary };
}

export interface BranchInfo {
  name: string;
  sha: string;
  current: boolean;
}

export function listBranches(repoPath: string): BranchInfo[] {
  const r = git(repoPath, ["for-each-ref", "refs/heads/", "--format=%(refname:short) %(objectname)", "--sort=-committerdate"]);
  const heads = r.out.split("\n").filter(Boolean).map((line) => {
    const sp = line.indexOf(" ");
    return { name: line.slice(0, sp), sha: line.slice(sp + 1), current: false };
  });
  const h = git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const current = h.out.trim();
  return heads.map((b) => ({ ...b, current: b.name === current }));
}

export function repoStats(repoPath: string, rev: string): { commits: number; contributors: number; lastCommit: { sha: string; subject: string; when: string } | null } {
  const count = git(repoPath, ["rev-list", "--count", rev]);
  const shortlog = git(repoPath, ["shortlog", "-sn", rev]);
  const last = git(repoPath, ["log", "-1", "--format=%H%x09%s%x09%cI", rev]);
  const contributors = shortlog.out.split("\n").filter(Boolean).length;
  const [sha, subject, when] = last.out.trim().split("\t");
  return {
    commits: Number(count.out.trim()) || 0,
    contributors,
    lastCommit: sha ? { sha, subject, when } : null,
  };
}

export interface FileCommitInfo {
  sha: string;
  shortSha: string;
  subject: string;
  when: string;
  author: string;
}

/**
 * Latest commit touching each path in a directory listing (the GitHub
 * file-row detail). One log walk over the requested directory, first hit
 * per path wins — no per-file subprocess storms.
 */
export function lastCommitsForPaths(repoPath: string, rev: string, dir: string, paths: string[]): Map<string, FileCommitInfo> {
  const out = new Map<string, FileCommitInfo>();
  if (paths.length === 0) return out;
  const spec = dir ? `${rev}:${dir}` : rev;
  const args = ["log", "--format=%H%x1f%h%x1f%s%x1f%I%x1f%aN", "-z", "--name-status", "-n", "2000", spec, "--"];
  for (const p of paths) args.push(dir ? `${dir}/${p}` : p);
  const r = git(repoPath, args);
  if (!r.ok) return out;
  for (const commitChunk of r.out.split("\0")) {
    if (!commitChunk.trim()) continue;
    const nl = commitChunk.indexOf("\n");
    if (nl < 0) continue;
    const header = commitChunk.slice(0, nl);
    const body = commitChunk.slice(nl + 1);
    const [sha, shortSha, subject, when, author] = header.split("\x1f");
    if (!sha || !shortSha) continue;
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split("\t");
      const path = parts.length > 1 ? parts[1] : parts[0];
      if (!path) continue;
      const rel = dir ? path.slice(dir.length + 1) : path;
      if (paths.includes(rel) && !out.has(rel)) {
        out.set(rel, { sha, shortSha, subject, when, author: author ?? "" });
      }
    }
  }
  return out;
}

export interface BranchDetail {
  name: string;
  sha: string;
  subject: string;
  when: string;
  ahead: number;
  behind: number;
  current: boolean;
}

/** Full branch table for the Branches tab: last commit + divergence from main. */
export function branchDetails(repoPath: string): BranchDetail[] {
  return listBranches(repoPath).map((b) => {
    const last = git(repoPath, ["log", "-1", "--format=%s%x1f%I", b.name]);
    const [subject, when] = last.out.trim().split("\x1f");
    const ahead = git(repoPath, ["rev-list", "--count", `main..${b.name}`]);
    const behind = git(repoPath, ["rev-list", "--count", `${b.name}..main`]);
    return {
      name: b.name,
      sha: b.sha,
      subject: subject ?? "",
      when: when ?? "",
      ahead: Number(ahead.out.trim()) || 0,
      behind: Number(behind.out.trim()) || 0,
      current: b.current,
    };
  });
}
