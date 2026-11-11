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

  const formatCount = new Intl.NumberFormat("en-US");

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <BranchSelector projectId={id} current={rev} branches={branches.map((b) => b.name)} path={sub ?? ""} />
            <span className="wb-chip wb-mono ml-auto">{formatCount.format(stats.commits)} commit{stats.commits === 1 ? "" : "s"} · {formatCount.format(stats.contributors)} contributor{stats.contributors === 1 ? "" : "s"}</span>
          </div>
          {stats.lastCommit && (
            <div className="wb-panel px-4 py-2.5 mb-4 text-xs wb-mono wb-muted flex gap-3 items-center">
              <span style={{ color: "var(--wb-accent)" }}>{stats.lastCommit.sha.slice(0, 8)}</span>
              <span className="min-w-0 truncate" title={stats.lastCommit.subject}>{stats.lastCommit.subject}</span>
              <span className="ml-auto shrink-0">{stats.lastCommit.when.slice(0, 10)}</span>
            </div>
          )}

          {mode === "dir" ? <DirListing id={id} repoPath={repoPath} rev={rev} sub={sub} /> : <BlobView id={id} repoPath={repoPath} rev={rev} sub={sub!} />}
        </section>

        <aside className="space-y-4">
          <div className="wb-panel p-4">
            <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">About</h2>
            <DescriptionEditor projectId={id} initial={p.description} />
            {overview && (
              <div className="text-sm wb-muted space-y-1 tabular-nums">
                <div><strong className="font-semibold text-[var(--wb-text)]">{formatCount.format(overview.eventCount)}</strong> events · <strong className="font-semibold text-[var(--wb-text)]">{formatCount.format(overview.verifiedCount)}</strong> verified</div>
                <div><strong className="font-semibold text-[var(--wb-text)]">{formatCount.format(overview.openIssues)}</strong> open · <strong className="font-semibold text-[var(--wb-text)]">{formatCount.format(overview.totalIssues)}</strong> issues total</div>
              </div>
            )}
          </div>

          <div className="wb-panel p-4">
            <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Contributors</h2>
            <div className="space-y-1.5">
              {contributors.slice(0, 8).map((c) => (
                <div key={c.name} className="flex items-center gap-3 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="wb-muted text-xs ml-auto">{formatCount.format(c.commits)} commit{c.commits === 1 ? "" : "s"}</span>
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
                <div>{formatCount.format(policy.maintainers.length)} maintainer{policy.maintainers.length === 1 ? "" : "s"}</div>
                <div>{formatCount.format(Object.keys(policy.pipelines).length)} governed pipeline{Object.keys(policy.pipelines).length === 1 ? "" : "s"}</div>
              </div>
            ) : (
              <p className="wb-muted text-xs">No .hn/policy.json — trust thresholds undefined.</p>
            )}
            <div className="wb-mono text-xs wb-muted mt-2">{formatCount.format(pipelines.length)} pipeline definition{pipelines.length === 1 ? "" : "s"}</div>
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
      <div className="wb-panel divide-y divide-[var(--wb-border)] overflow-hidden" style={{ borderColor: "var(--wb-border)" }}>
        {sub && (
          <Link className="block px-4 py-2 wb-mono text-sm wb-link"
                href={`/p/${id}/code?rev=${encodeURIComponent(rev)}&path=${encodeURIComponent(sub.split("/").slice(0, -1).join("/"))}`}>
            ../
          </Link>
        )}
        {tree.entries.map((e) => {
          const c = e.type === "blob" ? commits.get(e.name) : undefined;
          return (
            <div key={e.path} className="grid grid-cols-[1rem_minmax(0,1fr)_auto_auto] items-center gap-2 px-4 py-2.5 hover:bg-[var(--wb-panel-2)] md:grid-cols-[1rem_minmax(0,2fr)_minmax(0,3fr)_5rem_5rem] md:gap-3">
              <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"
                   className={`shrink-0 ${e.type === "tree" ? "text-[var(--wb-link)]" : "wb-muted"}`}>
                {e.type === "tree" ? (
                  <path d="M1.75 2h4.5l1.5 1.5h6.5A1.75 1.75 0 0 1 16 5.25v7A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5A1.75 1.75 0 0 1 1.75 2Z" />
                ) : (
                  <path fillRule="evenodd" d="M3.75 1h5.5L13 4.75v8.5A1.75 1.75 0 0 1 11.25 15h-7.5A1.75 1.75 0 0 1 2 13.25v-10.5A1.75 1.75 0 0 1 3.75 1ZM3.5 2.75v10.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25V5.5H9A.75.75 0 0 1 8.25 4.75V2.5h-4.5a.25.25 0 0 0-.25.25Zm6.25.31.94.94h-.94v-.94Z" />
                )}
              </svg>
              <Link className="truncate text-sm hover:text-[var(--wb-link)] hover:underline" title={e.name}
                    href={`/p/${id}/code?rev=${encodeURIComponent(rev)}&path=${encodeURIComponent(e.path)}`}>
                {e.name}
              </Link>
              <span className="wb-muted hidden truncate text-sm md:block" title={c?.subject}>
                {c?.subject}
              </span>
              <span className="wb-muted wb-mono text-right text-xs whitespace-nowrap">
                {c ? c.shortSha : e.size !== null ? `${e.size} B` : ""}
              </span>
              <span className="wb-muted text-right text-xs whitespace-nowrap" title={c?.author}>{c?.when.slice(0, 10)}</span>
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
