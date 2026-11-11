import { connection } from "next/server";
import Link from "next/link";
import { openDb } from "@/lib/workbox/db";
import { listProjects, recentActivity, instanceStats } from "@/lib/workbox/queries";
import { recentProjects } from "@/lib/workbox/activity";
import NewProjectForm from "@/components/new-project-form";

export const instant = false;

const DAY_MS = 86_400_000;

function bar(count: number, max: number): React.ReactNode {
  if (max <= 0) return null;
  const width = Math.max(4, Math.round((count / max) * 120));
  return <span className="inline-block h-2 rounded-full" style={{ width, background: "var(--wb-accent)" }} />;
}

export default async function Dashboard() {
  await connection();
  const db = openDb();
  const projects = listProjects(db);
  const stats = instanceStats(db);
  const feed = recentActivity(db, 12);
  const recents = recentProjects(db).slice(0, 10);
  const maxChart = Math.max(0, ...recents.map((r) => r.gitLast7 + r.hubnotLast7));
  const weekAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-baseline gap-3 mb-1">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link href="/explore" className="wb-link text-sm">Explore all projects →</Link>
      </div>
      <p className="wb-muted text-sm mb-6">
        {stats.projects} projects · {stats.events} events ({stats.verified} verified) · {stats.issues} issues · {stats.actors} identities
        {/* NFR-002: chart values duplicated as text below */}
      </p>

      {recents.length > 0 ? (
        <section className="mb-6">
          <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">
            Recently active · past 7 days <span className="wb-chip ml-2">since {weekAgo.slice(0, 10)}</span>
          </h2>
          <div className="wb-panel divide-y" style={{ borderColor: "var(--wb-border)" }}>
            {recents.map((r) => {
              const label =
                r.gitLast7 > 0 && r.hubnotLast7 > 0
                  ? `${r.gitLast7} commits · ${r.hubnotLast7} signed events`
                  : r.gitLast7 > 0 ? `${r.gitLast7} commits` : `${r.hubnotLast7} signed events`;
              return (
                <div key={r.id} className="px-4 py-2.5 flex flex-wrap items-center gap-3">
                  <a href={`/p/${r.id}`} className="text-sm font-medium" style={{ color: "var(--wb-link)" }}>{r.name}</a>
                  <span className="hidden sm:flex items-center gap-2 text-xs wb-muted">
                    {bar(r.gitLast7 + r.hubnotLast7, maxChart)}
                  </span>
                  <span className="ml-auto wb-muted text-xs">{label}</span>
                  <span className="wb-muted text-xs wb-mono">{r.latestAt.slice(0, 10)}</span>
                </div>
              );
            })}
          </div>
          <p className="wb-muted text-xs mt-1">
            {recents.map((r) => `${r.name}: ${r.gitLast7}+${r.hubnotLast7}`).join(" · ")}
          </p>
        </section>
      ) : (
        <div className="wb-panel p-4 mb-6">
          <p className="wb-muted text-sm">No qualifying activity yet.</p>
          <p className="wb-muted text-xs mt-1">Activity comes from local Git commits and verified signed Hubnot events. <Link href="/explore" className="wb-link">Explore projects →</Link></p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <section>
          <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">What&apos;s happening</h2>
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

      <div className="mt-6" style={{ maxWidth: 480 }}>
        <NewProjectForm />
      </div>
    </main>
  );
}
