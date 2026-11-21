export interface WorkboxExploreQuery {
  q?: string;
  sort?: "recent" | "alpha";
  page?: number;
  day?: string;
  snapshot?: string;
}

export interface WorkboxCodeQuery {
  rev?: string;
  at?: string;
  path?: string;
  commit?: string;
}

export type WorkboxAddressTarget =
  | { kind: "dashboard"; uri: string; href: string }
  | { kind: "explore"; uri: string; href: string; query: WorkboxExploreQuery }
  | { kind: "project"; uri: string; href: string; projectId: string }
  | { kind: "code"; uri: string; href: string; projectId: string; query: WorkboxCodeQuery }
  | { kind: "issues"; uri: string; href: string; projectId: string }
  | { kind: "issue"; uri: string; href: string; projectId: string; selector: string; cursor?: string }
  | { kind: "proposals"; uri: string; href: string; projectId: string }
  | { kind: "proposal"; uri: string; href: string; projectId: string; candidateId: string; mode: "exact" | "lineage" };

export interface WorkboxAddressError {
  code: string;
  message: string;
}

export type ParseResult =
  | { ok: true; target: WorkboxAddressTarget }
  | { ok: false; error: WorkboxAddressError };

const PROJECT_ID = /^[A-Za-z0-9._-]+$/;
const PROPOSAL_ID = /^(?:sha256:)?([a-f0-9]{64})$/;

function ok(target: WorkboxAddressTarget): ParseResult {
  return { ok: true, target };
}

function fail(code: string, message: string): ParseResult {
  return { ok: false, error: { code, message } };
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function queryString(entries: Record<string, string | number | undefined>, preserveEmptyKey?: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || (value === "" && key !== preserveEmptyKey)) continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function codeHref(projectId: string, query: WorkboxCodeQuery): string {
  return `/p/${encodeURIComponent(projectId)}/code${queryString({ rev: query.rev, at: query.at, path: query.path, commit: query.commit })}`;
}

function codeUri(projectId: string, query: WorkboxCodeQuery): string {
  return `workbox://project/${projectId}/code${queryString({ rev: query.rev, at: query.at, path: query.path, commit: query.commit })}`;
}

function issueAddress(projectId: string, selector: string, query: URLSearchParams): ParseResult {
  const unknown = unknownQueryKey(query, ["cursor"]);
  if (unknown) return fail("invalid_address", `Unsupported issue parameter '${unknown}'.`);
  const cursor = query.get("cursor") || undefined;
  const suffix = queryString({ cursor });
  return ok({
    kind: "issue", projectId, selector,
    ...(cursor === undefined ? {} : { cursor }),
    uri: `workbox://project/${projectId}/issues/${selector}${suffix}`,
    href: `/p/${encodeURIComponent(projectId)}/issue/${encodeURIComponent(selector)}${suffix}`,
  });
}

function proposalHref(projectId: string, candidateId: string, mode: "exact" | "lineage"): string {
  const suffix = mode === "lineage" ? "?mode=lineage" : "";
  return `/p/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(candidateId)}${suffix}`;
}

function proposalUri(projectId: string, candidateId: string, mode: "exact" | "lineage"): string {
  const suffix = mode === "lineage" ? "?mode=lineage" : "";
  return `workbox://project/${projectId}/proposals/${candidateId}${suffix}`;
}

function issueSelector(value: string): string | null {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return String(number);
}

function unknownQueryKey(query: URLSearchParams, allowed: string[]): string | null {
  const keys = new Set(allowed);
  for (const key of query.keys()) {
    if (!keys.has(key)) return key;
  }
  return null;
}

/**
 * Parse a workbox:// address into a canonical browser target. Parsing never
 * reads collaboration records; it only maps the address onto the current
 * browser routes and the native read services that back them.
 */
export function parseWorkboxAddress(input: string): ParseResult {
  const raw = input.trim();
  if (!raw) return fail("invalid_address", "Provide a workbox:// address.");
  const scheme = /^workbox:/i.exec(raw);
  if (!scheme) return fail("invalid_scheme", "Address must start with workbox://.");
  let rest = raw.slice(scheme[0].length);
  if (!rest.startsWith("//")) return fail("invalid_address", "Address must start with workbox://.");
  rest = rest.slice(2);

  const hashIndex = rest.indexOf("#");
  if (hashIndex >= 0) rest = rest.slice(0, hashIndex);
  const queryIndex = rest.indexOf("?");
  const pathText = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
  const queryText = queryIndex >= 0 ? rest.slice(queryIndex + 1) : "";
  let query: URLSearchParams;
  try {
    query = new URLSearchParams(queryText);
  } catch {
    return fail("invalid_address", "Address query is invalid.");
  }

  const segments: string[] = [];
  for (const segment of pathText.split("/").filter((part) => part.length > 0)) {
    const decoded = decodeSegment(segment);
    if (decoded === null) return fail("invalid_address", "Address contains invalid percent-encoding.");
    segments.push(decoded);
  }

  if (segments.length === 0 || (segments.length === 1 && segments[0] === "dashboard")) {
    if (query.toString()) return fail("invalid_address", "Dashboard addresses do not accept query parameters.");
    return ok({ kind: "dashboard", uri: "workbox://dashboard", href: "/" });
  }

  if (segments.length === 1 && segments[0] === "explore") {
    const unknown = unknownQueryKey(query, ["q", "sort", "page", "day", "snapshot"]);
    if (unknown) return fail("invalid_address", `Unsupported explore parameter '${unknown}'.`);
    const q = query.get("q")?.trim() || undefined;
    const sortRaw = query.get("sort");
    if (sortRaw !== null && sortRaw !== "" && sortRaw !== "recent" && sortRaw !== "alpha") {
      return fail("invalid_address", "Explore sort must be recent or alpha.");
    }
    const sort = sortRaw === "recent" || sortRaw === "alpha" ? sortRaw : undefined;
    const pageRaw = query.get("page");
    let page: number | undefined;
    if (pageRaw !== null && pageRaw !== "") {
      const parsed = Number(pageRaw);
      if (!Number.isSafeInteger(parsed) || parsed < 1) return fail("invalid_address", "Explore page must be a positive integer.");
      page = parsed;
    }
    const day = query.get("day")?.trim() || undefined;
    if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail("invalid_address", "Explore day must be YYYY-MM-DD.");
    // An empty snapshot is stale, not an unpinned read.
    const snapshot = query.get("snapshot") ?? undefined;
    const target: WorkboxExploreQuery = { q, sort, page, day, ...(snapshot === undefined ? {} : { snapshot }) };
    const suffix = queryString({ ...target }, "snapshot");
    return ok({ kind: "explore", uri: `workbox://explore${suffix}`, href: `/explore${suffix}`, query: target });
  }

  const isProjectAlias = segments[0] === "projects" && segments.length === 2;
  if ((!isProjectAlias && segments[0] !== "project") || segments.length < 2) {
    return fail("unsupported", "Supported addresses: workbox://dashboard, workbox://explore, and workbox://project/<id>.");
  }

  const projectId = segments[1];
  if (!PROJECT_ID.test(projectId)) {
    return fail("invalid_address", "Project IDs may contain letters, digits, dots, dashes, and underscores.");
  }
  if (projectId === "." || projectId === "..") {
    return fail("invalid_address", "Project IDs cannot be dot segments.");
  }
  if (segments.length === 2) {
    if (query.toString()) return fail("invalid_address", "Project addresses do not accept query parameters.");
    return ok({ kind: "project", uri: `workbox://project/${projectId}`, href: `/p/${encodeURIComponent(projectId)}`, projectId });
  }

  const section = segments[2];
  if (section === "memory") return fail("retired", "Memory addresses are retired; memory reads are not part of the native address scheme.");
  if (section === "pipelines") return fail("unsupported", "Pipeline addresses are not supported by the shared resolver.");

  if (section === "issues" && segments.length === 3) {
    if (query.toString()) return fail("invalid_address", "Issue addresses do not accept query parameters.");
    return ok({ kind: "issues", uri: `workbox://project/${projectId}/issues`, href: `/p/${encodeURIComponent(projectId)}/issues`, projectId });
  }

  if ((section === "issues" || section === "issue") && segments.length === 4) {
    const selector = issueSelector(segments[3]);
    if (!selector) return fail("invalid_address", "Issue addresses use the stable issue number.");
    return issueAddress(projectId, selector, query);
  }

  if (section === "task" && segments.length === 4) {
    const legacy = /^WP-(\d+)$/.exec(segments[3]);
    const selector = legacy ? issueSelector(legacy[1]) : null;
    if (!selector) return fail("invalid_address", "Legacy task addresses use task/WP-<number>.");
    return issueAddress(projectId, selector, query);
  }

  if (section === "code" && segments.length === 3) {
    const unknown = unknownQueryKey(query, ["rev", "at", "path", "commit"]);
    if (unknown) return fail("invalid_address", `Unsupported code parameter '${unknown}'.`);
    const rev = query.get("rev")?.trim() || undefined;
    const at = query.get("at")?.trim() || undefined;
    const commit = query.get("commit")?.trim() || undefined;
    const path = query.get("path") ?? undefined;
    if (path !== undefined) {
      if (path.startsWith("/") || path.split("/").some((part) => part === ".." || part === ".")) {
        return fail("invalid_address", "Code paths must be repository-relative.");
      }
    }
    if (path && commit !== undefined) return fail("invalid_address", "A file path cannot be combined with a commit.");
    const target: WorkboxCodeQuery = { rev, at, path, commit };
    return ok({ kind: "code", uri: codeUri(projectId, target), href: codeHref(projectId, target), projectId, query: target });
  }

  if (section === "proposals" || section === "proposal") {
    if (segments.length === 3 && section === "proposals") {
      if (query.toString()) return fail("invalid_address", "Proposal lists do not accept query parameters.");
      return ok({ kind: "proposals", uri: `workbox://project/${projectId}/proposals`, href: `/p/${encodeURIComponent(projectId)}/proposals`, projectId });
    }
    if (segments.length === 4) {
      const proposalId = PROPOSAL_ID.exec(segments[3]);
      if (!proposalId) return fail("invalid_address", "Proposal addresses use a full sha256 candidate ID (64 hexadecimal digits).");
      const candidateId = `sha256:${proposalId[1]}`;
      const unknown = unknownQueryKey(query, ["mode"]);
      if (unknown) return fail("invalid_address", `Unsupported proposal parameter '${unknown}'.`);
      const modeRaw = query.get("mode");
      if (modeRaw !== null && modeRaw !== "" && modeRaw !== "lineage" && modeRaw !== "exact") {
        return fail("invalid_address", "Proposal mode must be exact or lineage.");
      }
      const mode = modeRaw === "lineage" ? "lineage" : "exact";
      return ok({ kind: "proposal", uri: proposalUri(projectId, candidateId, mode), href: proposalHref(projectId, candidateId, mode), projectId, candidateId, mode });
    }
  }

  return fail("unsupported", "Unrecognized workbox:// project address.");
}
