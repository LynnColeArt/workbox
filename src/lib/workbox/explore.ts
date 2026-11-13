import { workboxPageSize } from "./list-settings";
import type { DatabaseSync } from "node:sqlite";
import {
  collectHubnotActivity, createHubnotActivityBudget, listProjectRuntime,
  readGitActivity, readIndexedHubnotActivity, type ActivityRecord,
} from "./activity";
import { activitySnapshot, parseDay, parsePage, utcDayRange, type ActivityChartModel } from "./activity-chart";

export interface ExploreQuery {
  q?: unknown;
  sort?: unknown;
  page?: unknown;
  day?: unknown;
  snapshot?: unknown;
}

export interface ExploreSelection {
  q: string;
  sort: "recent" | "alpha";
  page: number;
  day: string | null;
}

export interface ExploreProject {
  id: string;
  name: string;
  description: string;
  href: string;
  latestAt: string | null;
  latestSource: ActivityRecord["type"] | null;
  latestSummary: string | null;
  sources: ActivityRecord["type"][];
}

interface ExploreCoverage {
  git: { complete: number; partial: number; unavailable: number };
  hubnot: { complete: number; partial: number; unavailable: number };
}

interface ExploreResult {
  selection: ExploreSelection;
  snapshot: string;
  href: string;
  refreshHref: string;
  coverage: ExploreCoverage;
  chart: ActivityChartModel;
  pageSize: number;
}

export type ExploreRead = ExploreResult & (
  | { stale: false; projects: ExploreProject[]; total: number; totalPages: number }
  | { stale: true; projects: []; total: null; totalPages: null }
);

const sources = ["git", "hubnot"] as const;
const nameOrder = new Intl.Collator("en", { sensitivity: "base" });

export function exploreHref({ q, sort, page, day }: ExploreSelection, snapshot?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort === "alpha") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  if (day) params.set("day", day);
  if (snapshot) params.set("snapshot", snapshot);
  return params.size ? `/explore?${params}` : "/explore";
}

function normalizeSelection(query: ExploreQuery, days: string[]): ExploreSelection {
  const day = parseDay(query.day);
  return {
    q: typeof query.q === "string" ? query.q.trim().toLowerCase() : "",
    sort: query.sort === "alpha" ? "alpha" : "recent",
    page: parsePage(query.page),
    day: day && days.includes(day) ? day : null,
  };
}

function indexSnapshot(db: DatabaseSync, q: string) {
  const ownTransaction = !db.isTransaction;
  if (ownTransaction) db.exec("BEGIN");
  try {
    const projects = listProjectRuntime(db).filter(({ id, name }) =>
      id.toLowerCase().includes(q) || name.toLowerCase().includes(q));
    const events = readIndexedHubnotActivity(db, projects.map(({ id }) => id));
    if (ownTransaction) db.exec("COMMIT");
    return { projects, events };
  } catch (error) {
    if (ownTransaction && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareRecords(a: ActivityRecord, b: ActivityRecord) {
  return byId(b.ts, a.ts) || byId(b.type, a.type) || byId(a.id, b.id);
}

export function readExplore(db: DatabaseSync, query: ExploreQuery = {}, now = new Date()): ExploreRead {
  const pageSize = workboxPageSize();
  const days = utcDayRange(7, now);
  const startDay = days[0];
  const endDay = days[days.length - 1];
  const selection = normalizeSelection(query, days);
  const { projects, events } = indexSnapshot(db, selection.q);
  const counts = new Map(days.map((day) => [day, 0]));
  const coverage: ExploreCoverage = {
    git: { complete: 0, partial: 0, unavailable: 0 },
    hubnot: { complete: 0, partial: 0, unavailable: 0 },
  };
  const catalog: ExploreProject[] = [];
  const fingerprint = [];
  const budget = createHubnotActivityBudget();

  for (const project of projects.sort((a, b) => byId(a.id, b.id))) {
    const git = readGitActivity(project.repoPath);
    coverage.git[git.coverage]++;
    const hubnot = collectHubnotActivity(project.repoPath, events.get(project.id) ?? [], budget);
    coverage.hubnot[hubnot.coverage]++;
    const records = [...git.rows, ...hubnot.rows].sort(compareRecords);
    const activeDays = new Set(records.map(({ ts }) => ts.slice(0, 10)).filter((day) => counts.has(day)));
    for (const day of activeDays) counts.set(day, counts.get(day)! + 1);

    const { id, name, description } = project;
    fingerprint.push([
      id, name, description, git.coverage, hubnot.coverage,
      records.map(({ type, id, ts, summary }) => [type, id, ts, summary]),
    ]);
    if (selection.day && !activeDays.has(selection.day)) continue;
    const relevant = selection.day ? records.filter(({ ts }) => ts.startsWith(selection.day!)) : records;
    const latest = relevant[0];
    catalog.push({
      id, name, description, href: `/p/${encodeURIComponent(id)}`,
      latestAt: latest?.ts ?? null,
      latestSource: latest?.type ?? null,
      latestSummary: latest?.summary ?? null,
      sources: sources.filter((source) => relevant.some(({ type }) => type === source)),
    });
  }

  const snapshot = activitySnapshot([selection.q, startDay, endDay, fingerprint]);
  const stale = query.snapshot !== undefined && query.snapshot !== snapshot;
  const partial = coverage.git.partial > 0 || coverage.git.unavailable > 0 ||
    coverage.hubnot.partial > 0 || coverage.hubnot.unavailable > 0;
  const chart: ActivityChartModel = {
    kind: "line", title: "Active projects", unit: "projects", timezone: "UTC",
    startDay, endDay, selectedDay: selection.day,
    buckets: days.map((day) => {
      const observed = counts.get(day)!;
      return {
        day,
        count: observed || (partial ? null : 0),
        href: exploreHref({ ...selection, page: 1, day }, snapshot),
        ...(partial ? { partial: true } : {}),
      };
    }),
  };
  const total = catalog.length;
  const totalPages = Math.ceil(total / pageSize);
  if (!stale) selection.page = Math.min(selection.page, Math.max(totalPages, 1));
  const refreshHref = exploreHref({ ...selection, page: 1 }, snapshot);
  const result: ExploreResult = {
    selection, snapshot, coverage, chart, refreshHref, pageSize,
    href: stale ? refreshHref : exploreHref(selection, snapshot),
  };
  if (stale) return { ...result, stale: true, projects: [], total: null, totalPages: null };
  catalog.sort((a, b) =>
    (selection.sort === "recent" ? byId(b.latestAt ?? "", a.latestAt ?? "") : 0) ||
    nameOrder.compare(a.name, b.name) || byId(a.id, b.id));
  const start = (selection.page - 1) * pageSize;
  return { ...result, stale: false, projects: catalog.slice(start, start + pageSize), total, totalPages };
}
