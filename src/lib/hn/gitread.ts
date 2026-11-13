import { spawnSync } from "node:child_process";

/**
 * Read-only git plumbing against a repository working tree.
 * Nothing here checks out, writes, or mutates. Reads over `refs/hn/*`
 * and blobs are the whole surface — hubnot storage is the truth.
 */
export function git(repoPath: string, args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/** Read a blob at a revision without touching the worktree. */
export function catFile(repoPath: string, rev: string, path: string): string | null {
  const r = git(repoPath, ["show", `${rev}:${path}`]);
  return r.ok ? r.out : null;
}

/**
 * All actor chain heads under refs/hn/actors/<actor>. Local and remote
 * tracking copies both count: a fork can hold actors the local checkout
 * never initialized. Key = "refs/hn/actors/<actor>".
 */
export function actorRefs(repoPath: string): Map<string, string> {
  const r = git(repoPath, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/hn/actors/", "refs/hn/remotes/"]);
  const out = new Map<string, string>();
  for (const line of r.out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sp = trimmed.lastIndexOf(" ");
    const ref = trimmed.slice(0, sp);
    if (!/^refs\/hn\/(?:remotes\/[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}\/)?actors\/[a-f0-9]{64}$/.test(ref)) continue;
    out.set(ref, trimmed.slice(sp + 1));
  }
  return out;
}

/** Commit ids on an actor chain, newest first. */
export function chainCommits(repoPath: string, ref: string): string[] {
  const r = git(repoPath, ["rev-list", ref]);
  return r.out.split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * Memory stream refs: refs/hn/memory/<actor>/<stream>.
 * Memory is a separate signed-fact family with its own append-only
 * chains (verified live 2026-11-11) — payload file is memory.json.
 */
export function memoryRefs(repoPath: string): Map<string, string> {
  const r = git(repoPath, ["for-each-ref", "refs/hn/memory/", "--format=%(refname) %(objectname)"]);
  const out = new Map<string, string>();
  for (const line of r.out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sp = trimmed.lastIndexOf(" ");
    out.set(trimmed.slice(0, sp), trimmed.slice(sp + 1));
  }
  return out;
}

export function commitSubject(repoPath: string, sha: string): string {
  return git(repoPath, ["log", "-1", "--format=%s", sha]).out.trim();
}
