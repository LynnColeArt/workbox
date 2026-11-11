import type { DatabaseSync } from "node:sqlite";
import { getProject } from "./queries";
import {
  codePath, isReachableCodeCommit, readPinnedBlob, readPinnedChanges, readPinnedCommit,
  readPinnedFileHistory, readPinnedRowHistory, readPinnedStats, readPinnedTree,
  resolveCodeRevision, type FileCommitInfo, type TreeEntry,
} from "./repo";

export interface CodeQuery {
  rev?: unknown;
  at?: unknown;
  path?: unknown;
  commit?: unknown;
}

type CodeLinkQuery = { rev?: string | null; at?: string; path?: string; commit?: string };

export function codeHref(projectId: string, query: CodeLinkQuery = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) search.set(key, value);
  }
  return `/p/${encodeURIComponent(projectId)}/code${search.size ? `?${search}` : ""}`;
}

function crumbLinks(projectId: string, branch: string | null, at: string, path: string) {
  const crumbs = [{ name: branch ?? at.slice(0, 8), href: codeHref(projectId, { rev: branch, at }) }];
  let prefix = "";
  for (const part of path.split("/").filter(Boolean)) {
    prefix = prefix ? `${prefix}/${part}` : part;
    crumbs.push({ name: part, href: codeHref(projectId, { rev: branch, at, path: prefix }) });
  }
  return crumbs;
}

function commitLink(projectId: string, branch: string | null, at: string, info: FileCommitInfo | null) {
  return info && { ...info, href: codeHref(projectId, { rev: branch, at, commit: info.sha }) };
}

type LinkedCommit = NonNullable<ReturnType<typeof commitLink>>;
type CodeEntry = Pick<TreeEntry, "type" | "name" | "path" | "size"> & {
  href: string;
  lastChange: LinkedCommit | null;
};

interface CodeLocation {
  projectId: string;
  branch: string | null;
  at: string;
  path: string;
  branches: string[];
  breadcrumbs: { name: string; href: string }[];
  href: string;
  lastCommit: LinkedCommit | null;
  stats: ReturnType<typeof readPinnedStats>;
}

export type CodeRead =
  | { kind: "unavailable"; href: string; reason: string }
  | (CodeLocation & { kind: "directory"; entries: CodeEntry[]; historyIncomplete: boolean })
  | (CodeLocation & {
    kind: "file";
    content: string | null;
    size: number | null;
    binary: boolean;
    contentUnavailable: boolean;
    lastChange: LinkedCommit | null;
    introduced: LinkedCommit | null;
    historyIncomplete: boolean;
  })
  | (CodeLocation & {
    kind: "commit";
    commit: LinkedCommit;
    changes: { status: string; path: string; previousPath?: string; href: string | null }[];
    historyIncomplete: boolean;
  });

export function readCode(db: DatabaseSync, projectId: string, query: CodeQuery = {}): CodeRead {
  function unavailable(reason: string): CodeRead {
    return { kind: "unavailable", href: codeHref(projectId), reason };
  }

  if ([query.rev, query.at, query.path, query.commit].some((value) => value !== undefined && typeof value !== "string")) {
    return unavailable("Invalid Code selection.");
  }
  const rev = typeof query.rev === "string" ? query.rev : undefined;
  const pin = typeof query.at === "string" ? query.at : undefined;
  const path = codePath(typeof query.path === "string" ? query.path : "");
  const requestedCommit = typeof query.commit === "string" ? query.commit : undefined;
  if (path === null || (path && requestedCommit !== undefined)) return unavailable("Invalid Code selection.");

  const project = getProject(db, projectId);
  if (!project) return unavailable("Project unavailable.");
  const repo = project.repoPath;
  const revision = resolveCodeRevision(repo, rev);
  if (!revision) return unavailable("Branch or revision unavailable.");
  const { branch, branches, commit: tip } = revision;
  const at = pin ?? tip;
  if (!isReachableCodeCommit(repo, at, tip)) return unavailable("Pinned revision unavailable.");

  const last = readPinnedCommit(repo, at);
  const location: CodeLocation = {
    projectId, branch, at, path, branches,
    href: codeHref(projectId, { rev: branch, at, path }),
    breadcrumbs: crumbLinks(projectId, branch, at, path),
    lastCommit: commitLink(projectId, branch, at, last?.info ?? null),
    stats: readPinnedStats(repo, at),
  };

  if (requestedCommit !== undefined) {
    if (!isReachableCodeCommit(repo, requestedCommit, at)) return unavailable("Commit unavailable in this revision.");
    const detail = requestedCommit === at ? last : readPinnedCommit(repo, requestedCommit);
    if (!detail) return unavailable("Commit details unavailable.");
    const commit = commitLink(projectId, branch, at, detail.info)!;
    const { changes, incomplete } = readPinnedChanges(repo, requestedCommit, detail.parent);
    return {
      ...location, kind: "commit", href: commit.href, commit, historyIncomplete: incomplete,
      changes: changes.map((change) => {
        const object = change.status === "D" ? detail.parent : requestedCommit;
        return { ...change, href: object && codeHref(projectId, { rev: branch, at: object, path: change.path }) };
      }),
    };
  }

  if (path) {
    const parent = path.split("/").slice(0, -1).join("/");
    const entry = readPinnedTree(repo, at, parent)?.entries.find((row) => row.path === path);
    if (!entry) return unavailable("Path unavailable at this revision.");
    if (entry.type !== "tree") {
      const blob = entry.type === "blob" ? readPinnedBlob(repo, entry.sha, entry.size)
        : { content: null, binary: false, unavailable: true };
      const history = readPinnedFileHistory(repo, at, path);
      return {
        ...location, kind: "file", content: blob.content, size: entry.size, binary: blob.binary, contentUnavailable: blob.unavailable,
        lastChange: commitLink(projectId, branch, at, history.latest),
        introduced: commitLink(projectId, branch, at, history.introduced), historyIncomplete: history.incomplete,
      };
    }
  }

  const tree = readPinnedTree(repo, at, path);
  if (!tree) return unavailable("Repository tree unavailable.");
  const history = tree.entries.length ? readPinnedRowHistory(repo, at, path, tree.entries.map((entry) => entry.path))
    : { latest: new Map<string, FileCommitInfo>(), incomplete: false };
  return {
    ...location, kind: "directory", historyIncomplete: tree.incomplete || history.incomplete,
    entries: tree.entries.map(({ type, name, path: entryPath, size }) => ({
      type, name, path: entryPath, size,
      href: codeHref(projectId, { rev: branch, at, path: entryPath }),
      lastChange: commitLink(projectId, branch, at, history.latest.get(entryPath) ?? null),
    })),
  };
}
