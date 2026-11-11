export type WorkboxAddress =
  | { kind: "home" }
  | { kind: "projectDirectory" }
  | { kind: "project"; projectSlug: string }
  | { kind: "issue"; projectSlug: string; issueNumber: number }
  | { kind: "memory"; projectSlug: string }
  | { kind: "pipelines"; projectSlug: string }
  | { kind: "trending" };

type ParseResult =
  | { ok: true; target: WorkboxAddress }
  | { ok: false; error: "malformed_address" };

const prefix = "workbox://";
const malformed = { ok: false, error: "malformed_address" } as const;

function isProjectSlug(value: string | undefined): value is string {
  return !!value && value !== "." && value !== ".." && !/[^A-Za-z0-9._-]/.test(value);
}

function isIssueNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function parseWorkboxAddress(address: string): ParseResult {
  if (!address.startsWith(prefix)) return malformed;

  // Split the raw spelling so URL normalization cannot hide traversal or escaping.
  const end = address.endsWith("/") ? -1 : undefined;
  const segments = address.slice(prefix.length, end).split("/");
  const [root, projectSlug, resource, issue] = segments;
  if (segments.length === 1) {
    if (root === "home") return { ok: true, target: { kind: "home" } };
    if (root === "projects") return { ok: true, target: { kind: "projectDirectory" } };
    if (root === "trending") return { ok: true, target: { kind: "trending" } };
    return malformed;
  }

  if ((root !== "project" && root !== "projects") || !isProjectSlug(projectSlug)) {
    return malformed;
  }

  if (segments.length === 2) return { ok: true, target: { kind: "project", projectSlug } };
  if (segments.length === 3 && resource === "memory") {
    return { ok: true, target: { kind: "memory", projectSlug } };
  }
  if (segments.length === 3 && resource === "pipelines") {
    return { ok: true, target: { kind: "pipelines", projectSlug } };
  }
  if (segments.length === 4 && resource === "task" && issue.startsWith("WP-")) {
    const digits = issue.slice(3);
    if (!digits || /[^0-9]/.test(digits)) return malformed;
    const issueNumber = Number(digits);
    if (isIssueNumber(issueNumber)) {
      return { ok: true, target: { kind: "issue", projectSlug, issueNumber } };
    }
  }

  return malformed;
}

// Catalog IDs come from directory names and may not fit the address grammar.
export function formatWorkboxAddress(target: WorkboxAddress): string | null {
  if ("projectSlug" in target && !isProjectSlug(target.projectSlug)) return null;
  if (target.kind === "issue" && !isIssueNumber(target.issueNumber)) return null;

  switch (target.kind) {
    case "home": return "workbox://home";
    case "projectDirectory": return "workbox://projects/";
    case "project": return `workbox://projects/${target.projectSlug}/`;
    case "issue": return `workbox://projects/${target.projectSlug}/task/WP-${target.issueNumber}`;
    case "memory": return `workbox://projects/${target.projectSlug}/memory`;
    case "pipelines": return `workbox://projects/${target.projectSlug}/pipelines`;
    case "trending": return "workbox://trending";
  }
}
