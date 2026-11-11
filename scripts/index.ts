// Proof run: discover hubnot repos under the projects root, index every
// event chain with full verification, and print the read model's view.
// Run: WORKBOX_DB_PATH=/tmp/wb-proof.db npx tsx scripts/index.ts
// (or: node --experimental-strip-types scripts/index.ts)
import { discoverProjects, defaultOverrides } from "../src/lib/workbox/discover.ts";
import { openDb } from "../src/lib/workbox/db.ts";
import { fullIndex } from "../src/lib/workbox/index.ts";

const overrides = defaultOverrides();
const discovered = discoverProjects(overrides);

console.log(`discovered ${discovered.length} hubnot project(s) under ${process.env.WORKBOX_PROJECTS_ROOT ?? "~/projects"}`);
for (const p of discovered) console.log(`  - ${p.id} (${p.actorCount} actor chain(s))`);

const db = openDb();
const outcomes = fullIndex(db, discovered.map((p) => ({
  id: p.id,
  name: overrides.meta[p.id]?.name ?? p.name,
  description: overrides.meta[p.id]?.description ?? "",
  repoPath: p.repoPath,
})));

let totalEvents = 0;
let totalVerified = 0;
for (const [i, o] of outcomes.entries()) {
  totalEvents += o.events;
  totalVerified += o.verified;
  console.log(`[${discovered[i].id}] events=${o.events} verified=${o.verified} unverified=${o.unverified} issues=${o.issues}`);
  for (const e of o.errors) console.log(`  ! ${e}`);
}
console.log(`TOTAL: ${totalEvents} events, ${totalVerified} verified`);

console.log("\n=== read model: issues ===");
const issues = db.prepare(`
  SELECT p.name AS project, i.title, i.status, i.conflict, i.creator,
         (SELECT COUNT(*) FROM issue_comments c WHERE c.project_id = i.project_id AND c.issue_id = i.issue_id) AS comments
  FROM issues i JOIN projects p ON p.id = i.project_id
  ORDER BY p.name, i.created_at`).all();
for (const r of issues) {
  const row = r as { project: string; title: string; status: string; conflict: number; comments: number };
  console.log(`  [${row.project}] ${row.status === "open" ? "●" : "✔"} ${row.title} (${row.comments} comment(s))${row.conflict ? " CONFLICTED" : ""}`);
}

console.log("\n=== read model: actors ===");
const actors = db.prepare("SELECT p.name AS project, a.display_name, a.event_count FROM actors a JOIN projects p ON p.id = a.project_id").all();
for (const a of actors) {
  const r = a as { project: string; display_name: string; event_count: number };
  console.log(`  [${r.project}] ${r.display_name}: ${r.event_count} verified event(s)`);
}

console.log("\n=== live front page feed (latest 8) ===");
const feed = db.prepare(`
  SELECT a.kind, a.actor_name, a.summary, a.timestamp, p.name AS project
  FROM activity a JOIN projects p ON p.id = a.project_id
  ORDER BY a.timestamp DESC LIMIT 8`).all();
for (const f of feed) {
  const r = f as { kind: string; actor_name: string; summary: string; timestamp: string; project: string };
  console.log(`  ${r.timestamp?.slice(0, 16)} [${r.project}] ${r.actor_name} ${r.summary} (${r.kind})`);
}

console.log("\n=== integrity spot-check: any unverified rows? ===");
const bad = db.prepare("SELECT COUNT(*) AS n FROM events WHERE verified = 0").get() as { n: number };
console.log(bad.n === 0 ? "none — every indexed event verified" : `${bad.n} UNVERIFIED events present`);
