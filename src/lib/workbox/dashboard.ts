import type { DatabaseSync } from "node:sqlite";
import { activitySnapshot } from "./activity-chart";
import {
  collectRecentProjectActivity, listProjectRuntime, readIndexedHubnotActivity, toIso,
  type ActivityCoverage, type RecentActivityCoverage, type RecentProject,
} from "./activity";
import { instanceStats, recentActivity } from "./queries";

const dayMilliseconds = 86_400_000;
const projectLimit = 10;
const feedLimit = 12;

const visualSources = {
  git: { label: "Git commits", color: "#3fb950" },
  hubnot: { label: "Verified Hubnot events", color: "#4493f8" },
} as const;

type CoverageCounts = Record<ActivityCoverage, number>;

export interface DashboardProject {
  id: string;
  name: string;
  href: string;
  latestAt: string;
  latestSource: RecentProject["latestSource"];
  latestSummary: string;
  gitCount: number | null;
  hubnotCount: number | null;
  observedTotal: number;
  coverage: RecentActivityCoverage;
}

export interface DashboardFeedEntry {
  id: string;
  projectId: string;
  projectName: string;
  kind: string;
  actorName: string;
  summary: string;
  timestamp: string | null;
  href: string;
}

export interface DashboardRead {
  window: { start: string; end: string; timezone: "UTC" };
  summary: ReturnType<typeof instanceStats>;
  feed: DashboardFeedEntry[];
  projects: DashboardProject[];
  coverage: { state: ActivityCoverage; git: CoverageCounts; hubnot: CoverageCounts };
  state: "active" | "quiet" | "empty" | "incomplete";
  visual: { title: string; maxCount: number; sources: typeof visualSources };
  exploreHref: string;
}

function projectHref(id: string) {
  return `/p/${encodeURIComponent(id)}`;
}

function readIndex(db: DatabaseSync) {
  const ownTransaction = !db.isTransaction;
  if (ownTransaction) db.exec("BEGIN");
  try {
    const summary = instanceStats(db);
    const feed = recentActivity(db, feedLimit);
    const runtimes = listProjectRuntime(db);
    const events = readIndexedHubnotActivity(db, runtimes.map(({ id }) => id));
    if (ownTransaction) db.exec("COMMIT");
    return { summary, feed, runtimes, events };
  } catch (error) {
    if (ownTransaction && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function summarizeCoverage(coverage: Iterable<RecentActivityCoverage>): DashboardRead["coverage"] {
  const git = { complete: 0, partial: 0, unavailable: 0 };
  const hubnot = { complete: 0, partial: 0, unavailable: 0 };
  for (const row of coverage) {
    git[row.git]++;
    hubnot[row.hubnot]++;
  }
  const incomplete = git.partial + git.unavailable + hubnot.partial + hubnot.unavailable;
  const unavailable = git.unavailable + hubnot.unavailable;
  const state = incomplete === 0 ? "complete"
    : unavailable === incomplete && git.complete + hubnot.complete === 0 ? "unavailable" : "partial";
  return { state, git, hubnot };
}

function publicCount(observed: number, coverage: ActivityCoverage) {
  return observed > 0 || coverage === "complete" ? observed : null;
}

export function readDashboard(db: DatabaseSync, now = new Date()): DashboardRead {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 7 * dayMilliseconds).toISOString();
  const { summary, feed, runtimes, events } = readIndex(db);
  const snapshot = collectRecentProjectActivity(runtimes, events, start, end);
  const coverage = summarizeCoverage(snapshot.coverage.values());
  const projects = snapshot.ranked.slice(0, projectLimit).map((project): DashboardProject => {
    const projectCoverage = snapshot.coverage.get(project.id)!;
    return {
      id: project.id,
      name: project.name,
      href: projectHref(project.id),
      latestAt: project.latestAt,
      latestSource: project.latestSource,
      latestSummary: project.latestSummary,
      gitCount: publicCount(project.gitLast7, projectCoverage.git),
      hubnotCount: publicCount(project.hubnotLast7, projectCoverage.hubnot),
      observedTotal: project.gitLast7 + project.hubnotLast7,
      coverage: projectCoverage,
    };
  });
  const maxCount = Math.max(0, ...projects.map((project) => project.observedTotal));
  const state = coverage.state !== "complete" ? "incomplete"
    : maxCount > 0 ? "active" : projects.length ? "quiet" : "empty";

  return {
    window: { start, end, timezone: "UTC" },
    summary,
    feed: feed.map((entry) => ({
      id: activitySnapshot([entry.projectId, entry.eventId]),
      projectId: entry.projectId,
      projectName: entry.projectName,
      kind: entry.kind,
      actorName: entry.actorName,
      summary: entry.summary,
      timestamp: toIso(entry.timestamp ?? "") || null,
      href: projectHref(entry.projectId),
    })),
    projects,
    coverage,
    state,
    visual: { title: "Projects last 7 days", maxCount, sources: visualSources },
    exploreHref: "/explore",
  };
}
