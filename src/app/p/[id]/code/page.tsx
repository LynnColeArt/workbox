import { connection } from "next/server";
import Link from "next/link";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { listBranches, listTree, readBlob, safeRelPath, repoStats } from "@/lib/workbox/repo";

export const instant = false;

export default async function CodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ path?: string; rev?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { path: rawPath, rev: rawRev } = await searchParams;
  const db = openDb();
  const p = getProject(db, id);
  if (!p) return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;

  const repoPath = p.repoPath;
  const branches = listBranches(repoPath);
  const rev = rawRev && branches.some((b) => b.name === rawRev) ? rawRev : branches[0]?.name ?? "HEAD";

  const sub = rawPath ? safeRelPath(rawPath) : null;
  if (rawPath && sub === null) {
    return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Invalid path.</p></main>;
  }

  // Distinguish file vs directory: ls-tree the parent, look for the entry.
  let mode: "dir" | "file" = "dir";
  if (sub) {
    const segs = sub.split("/");
    const parent = segs.slice(0, -1).join("/");
    const name = segs[segs.length - 1];
    const parentTree = listTree(repoPath, rev, parent);
    const hit = parentTree.entries.find((e) => e.name === name);
    if (hit?.type === "blob") mode = "file";
    else if (!hit) {
      return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Not found at {rev}:{sub}.</p></main>;
    }
  }

  const stats = repoStats(repoPath, rev);

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <div className="wb-panel px-4 py-3 mb-4 flex flex-wrap gap-x-6 gap-y-1 text-xs wb-muted wb-mono">
        <span>{stats.commits} commits</span>
        <span>{stats.contributors} contributors</span>
        {stats.lastCommit && <span className="truncate" title={stats.lastCommit.sha}>last: {stats.lastCommit.subject.slice(0, 60)}</span>}
        <span className="flex gap-1 ml-auto items-center">
          {branches.slice(0, 6).map((b) => (
            <Link key={b.name} href={`/p/${id}/code?rev=${encodeURIComponent(b.name)}`}
                  className="wb-chip" style={b.name === rev ? { borderColor: "var(--wb-accent)", color: "var(--wb-accent)" } : undefined}>
              {b.name}
            </Link>
          ))}
        </span>
      </div>

      {mode === "dir" ? <DirListing id={id} repoPath={repoPath} rev={rev} sub={sub} /> : <BlobView id={id} repoPath={repoPath} rev={rev} sub={sub!} />}
    </main>
  );
}

function Breadcrumbs({ id, rev, sub }: { id: string; rev: string; sub: string | null }) {
  const parts = sub ? sub.split("/") : [];
  return (
    <div className="wb-mono text-sm mb-3">
      <Link className="wb-link" href={`/p/${id}/code?rev=${encodeURIComponent(rev)}`}>{rev}</Link>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        const path = parts.slice(0, i + 1).join("/");
        return (
          <span key={path}>
            {" / "}
            {isLast ? <span className="wb-mono">{part}</span>
                   : <Link className="wb-link" href={`/p/${id}/code?rev=${encodeURIComponent(rev)}&path=${encodeURIComponent(path)}`}>{part}</Link>}
          </span>
        );
      })}
    </div>
  );
}

function DirListing({ id, repoPath, rev, sub }: { id: string; repoPath: string; rev: string; sub: string | null }) {
  const tree = listTree(repoPath, rev, sub ?? "");
  if (tree.error) {
    return <p className="wb-muted text-sm">Nothing at this path: {tree.error}</p>;
  }
  return (
    <div>
      <Breadcrumbs id={id} rev={rev} sub={sub} />
      <div className="wb-panel divide-y" style={{ borderColor: "var(--wb-border)" }}>
        {sub && (
          <Link className="block px-4 py-2 wb-mono text-sm wb-link"
                href={`/p/${id}/code?rev=${encodeURIComponent(rev)}&path=${encodeURIComponent(sub.split("/").slice(0, -1).join("/"))}`}>
            ../
          </Link>
        )}
        {tree.entries.map((e) => (
          <div key={e.path} className="flex items-center gap-3 px-4 py-2">
            <span className="wb-muted wb-mono text-xs">{e.type === "tree" ? "▸" : "·"}</span>
            {e.type === "tree" ? (
              <Link className="wb-link wb-mono text-sm" href={`/p/${id}/code?rev=${encodeURIComponent(rev)}&path=${encodeURIComponent(e.path)}`}>{e.name}/</Link>
            ) : (
              <Link className="wb-link wb-mono text-sm" href={`/p/${id}/code?rev=${encodeURIComponent(rev)}&path=${encodeURIComponent(e.path)}`}>{e.name}</Link>
            )}
            {e.size !== null && <span className="ml-auto wb-muted wb-mono text-xs">{e.size} B</span>}
          </div>
        ))}
        {tree.entries.length === 0 && <p className="p-4 wb-muted text-sm">Empty directory.</p>}
      </div>
    </div>
  );
}

function BlobView({ id, repoPath, rev, sub }: { id: string; repoPath: string; rev: string; sub: string }) {
  const blob = readBlob(repoPath, rev, sub);
  return (
    <div>
      <Breadcrumbs id={id} rev={rev} sub={sub} />
      <div className="wb-panel">
        {blob.binary ? (
          <p className="p-4 wb-muted text-sm">Binary file — not rendered.</p>
        ) : blob.content === null ? (
          <p className="p-4 wb-muted text-sm">Could not read: {blob.error}</p>
        ) : (
          <pre className="p-4 wb-mono text-xs overflow-x-auto" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {blob.content}
          </pre>
        )}
      </div>
    </div>
  );
}
