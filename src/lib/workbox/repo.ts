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
