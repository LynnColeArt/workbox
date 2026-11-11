// Proof run for the activity projection (HN-001..004).
process.env.WORKBOX_DB_PATH ??= "/home/lynn/projects/workbox/.workbox/index.db";
import { openDb } from "../src/lib/workbox/db";
import { recentProjects, listProjectRuntime } from "../src/lib/workbox/activity";

const db = openDb();
const runtime = listProjectRuntime(db);
const recent = recentProjects(db);
console.log(`indexed projects: ${runtime.length} | with qualifying activity: ${recent.length}`);
for (const r of recent.slice(0, 8)) {
  const when = r.latestAt.slice(0, 16).replace("T", " ");
  console.log(`  ${when} ${r.latestSource.padEnd(6)} ${r.name.slice(0, 24).padEnd(24)} git7=${r.gitLast7} hn7=${r.hubnotLast7}`);
}
// Spot HN-003: workbox-demo should NOT count its refs/hn commit chain.
const demo = recent.find((r) => r.id === "workbox-demo");
console.log(`\nworkbox-demo: latest=${demo?.latestAt.slice(0, 16)} git7=${demo?.gitLast7} hn7=${demo?.hubnotLast7}`);
