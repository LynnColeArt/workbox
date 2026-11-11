import { connection } from "next/server";
import Link from "next/link";
import { getProject, projectContributors } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { listBranches, listTree, readBlob, safeRelPath, repoStats, lastCommitsForPaths } from "@/lib/workbox/repo";
import { listPipelines, readPolicy } from "@/lib/workbox/ci";
import DescriptionEditor from "@/components/description-editor";
import BranchSelector from "@/components/branch-selector";

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
  const contributors = projectContributors(db, id);
  const pipelines = listPipelines(repoPath);
  const policy = readPolicy(repoPath);
  const overview = (await import("@/lib/workbox/queries")).projectOverview(db, id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <section>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <BranchSelector projectId={id} current={rev} branches={branches.map((b) => b.name)} path={sub ?? ""} />
            <span className="wb-chip wb-mono ml-auto">{stats.commits} commits · {stats.contributors} contributors</span>
          </div>
          {stats.lastCommit && (
            <div className="wb-panel px-4 py-2.5 mb-4 text-xs wb-mono wb-muted flex gap-3 items-center">
              <span style={{ color: "var(--wb-accent)" }}>{stats.lastCommit.sha.slice(0, 8)}</span>
              <span className="truncate" title={stats.lastCommit.subject}>{stats.lastCommit.subject}</span>
              <span className="ml-auto">{stats.lastCommit.when.slice(0, 10)}</span>
            </div>
          )}

          {mode === "dir" ? <DirListing id={id} repoPath={repoPath} rev={rev} sub={sub} /> : <BlobView id={id} repoPath={repoPath} rev={rev} sub={sub!} />}
        </section>

        <aside className="space-y-4">
          <div className="wb-panel p-4">
            <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">About</h2>
            <DescriptionEditor projectId={id} initial={p.description} />
            {overview && (
              <div className="wb-mono text-xs wb-muted space-y-1">
                <div>{overview.eventCount} events · {overview.verifiedCount} verified</div>
                <div>{overview.openIssues} open · {overview.totalIssues} issues total</div>
              </div>
            )}
          </div>

          <div className="wb-panel p-4">
            <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Contributors</h2>
            <div className="space-y-1.5">
              {contributors.slice(0, 8).map((c) => (
                <div key={c.name} className="flex items-center gap-3 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="wb-muted text-xs ml-auto">{c.commits} commit{c.commits === 1 ? "" : "s"}</span>
                </div>
              ))}
              {contributors.length === 0 && <p className="wb-muted text-xs">No commits yet.</p>}
            </div>
          </div>

          <div className="wb-panel p-4">
            <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Governance</h2>
            {policy ? (
              <div className="wb-mono text-xs wb-muted">
                <div>{policy.version}</div>
                <div>{policy.maintainers.length} maintainer(s)</div>
                <div>{Object.keys(policy.pipelines).length} governed pipeline(s)</div>
              </div>
            ) : (
              <p className="wb-muted text-xs">No .hn/policy.json — trust thresholds undefined.</p>
            )}
            <div className="wb-mono text-xs wb-muted mt-2">{pipelines.length} pipeline definition(s)</div>
          </div>

          <div className="wb-panel p-4">
            <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Hubnot chains</h2>
            <div className="wb-mono text-xs wb-muted">
              <div><Link className="wb-link" href={`/p/${id}/issues`}>issues</Link> · <Link className="wb-link" href={`/p/${id}/proposals`}>proposals</Link></div>
              <div><Link className="wb-link" href={`/p/${id}/memories`}>memory</Link> · <Link className="wb-link" href={`/p/${id}/ci`}>CI</Link></div>
              <div><Link className="wb-link" href={`/p/${id}/insights`}>insights</Link></div>
            </div>
          </div>
        </aside>
      </div>
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
  const fileEntries = tree.entries.filter((e) => e.type === "blob").map((e) => e.name);
  const commits = lastCommitsForPaths(repoPath, rev, sub ?? "", fileEntries);
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
        {tree.entries.map((e) => {
          const c = e.type === "blob" ? commits.get(e.name) : undefined;
          return (
            <div key={e.path} className="flex items-center gap-3 px-4 py-2.5 min-w-0">
              <span className="wb-muted wb-mono text-xs shrink-0">{e.type === "tree" ? "▸" : "·"}</span>
              <Link className="wb-link wb-mono text-sm shrink-0"
                    href={`/p/${id}/code?rev=${encodeURIComponent(rev)}&path=${encodeURIComponent(e.path)}`}>
                {e.type === "tree" ? `${e.name}/` : e.name}
              </Link>
              <span className="wb-muted text-xs truncate hidden md:inline" title={c?.subject}>
                {c ? c.subject : e.type === "tree" ? "" : ""}
              </span>
              <span className="ml-auto wb-muted wb-mono text-xs whitespace-nowrap">
                {c ? c.shortSha : e.size !== null ? `${e.size} B` : ""}
              </span>
              {c && <span className="wb-muted wb-mono text-xs whitespace-nowrap" title={c.author}>{c.when.slice(0, 10)}</span>}
            </div>
          );
        })}
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
