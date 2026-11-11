import { connection } from "next/server";
import Link from "next/link";
import { openDb } from "@/lib/workbox/db";
import { getProject } from "@/lib/workbox/queries";
import { listPipelines } from "@/lib/workbox/ci";

export const instant = false;

const TABS = [
  { key: "code", label: "Code" },
  { key: "issues", label: "Issues" },
  { key: "proposals", label: "Proposals" },
  { key: "memories", label: "Memory" },
  { key: "ci", label: "CI" },
  { key: "discussions", label: "Discussions" },
  { key: "insights", label: "Insights" },
] as const;

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const p = getProject(db, id);
  if (!p) {
    return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;
  }

  const openIssues = Number(
    (db.prepare("SELECT COUNT(*) AS n FROM issues WHERE project_id = ? AND status = 'open'").get(id) as { n: number }).n);
  const memoryCount = Number(
    (db.prepare("SELECT COUNT(*) AS n FROM memories WHERE project_id = ?").get(id) as { n: number }).n);
  const pipelines = listPipelines(p.repoPath);

  return (
    <div>
      <main className="mx-auto max-w-6xl px-4 pt-6">
        <div className="mb-1 wb-muted text-sm">
          <Link href="/" className="wb-link">Workbox</Link> / {p.name}
        </div>
        <h1 className="text-xl font-semibold">{p.name}</h1>
        <p className="wb-muted text-sm mb-4">{p.description}</p>
        <nav className="flex gap-1 border-b" style={{ borderColor: "var(--wb-border)" }}>
          {TABS.map((t) => {
            const href = `/p/${id}/${t.key}`;
            const badge =
              t.key === "issues" ? (openIssues > 0 ? String(openIssues) : null)
              : t.key === "memories" ? (memoryCount > 0 ? String(memoryCount) : null)
              : t.key === "ci" ? (pipelines.length > 0 ? String(pipelines.length) : null)
              : null;
            return (
              <Link key={t.key} href={href} className="px-3 py-2 text-sm wb-muted hover:text-white"
                    style={{ borderBottom: "2px solid transparent" }}>
                {t.label}
                {badge && <span className="wb-chip ml-2 !py-0">{badge}</span>}
              </Link>
            );
          })}
        </nav>
      </main>
      {children}
    </div>
  );
}
