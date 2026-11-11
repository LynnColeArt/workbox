import { NextResponse } from "next/server";
import { discoverProjects, defaultOverrides } from "@/lib/workbox/discover";
import { openDb } from "@/lib/workbox/db";
import { fullIndex } from "@/lib/workbox/index";


export async function POST() {
  const overrides = defaultOverrides();
  const discovered = discoverProjects(overrides);
  const db = openDb();
  const outcomes = fullIndex(db, discovered.map((p) => ({
    id: p.id,
    name: overrides.meta[p.id]?.name ?? p.name,
    description: overrides.meta[p.id]?.description ?? "",
    repoPath: p.repoPath,
  })));
  const summary = discovered.map((p, i) => ({
    project: p.id,
    events: outcomes[i].events,
    verified: outcomes[i].verified,
    unverified: outcomes[i].unverified,
    issues: outcomes[i].issues,
    errors: outcomes[i].errors,
  }));
  return NextResponse.json({ ok: true, data: summary });
}
