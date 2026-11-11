import { connection } from "next/server";
import Link from "next/link";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { branchDetails } from "@/lib/workbox/repo";

export const instant = false;

export default async function BranchesPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const p = getProject(db, id);
  if (!p) return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;

  const branches = branchDetails(p.repoPath);

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <div className="wb-panel divide-y" style={{ borderColor: "var(--wb-border)" }}>
        {branches.length === 0 && <p className="p-4 wb-muted text-sm">No branches.</p>}
        {branches.map((b) => (
          <div key={b.name} className="flex items-center gap-3 px-4 py-3">
            <span className="wb-mono text-sm" style={{ color: b.current ? "var(--wb-accent)" : "var(--wb-text)" }}>
              {b.name}{b.current ? " (current)" : ""}
            </span>
            <span className="wb-chip wb-mono text-xs">{b.sha.slice(0, 8)}</span>
            {b.ahead > 0 && <span className="wb-chip" style={{ color: "var(--wb-open)" }}>{b.ahead} ahead</span>}
            {b.behind > 0 && <span className="wb-chip" title="commits on main not in this branch">{b.behind} behind</span>}
            <span className="wb-muted text-xs truncate hidden md:inline" title={b.subject}>{b.subject}</span>
            <span className="ml-auto wb-muted wb-mono text-xs">{b.when.slice(0, 10)}</span>
            <Link className="wb-chip" href={`/p/${id}/code?rev=${encodeURIComponent(b.name)}`}>browse</Link>
          </div>
        ))}
      </div>
      <p className="wb-muted text-xs mt-3">
        Divergence is measured against main. A proposal-able branch shows ahead ≥ 1 — the Proposals tab takes it from there.
      </p>
    </main>
  );
}
