import { readAutomaticProposalChecks } from "../src/lib/workbox/proposal-checks";
import { collaborationProject } from "../src/lib/workbox/collaboration";

export const automaticCheckTool = {
  name: "workbox_automatic_proposal_checks",
  description: "Read automatic check status, attempts, and signed evidence for an exact proposal revision.",
  inputSchema: {
    type: "object",
    properties: { project: { type: "string" }, candidate: { type: "string" } },
    required: ["project", "candidate"],
    additionalProperties: false,
  },
};

export async function automaticChecksForProject(input: Record<string, unknown>) {
  if (typeof input.project !== "string" || typeof input.candidate !== "string") {
    return { ok: false, error: { code: "invalid_input", message: "Provide a repository and exact proposal revision." } } as const;
  }
  const project = collaborationProject(input.project);
  if (!project) return { ok: false, error: { code: "not_found", message: "Repository not found." } } as const;
  return readAutomaticProposalChecks(project.repoPath, input.candidate);
}
