import { connection } from "next/server";
import Link from "next/link";
import { openDb } from "@/lib/workbox/db";
import { recentProjects } from "@/lib/workbox/activity";

export const instant = false;

/**
 * Explore: every indexed project (FR-003). Default order = recent activity,
 * actives first, then never-active in A–Z; header search filters by name
 * (case-insensitive, per spec); A–Z toggle reorders everything alphabetically.
 */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  await connection();
  const { q: rawQuery, sort: rawSort } = await searchParams;
  const db = openDb();
  const all = recentProjects(db); // ranked; projects without activity follow A–Z
  const q = (rawQuery ?? "").trim().toLowerCase();
  const sort = rawSort === "alpha" ? "alpha" : "recent";

  let rows = all;
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  if (sort === "alpha") {
    rows = [...rows].sort((a, b) =>
      a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  } else {
    rows = [...rows].sort((a, b) =>
      b.latestAt.localeCompare(a.latestAt) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  const neverActive = all.length === 0 ? true : rows.length === 0 && all.length > 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl font-semibold">Explore</h1>
        <span className="wb-chip">{rows.length} project{rows.length === 1 ? "" : "s"}</span>
        <nav className="ml-auto flex gap-2 text-sm">
          <Link href={`/explore${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={sort === "recent" ? "wb-chip" : "wb-chip"}
                style={sort === "recent" ? { borderColor: "var(--wb-accent)", color: "var(--wb-accent)" } : undefined}>
            Recent activity
          </Link>
          <Link href={`/explore?sort=alpha${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="wb-chip"
                style={sort === "alpha" ? { borderColor: "var(--wb-accent)", color: "var(--wb-accent)" } : undefined}>
            A–Z
          </Link>
        </nav>
      </div>

      <form action="/explore" method="get" className="mb-4 flex gap-2">
        {sort === "alpha" && <input type="hidden" name="sort" value="alpha" />}
        <input name="q" defaultValue={q} placeholder="Search project name…"
               className="flex-1 text-sm px-3 py-2 rounded border bg-transparent" style={{ borderColor: "var(--wb-border)" }} />
        <button type="submit" className="wb-btn">Search</button>
      </form>

      {neverActive && (
        <div className="wb-panel p-4 mb-4">
          <p className="wb-muted text-sm">No projects match “{q}”.</p>
          <p className="wb-muted text-xs mt-1"><Link href="/explore" className="wb-link">Clear search</Link> to see all indexed projects.</p>
        </div>
      )}

      <div className="wb-panel divide-y" style={{ borderColor: "var(--wb-border)" }}>
        {rows.map((r) => (
          <a key={r.id} href={`/p/${r.id}`} className="block px-4 py-3 hover:bg-white/5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium" style={{ color: "var(--wb-link)" }}>{r.name}</span>
              <span className="wb-chip wb-mono text-xs ml-auto">{r.latestSource === "git" ? "git" : "hubnot"}</span>
            </div>
            {r.description && <div className="wb-muted text-xs mt-0.5 truncate">{r.description}</div>}
            <div className="wb-muted text-xs mt-1">
              last activity {r.latestAt.slice(0, 16).replace("T", " ")} — {r.latestSummary}
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}
