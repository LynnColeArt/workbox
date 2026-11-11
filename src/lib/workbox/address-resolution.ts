import type { DatabaseSync } from "node:sqlite";
import type { WorkboxAddress } from "./address";
import { getProject } from "./queries";

type IssueAddress = Extract<WorkboxAddress, { kind: "issue" }>;
type ResolvedWorkboxAddress =
  | Exclude<WorkboxAddress, IssueAddress>
  | (IssueAddress & { issueId: string });

type ResolveResult =
  | { ok: true; target: ResolvedWorkboxAddress }
  | { ok: false; error: "target_not_found" };

const notFound = { ok: false, error: "target_not_found" } as const;

// Callers own access and view availability checks. This resolves indexed identity.
export function resolveWorkboxAddress(db: DatabaseSync, target: WorkboxAddress): ResolveResult {
  if (!("projectSlug" in target)) return { ok: true, target };
  if (!getProject(db, target.projectSlug)) return notFound;
  if (target.kind !== "issue") return { ok: true, target };

  const matches = db.prepare(
    "SELECT issue_id AS issueId FROM issues WHERE project_id = ? AND number = ? LIMIT 2",
  ).all(target.projectSlug, target.issueNumber) as Array<{ issueId: string }>;

  // An ambiguous number cannot identify one issue.
  if (matches.length !== 1) return notFound;
  return { ok: true, target: { ...target, issueId: matches[0].issueId } };
}
