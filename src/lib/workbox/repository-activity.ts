import { spawnSync } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";
import { isHubnotProjectionVisible, readVisibleHubnotEvent, toIso, type ActivityCoverage } from "./activity";
import { activitySnapshot, parseDay, parsePage, utcDayRange, type ActivityChartModel } from "./activity-chart";
import { codeHref } from "./code-browser";
import { getProject } from "./queries";
import { isGitObjectId, isReachableCodeCommit, resolveCodeRevision, type CodeRevision } from "./repo";

const metrics = {
  commits: { label: "Commits", unit: "commits" },
  issues: { label: "Issue activity", unit: "issue events" },
  proposals: { label: "Proposal activity", unit: "proposal events" },
  ci: { label: "CI results", unit: "CI results" },
} as const;

type Metric = keyof typeof metrics;
type EventMetric = Exclude<Metric, "commits">;

export interface RepositoryActivityQuery {
  metric?: unknown;
  day?: unknown;
  activityPage?: unknown;
  snapshot?: unknown;
  rev?: unknown;
  at?: unknown;
}

interface Selection {
  metric: Metric;
  day: string | null;
  activityPage: number;
  rev: string | null;
  at: string | null;
}

interface RecordFields {
  id: string;
  kind: string;
  day: string;
  timestamp: string;
  label: string;
  detail: string;
  contextHref?: string;
}

interface ActivityRecord extends RecordFields {
  href: string;
  anchor: string;
}

interface ActivityScope {
  kind: "branch" | "repository";
  branch: string | null;
  commit: string | null;
}

export type RepositoryActivityRead =
  | { kind: "unavailable" | "stale"; href: string; reason: string }
  | {
    kind: "activity";
    chart: ActivityChartModel;
    selection: Selection;
    snapshot: string;
    href: string;
    coverage: ActivityCoverage;
    scope: ActivityScope;
    records: ActivityRecord[];
    total: number | null;
    totalPages: number;
    pageSize: 20;
    metrics: { metric: Metric; label: string; href: string }[];
    clearDayHref: string;
    pages: { page: number; href: string }[];
  };

const dayCount = 365;
const pageSize = 20;
const maxRecords = 10_000;
const maxVisibilityReads = 8;
const fullEventId = /^sha256:[0-9a-f]{64}$/;

function normalizedMetric(value: unknown): Metric {
  return value === "issues" || value === "proposals" || value === "ci" ? value : "commits";
}

function calendarHref(projectId: string, selection: Selection, snapshot?: string) {
  const base = codeHref(projectId, { rev: selection.rev, at: selection.at ?? undefined });
  const [path, search] = base.split("?");
  const params = new URLSearchParams(search);
  params.set("metric", selection.metric);
  if (selection.day) params.set("day", selection.day);
  if (selection.activityPage > 1) params.set("activityPage", String(selection.activityPage));
  if (snapshot) params.set("snapshot", snapshot);
  return `${path}?${params}`;
}

function gitOutput(repoPath: string, args: string[]): string | null {
  const result = spawnSync("git", ["--no-pager", "--no-replace-objects", "-C", repoPath, ...args], {
    encoding: "utf8",
    timeout: 3_000,
    maxBuffer: 8 * 1024 * 1024,
    killSignal: "SIGKILL",
    windowsHide: true,
    env: {
      ...process.env,
      LC_ALL: "C",
      GIT_NO_LAZY_FETCH: "1",
      GIT_ALLOW_PROTOCOL: "",
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_DIR: undefined,
      GIT_COMMON_DIR: undefined,
      GIT_WORK_TREE: undefined,
      GIT_INDEX_FILE: undefined,
      GIT_NAMESPACE: undefined,
      GIT_OBJECT_DIRECTORY: undefined,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
    },
  });
  return result.status === 0 && !result.error ? result.stdout : null;
}

function readCommits(projectId: string, repoPath: string, revision: CodeRevision | null, days: Set<string>) {
  const rows: RecordFields[] = [];
  let coverage: ActivityCoverage = "unavailable";
  if (!revision) return { rows, coverage };

  const firstDay = days.values().next().value;
  const output = gitOutput(repoPath, [
    "log", "-z", "--format=%H%x00%cI%x00%s%x00%an", `--max-count=${maxRecords + 1}`,
    `--since-as-filter=${firstDay}T00:00:00Z`, revision.commit, "--",
  ]);
  if (output === null) return { rows, coverage };

  const fields = output ? output.slice(0, -1).split("\0") : [];
  const count = fields.length / 4;
  const shallow = gitOutput(repoPath, ["rev-parse", "--is-shallow-repository"])?.trim();
  coverage = count > maxRecords || !Number.isInteger(count) || shallow !== "false" ? "partial" : "complete";
  for (let i = 0; i + 3 < fields.length && i / 4 < maxRecords; i += 4) {
    const [id, rawTimestamp, label, author] = fields.slice(i, i + 4);
    const timestamp = toIso(rawTimestamp);
    if (!isGitObjectId(id) || !timestamp) {
      coverage = "partial";
      continue;
    }
    const day = timestamp.slice(0, 10);
    if (!days.has(day)) continue;
    rows.push({
      id, kind: "commit", day, timestamp, label: label || "Untitled commit", detail: author,
      contextHref: codeHref(projectId, { rev: revision.branch, at: revision.commit, commit: id }),
    });
  }
  return { rows, coverage };
}

interface IndexedEvent {
  id: string;
  kind: string;
  subject: string | null;
  timestamp: string | null;
  actorName: string;
  issueId: string | null;
  candidateId: string | null;
}

const eventWhere: Record<EventMetric, string> = {
  issues: "substr(e.kind, 1, 6) = 'issue.'",
  proposals: `(substr(e.kind, 1, 9) = 'proposal.' OR e.kind = 'review.submit'
    OR ((substr(e.kind, 1, 9) = 'decision.' OR substr(e.kind, 1, 6) = 'merge.') AND candidate.event_id IS NOT NULL))`,
  ci: "e.kind = 'run.result'",
};

function indexedEvents(db: DatabaseSync, projectId: string, metric: EventMetric, start: string, end: string) {
  return db.prepare(`
    SELECT e.event_id AS id, e.kind, e.subject, e.timestamp,
      CASE WHEN json_valid(e.payload_json) THEN COALESCE(json_extract(e.payload_json, '$.actorName'), '') ELSE '' END AS actorName,
      issue.issue_id AS issueId, candidate.event_id AS candidateId
    FROM events e
    LEFT JOIN events request ON request.project_id = e.project_id AND request.verified = 1
      AND request.kind = 'run.request' AND e.kind = 'run.result' AND request.event_id = e.subject
    LEFT JOIN events candidate ON candidate.project_id = e.project_id AND candidate.verified = 1
      AND candidate.kind IN ('proposal.open', 'proposal.revise')
      AND candidate.event_id = CASE
        WHEN e.kind = 'run.result' THEN request.subject
        WHEN e.kind IN ('proposal.open', 'proposal.revise') THEN e.event_id
        ELSE e.subject END
    LEFT JOIN events opening ON opening.project_id = e.project_id AND opening.verified = 1
      AND opening.kind = 'issue.open'
      AND opening.event_id = CASE WHEN e.kind = 'issue.open' THEN e.event_id ELSE e.subject END
    LEFT JOIN issues issue ON issue.project_id = opening.project_id
      AND issue.issue_id = COALESCE(opening.subject, opening.event_id)
    WHERE e.project_id = ? AND e.verified = 1 AND ${eventWhere[metric]}
      AND (unixepoch(e.timestamp) IS NULL
        OR (unixepoch(e.timestamp) >= unixepoch(?) AND unixepoch(e.timestamp) < unixepoch(?, '+1 day')))
    ORDER BY unixepoch(e.timestamp) DESC NULLS LAST, e.event_id
    LIMIT ?`).all(projectId, start, end, maxRecords + 1) as unknown as IndexedEvent[];
}

const labels: Record<string, string> = {
  "issue.open": "Issue opened",
  "issue.revise": "Issue revised",
  "issue.comment": "Issue comment",
  "proposal.open": "Proposal opened",
  "proposal.revise": "Proposal revised",
  "proposal.decision": "Proposal decision",
  "proposal.merged": "Proposal merged",
  "review.submit": "Proposal review",
  "run.result": "CI result",
};

const nativeCandidateContexts = new Set([
  "proposal.open", "proposal.revise", "proposal.decision", "proposal.merged", "review.submit", "run.result",
]);

function eventContext(projectId: string, event: IndexedEvent, ordinary: boolean, subject: string | null) {
  const root = `/p/${encodeURIComponent(projectId)}`;
  if (ordinary && event.issueId && fullEventId.test(event.issueId)) {
    return `${root}/issue/${encodeURIComponent(event.issueId)}`;
  }
  const nativeContext = nativeCandidateContexts.has(event.kind) && subject === event.subject;
  if (event.candidateId && fullEventId.test(event.candidateId) && (ordinary || nativeContext)) {
    return `${root}/proposals/${encodeURIComponent(event.candidateId)}`;
  }
  return undefined;
}

function readEvents(projectId: string, repoPath: string, indexed: IndexedEvent[], days: Set<string>) {
  const rows: RecordFields[] = [];
  const ordinary = isHubnotProjectionVisible(repoPath);
  const limit = ordinary ? maxRecords : maxVisibilityReads;
  let complete = indexed.length <= limit;
  let resolved = 0;

  for (const hint of indexed.slice(0, limit)) {
    let timestamp = hint.timestamp;
    let actorName: unknown = hint.actorName;
    let subject = hint.subject;
    if (!ordinary) {
      const native = readVisibleHubnotEvent(repoPath, hint.id, hint.kind);
      if (native.kind === "unknown") complete = false;
      if (native.kind !== "visible") {
        if (native.kind === "denied") resolved++;
        continue;
      }
      resolved++;
      timestamp = native.event.timestamp;
      actorName = native.event.actorName;
      subject = native.event.subject ?? null;
    }

    const iso = toIso(timestamp ?? "");
    const day = iso.slice(0, 10);
    if (!fullEventId.test(hint.id) || !days.has(day)) {
      complete = false;
      continue;
    }
    const contextHref = eventContext(projectId, hint, ordinary, subject);
    rows.push({
      id: hint.id, kind: hint.kind, day, timestamp: iso,
      label: labels[hint.kind] ?? hint.kind,
      detail: typeof actorName === "string" ? actorName.slice(0, 256) : "",
      ...(contextHref ? { contextHref } : {}),
    });
  }
  const coverage: ActivityCoverage = !ordinary && resolved === 0 ? "unavailable" : complete ? "complete" : "partial";
  return { rows, coverage };
}

function readIndex(db: DatabaseSync, projectId: string, metric: Metric, start: string, end: string) {
  const ownTransaction = !db.isTransaction;
  if (ownTransaction) db.exec("BEGIN");
  try {
    const project = getProject(db, projectId);
    const events = project && metric !== "commits" ? indexedEvents(db, projectId, metric, start, end) : [];
    if (ownTransaction) db.exec("COMMIT");
    return { project, events };
  } catch (error) {
    if (ownTransaction && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function pageNumbers(current: number, total: number) {
  return [...new Set([1, current - 1, current, current + 1, total])]
    .filter((page) => page > 0 && page <= total).sort((a, b) => a - b);
}

export function readRepositoryActivity(
  db: DatabaseSync,
  projectId: string,
  query: RepositoryActivityQuery = {},
  now = new Date(),
): RepositoryActivityRead {
  const dates = utcDayRange(dayCount, now);
  const startDay = dates[0];
  const endDay = dates[dates.length - 1];
  const days = new Set(dates);
  const metric = normalizedMetric(query.metric);
  const { project, events } = readIndex(db, projectId, metric, startDay, endDay);
  if (!project) return { kind: "unavailable", href: codeHref(projectId), reason: "Project unavailable." };

  const defaultRevision = resolveCodeRevision(project.repoPath);
  const rev = typeof query.rev === "string" ? query.rev : undefined;
  const browsing = rev && rev !== defaultRevision?.branch ? resolveCodeRevision(project.repoPath, rev) : defaultRevision;
  const at = typeof query.at === "string" ? query.at : undefined;
  if ((rev && !browsing) || (at && (!browsing || !isReachableCodeCommit(project.repoPath, at, browsing.commit)))) {
    return { kind: "unavailable", href: codeHref(projectId), reason: "Selected Code revision unavailable." };
  }
  const day = parseDay(query.day);
  const selection: Selection = {
    metric, day: day && days.has(day) ? day : null, activityPage: parsePage(query.activityPage),
    rev: browsing?.branch ?? null, at: at ?? browsing?.commit ?? null,
  };

  const { rows, coverage } = metric === "commits"
    ? readCommits(projectId, project.repoPath, defaultRevision, days)
    : readEvents(projectId, project.repoPath, events, days);
  rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id));
  const scope: ActivityScope = metric === "commits"
    ? { kind: "branch", branch: defaultRevision?.branch ?? null, commit: defaultRevision?.commit ?? null }
    : { kind: "repository", branch: null, commit: null };
  const snapshot = activitySnapshot([projectId, metric, startDay, endDay, scope, coverage, rows]);
  if (query.snapshot !== undefined && query.snapshot !== snapshot) {
    return {
      kind: "stale", reason: "Repository activity changed. Refresh this selection.",
      href: calendarHref(projectId, { ...selection, activityPage: 1 }),
    };
  }

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.day, (counts.get(row.day) ?? 0) + 1);
  const selected = selection.day ? rows.filter((row) => row.day === selection.day) : [];
  const total = selection.day && (coverage === "complete" || selected.length > 0) ? selected.length : null;
  const totalPages = Math.ceil((total ?? 0) / pageSize);
  selection.activityPage = Math.min(selection.activityPage, Math.max(1, totalPages));
  const offset = (selection.activityPage - 1) * pageSize;
  const href = calendarHref(projectId, selection, snapshot);
  const records = selected.slice(offset, offset + pageSize).map((record): ActivityRecord => {
    const anchor = `activity-record-${activitySnapshot([record.kind, record.id])}`;
    return { ...record, anchor, href: record.kind === "commit" ? record.contextHref! : `${href}#${anchor}` };
  });

  const chart: ActivityChartModel = {
    kind: "calendar", title: "Repository activity", unit: metrics[metric].unit,
    timezone: "UTC", startDay, endDay, selectedDay: selection.day,
    buckets: dates.map((bucketDay) => {
      const count = counts.get(bucketDay);
      return {
        day: bucketDay, count: count ?? (coverage === "complete" ? 0 : null),
        ...(count !== undefined && coverage === "partial" ? { partial: true } : {}),
        href: calendarHref(projectId, { ...selection, day: bucketDay, activityPage: 1 }, snapshot),
      };
    }),
  };

  return {
    kind: "activity", chart, selection, snapshot, href, coverage, scope, records, total, totalPages, pageSize,
    metrics: (Object.keys(metrics) as Metric[]).map((choice) => ({
      metric: choice, label: metrics[choice].label,
      href: calendarHref(projectId, { ...selection, metric: choice, day: null, activityPage: 1 }),
    })),
    clearDayHref: calendarHref(projectId, { ...selection, day: null, activityPage: 1 }, snapshot),
    pages: pageNumbers(selection.activityPage, totalPages).map((page) => ({
      page, href: calendarHref(projectId, { ...selection, activityPage: page }, snapshot),
    })),
  };
}
