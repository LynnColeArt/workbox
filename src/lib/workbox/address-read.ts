import type { DatabaseSync } from "node:sqlite";
import { getProject, listProjects, projectOverview } from "./queries";
import { readDashboard } from "./dashboard";
import { readExplore, type ExploreQuery } from "./explore";
import { readCode, type CodeQuery } from "./code-browser";
import { issueResult, readIssueDetail, readIssueList } from "./issues";
import { listProposalLineages, resolveProposalDetail } from "./proposal-detail";
import { parseWorkboxAddress, type WorkboxAddressError, type WorkboxAddressTarget } from "./address";

export interface WorkboxResourceDescription {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
}

export function listWorkboxResources(db: DatabaseSync): WorkboxResourceDescription[] {
  const resources: WorkboxResourceDescription[] = [
    { uri: "workbox://dashboard", name: "Dashboard", description: "Instance summary, recent activity, and the seven-day snapshot.", mimeType: "application/json" },
    { uri: "workbox://explore", name: "Explore", description: "Project catalog and seven-day activity chart.", mimeType: "application/json" },
  ];
  for (const project of listProjects(db)) {
    resources.push({ uri: `workbox://project/${project.id}`, name: project.name, description: project.description, mimeType: "application/json" });
    resources.push({ uri: `workbox://project/${project.id}/code`, name: `${project.name} \u2014 code`, mimeType: "application/json" });
    resources.push({ uri: `workbox://project/${project.id}/issues`, name: `${project.name} \u2014 issues`, mimeType: "application/json" });
    resources.push({ uri: `workbox://project/${project.id}/proposals`, name: `${project.name} \u2014 proposals`, mimeType: "application/json" });
  }
  return resources;
}

export type WorkboxReadResult =
  | { ok: true; target: WorkboxAddressTarget; data: unknown }
  | { ok: false; error: WorkboxAddressError };

/** Resolve an address to its canonical browser target and confirm the project. */
export function navigateWorkboxAddress(
  db: DatabaseSync,
  input: string,
): { ok: true; data: { kind: string; href: string; uri: string } } | { ok: false; error: WorkboxAddressError } {
  const parsed = parseWorkboxAddress(input);
  if (!parsed.ok) return parsed;
  const target = parsed.target;
  if ("projectId" in target && !getProject(db, target.projectId)) {
    return { ok: false, error: { code: "not_found", message: `Project '${target.projectId}' is unavailable.` } };
  }
  return { ok: true, data: { kind: target.kind, href: target.href, uri: target.uri } };
}

/** Read a workbox:// address through the current native Hubnot read services. */
export async function readWorkboxResource(db: DatabaseSync, input: string): Promise<WorkboxReadResult> {
  const parsed = parseWorkboxAddress(input);
  if (!parsed.ok) return parsed;
  const target = parsed.target;
  try {
    if (target.kind === "dashboard") return { ok: true, target, data: readDashboard(db) };
    if (target.kind === "explore") return { ok: true, target, data: readExplore(db, target.query as ExploreQuery) };
    const project = getProject(db, target.projectId);
    if (!project) return { ok: false, error: { code: "not_found", message: "Project unavailable." } };
    switch (target.kind) {
      case "project":
        return { ok: true, target, data: projectOverview(db, project.id) };
      case "code":
        return { ok: true, target, data: readCode(db, project.id, target.query as CodeQuery) };
      case "issues":
        return { ok: true, target, data: issueResult(await readIssueList(project, { action: "list", status: "all", limit: 50 })) };
      case "issue":
        return { ok: true, target, data: issueResult(await readIssueDetail(project, { action: "detail", issueId: Number(target.selector), limit: 50 })) };
      case "proposals":
        return { ok: true, target, data: await listProposalLineages(db, project, 0) };
      case "proposal":
        return { ok: true, target, data: await resolveProposalDetail(db, project, target.candidateId, target.mode) };
    }
    return { ok: false, error: { code: "unsupported", message: "Unsupported address." } };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Workbox could not read this address." } };
  }
}
