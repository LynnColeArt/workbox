import { spawnSync } from "node:child_process";
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

/** Public Code reads use only pinned Git objects and exact local refs. */
const HISTORY_LIMIT = 2_000;
const HISTORY_BYTES = 8 * 1024 * 1024;
const TREE_BYTES = 4 * 1024 * 1024;
const BLOB_BYTES = 256 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const logFormat = "%x00commit%x00%H%x00%h%x00%cI%x00%an%x00%s";

function objectGit(repoPath: string, args: string[], maxBuffer = HISTORY_BYTES) {
  const env = {
    ...process.env,
    LC_ALL: "C",
    GIT_NO_LAZY_FETCH: "1",
    GIT_ALLOW_PROTOCOL: "",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_DIR: undefined,
    GIT_COMMON_DIR: undefined,
    GIT_WORK_TREE: undefined,
    GIT_INDEX_FILE: undefined,
    GIT_NAMESPACE: undefined,
    GIT_OBJECT_DIRECTORY: undefined,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
    GIT_LITERAL_PATHSPECS: undefined,
    GIT_GLOB_PATHSPECS: undefined,
    GIT_NOGLOB_PATHSPECS: undefined,
    GIT_ICASE_PATHSPECS: undefined,
  };
  const result = spawnSync("git", ["--no-pager", "--no-replace-objects", "-C", repoPath, ...args], {
    env, maxBuffer, timeout: 3_000, killSignal: "SIGKILL", windowsHide: true,
  });
  return result.status === 0 ? result.stdout : null;
}

function nulFields(output: Buffer) {
  const fields: Buffer[] = [];
  let offset = 0;
  for (let end = output.indexOf(0); end >= 0; end = output.indexOf(0, offset)) {
    fields.push(output.subarray(offset, end));
    offset = end + 1;
  }
  return fields;
}

function pathField(value?: Buffer) {
  if (!value?.length) return null;
  try {
    return decoder.decode(value);
  } catch {
    return null;
  }
}

export function isGitObjectId(value: string) {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
}

export interface CodeRevision {
  branch: string | null;
  commit: string;
  branches: string[];
}

export function resolveCodeRevision(repoPath: string, rev?: string): CodeRevision | null {
  const prefix = "refs/heads/";
  const refs = objectGit(repoPath, ["for-each-ref", "--sort=refname", "--format=%(refname)%00%(objectname)", prefix]);
  if (!refs) return null;
  const byName = new Map<string, string>();
  for (const line of refs.toString("utf8").split("\n")) {
    const [ref, commit] = line.split("\0");
    if (ref?.startsWith(prefix) && commit && isGitObjectId(commit)) byName.set(ref.slice(prefix.length), commit);
  }
  const branches = Array.from(byName.keys());
  if (rev !== undefined) {
    const commit = byName.get(rev);
    return commit ? { branch: rev, commit, branches } : null;
  }

  const defaultRef = objectGit(repoPath, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], 4096)?.toString().trim();
  const remotePrefix = "refs/remotes/origin/";
  const configured = defaultRef?.startsWith(remotePrefix) ? defaultRef.slice(remotePrefix.length) : undefined;
  const headRef = objectGit(repoPath, ["symbolic-ref", "--quiet", "HEAD"], 4096)?.toString().trim();
  const checkedOut = headRef?.startsWith(prefix) ? headRef.slice(prefix.length) : undefined;
  const branch = [configured, "main", checkedOut, branches[0]].find((name) => name !== undefined && byName.has(name));
  if (branch !== undefined) return { branch, commit: byName.get(branch)!, branches };
  const commit = objectGit(repoPath, ["rev-parse", "--verify", "HEAD^{commit}"], 256)?.toString().trim();
  return commit && isGitObjectId(commit) ? { branch: null, commit, branches } : null;
}

export function isReachableCodeCommit(repoPath: string, commit: string, tip: string) {
  if (!isGitObjectId(commit) || !isGitObjectId(tip) || commit.length !== tip.length) return false;
  const type = objectGit(repoPath, ["cat-file", "-t", commit], 256)?.toString().trim();
  return type === "commit" && (commit === tip || objectGit(repoPath, ["merge-base", "--is-ancestor", commit, tip], 256) !== null);
}

export function codePath(raw: string): string | null {
  if (raw === "") return raw;
  const parts = raw.split("/");
  return raw.length <= 4096 && !raw.includes("\0") && parts.every((p) => p && p !== "." && p !== "..") ? raw : null;
}

export function readPinnedTree(repoPath: string, commit: string, directory: string) {
  const ref = directory ? `${commit}:${directory}` : commit;
  const output = objectGit(repoPath, ["ls-tree", "-l", "-z", ref], TREE_BYTES);
  if (!output) return null;
  const entries: TreeEntry[] = [];
  let incomplete = false;
  for (const row of nulFields(output)) {
    const tab = row.indexOf(9);
    const name = tab >= 0 ? pathField(row.subarray(tab + 1)) : null;
    const [mode, type, sha, sizeToken] = row.subarray(0, tab).toString("ascii").split(/\s+/);
    if (!name || !isGitObjectId(sha ?? "") || (type !== "blob" && type !== "tree" && type !== "commit")) {
      incomplete = true;
      continue;
    }
    entries.push({
      mode, type, sha, name,
      size: /^\d+$/.test(sizeToken) ? Number(sizeToken) : null,
      path: directory ? `${directory}/${name}` : name,
    });
  }
  entries.sort((a, b) => Number(b.type === "tree") - Number(a.type === "tree") || a.name.localeCompare(b.name));
  return { entries, incomplete };
}

export function readPinnedBlob(repoPath: string, object: string, size: number | null, maxBytes = BLOB_BYTES) {
  const limit = Math.min(maxBytes, 1024 * 1024);
  if (size === null || size > limit) return { content: null, binary: false, unavailable: true };
  const bytes = objectGit(repoPath, ["cat-file", "blob", object], limit);
  if (!bytes) return { content: null, binary: false, unavailable: true };
  if (bytes.includes(0)) return { content: null, binary: true, unavailable: false };
  try {
    return { content: decoder.decode(bytes), binary: false, unavailable: false };
  } catch {
    return { content: null, binary: true, unavailable: false };
  }
}

interface CodeChange {
  status: string;
  path: string;
  previousPath?: string;
}

interface HistoryCommit {
  info: FileCommitInfo;
  changes: CodeChange[];
}

function parseChange(fields: Buffer[], offset: number): { change: CodeChange | null; consumed: number } {
  const status = fields[offset].toString("ascii").trim();
  if (!/^(?:[ADMTUXB]|[RC]\d{1,3})$/.test(status)) return { change: null, consumed: 0 };
  const first = pathField(fields[offset + 1]);
  if (/^[RC]/.test(status)) {
    const path = pathField(fields[offset + 2]);
    return { change: first && path ? { status, path, previousPath: first } : null, consumed: 3 };
  }
  return { change: first ? { status, path: first } : null, consumed: 2 };
}

function parseHistory(output: Buffer) {
  const fields = nulFields(output);
  const history: HistoryCommit[] = [];
  let incomplete = false;
  for (let i = 0; i < fields.length;) {
    if (fields[i].length === 0) { i++; continue; }
    if (fields[i].toString("ascii") === "commit") {
      const [sha, shortSha, when, author, subject] = fields.slice(i + 1, i + 6).map((f) => f.toString());
      if (!isGitObjectId(sha ?? "") || !when || !Number.isFinite(Date.parse(when))) {
        incomplete = true;
        break;
      }
      history.push({ info: { sha, shortSha, when, author, subject }, changes: [] });
      i += 6;
      continue;
    }
    const current = history.at(-1);
    const { change, consumed } = parseChange(fields, i);
    if (!consumed || !current) {
      incomplete = true;
      break;
    }
    if (change) current.changes.push(change);
    else incomplete = true;
    i += consumed;
  }
  return { history, incomplete };
}

function pinnedHistory(repoPath: string, commit: string, path: string, follow = false) {
  const shallow = objectGit(repoPath, ["rev-parse", "--is-shallow-repository"], 256)?.toString().trim();
  const scope = path ? [`:(top,literal)${path}`] : [];
  const traversal = follow ? ["--follow"] : ["--full-history", "--diff-merges=first-parent"];
  const output = objectGit(repoPath, [
    "log", "-z", "--encoding=UTF-8", "--no-ext-diff", "--no-textconv", "--name-status",
    "--find-renames", "--topo-order", `--format=${logFormat}`, `--max-count=${HISTORY_LIMIT + 1}`,
    ...(shallow === "true" ? ["--no-root"] : []), ...traversal, commit, "--", ...scope,
  ]);
  if (!output) return { history: [], incomplete: true };
  const { history, incomplete } = parseHistory(output);
  return {
    history: history.slice(0, HISTORY_LIMIT),
    incomplete: incomplete || history.length > HISTORY_LIMIT || shallow !== "false",
  };
}

export function readPinnedRowHistory(repoPath: string, commit: string, directory: string, paths: string[]) {
  const { history, incomplete } = pinnedHistory(repoPath, commit, directory);
  const remaining = new Set(paths);
  const latest = new Map<string, FileCommitInfo>();
  for (const item of history) {
    for (const change of item.changes) {
      for (const path of [change.path, change.previousPath]) {
        if (!path || (directory && !path.startsWith(`${directory}/`))) continue;
        const name = path.slice(directory ? directory.length + 1 : 0).split("/", 1)[0];
        const child = directory ? `${directory}/${name}` : name;
        if (remaining.delete(child)) latest.set(child, item.info);
      }
    }
    if (!remaining.size) break;
  }
  return { latest, incomplete: incomplete || remaining.size > 0 };
}

export function readPinnedFileHistory(repoPath: string, commit: string, path: string) {
  const directory = path.split("/").slice(0, -1).join("/");
  const rowHistory = readPinnedRowHistory(repoPath, commit, directory, [path]);
  const latest = rowHistory.latest.get(path) ?? null;
  // Following renames can omit merge diffs, so it only supplies introduction history.
  const { history, incomplete } = pinnedHistory(repoPath, commit, path, true);
  let previous = path;
  for (const entry of history) {
    const change = entry.changes.find((file) => file.path === previous);
    if (change?.status === "A") {
      return { latest, introduced: incomplete ? null : entry.info, incomplete: rowHistory.incomplete || incomplete };
    }
    if (change?.status.startsWith("R") && change.previousPath) previous = change.previousPath;
  }
  return { latest, introduced: null, incomplete: true };
}

export function readPinnedCommit(repoPath: string, commit: string) {
  const output = objectGit(repoPath, ["log", "-1", "-z", `--format=${logFormat}`, commit, "--"], 32 * 1024);
  if (!output) return null;
  const [, marker, sha, shortSha, when, author, subject] = nulFields(output).map((f) => f.toString());
  if (marker !== "commit" || sha !== commit || !when || !Number.isFinite(Date.parse(when))) return null;
  // The commit header keeps its actual parents even at a shallow boundary.
  const raw = objectGit(repoPath, ["cat-file", "commit", commit], 1024 * 1024)?.toString();
  const headerEnd = raw?.indexOf("\n\n") ?? -1;
  if (!raw || headerEnd < 0) return null;
  const parent = raw.slice(0, headerEnd).split("\n").find((line) => line.startsWith("parent "))?.slice(7) ?? null;
  if (parent !== null && !isGitObjectId(parent)) return null;
  return { info: { sha, shortSha, subject, when, author }, parent };
}

export function readPinnedChanges(repoPath: string, commit: string, parent: string | null) {
  const flags = ["--no-ext-diff", "--no-textconv", "--name-status", "-z", "--find-renames"];
  const output = objectGit(repoPath, parent
    ? ["diff", ...flags, parent, commit, "--"]
    : ["diff-tree", "--root", "--no-commit-id", "-r", ...flags, commit, "--"], TREE_BYTES);
  if (!output) return { changes: [], incomplete: true };
  const fields = nulFields(output);
  const changes: CodeChange[] = [];
  let incomplete = false;
  for (let i = 0; i < fields.length;) {
    const { change, consumed } = parseChange(fields, i);
    if (!consumed) return { changes, incomplete: true };
    if (change) changes.push(change);
    else incomplete = true;
    i += consumed;
  }
  return { changes, incomplete };
}

export function readPinnedStats(repoPath: string, commit: string) {
  const count = objectGit(repoPath, ["rev-list", "--count", commit, "--"], 256)?.toString().trim();
  const authors = objectGit(repoPath, ["log", "-z", "--format=%an", commit, "--"]);
  return {
    commits: count && /^\d+$/.test(count) ? Number(count) : null,
    contributors: authors ? new Set(nulFields(authors).map((f) => f.toString())).size : null,
  };
}
