import { openDb } from "@/lib/workbox/db";
import { connection } from "next/server";
import { instanceStats, listProjects, recentActivity } from "@/lib/workbox/queries";
import NewProjectForm from "@/components/new-project-form";

// Node runtime: file-based SQLite and filesystem access.
// Always fresh — the underlying repos change outside Next's control.

export const instant = false;

export default async function Dashboard() {
  await connection();
  const db = openDb();
  const projects = listProjects(db);
  const stats = instanceStats(db);
  const feed = recentActivity(db, 12);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-semibold mb-1">Dashboard</h1>
      <p className="wb-muted text-sm mb-6">
        {stats.projects} projects · {stats.events} events ({stats.verified} verified) · {stats.issues} issues · {stats.actors} identities
      </p>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <section>
          <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">What's happening</h2>
          <div className="wb-panel divide-y" style={{ borderColor: "var(--wb-border)" }}>
            {feed.length === 0 && (
              <p className="p-4 wb-muted text-sm">Nothing yet — run the indexer after signing some facts.</p>
            )}
            {feed.map((e) => (
              <div key={e.eventId} className="flex items-start gap-3 px-4 py-3">
                <span className="wb-chip wb-mono mt-0.5">{e.kind}</span>
                <div className="text-sm">
                  <span className="font-medium">{e.actorName}</span>{" "}
                  <span className="wb-muted">{e.summary}</span>{" "}
                  <span className="wb-muted">in</span>{" "}
                  <a href={`/p/${e.projectId}`} className="wb-link">{e.projectName}</a>
                </div>
                <div className="ml-auto wb-muted text-xs whitespace-nowrap">
                  {e.timestamp ? new Date(e.timestamp).toISOString().slice(0, 16).replace("T", " ") : ""}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside>
          <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Projects</h2>
          <div className="wb-panel divide-y" style={{ borderColor: "var(--wb-border)" }}>
            {projects.map((p) => (
              <a key={p.id} href={`/p/${p.id}`} className="block px-4 py-3 hover:bg-white/5">
                <div className="text-sm font-medium" style={{ color: "var(--wb-link)" }}>{p.name}</div>
                <div className="wb-muted text-xs line-clamp-2">{p.description}</div>
              </a>
            ))}
            {projects.length === 0 && <p className="p-4 wb-muted text-sm">No projects indexed yet.</p>}
          </div>
        </aside>
      </div>
    </main>
  );
}
