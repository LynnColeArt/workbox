import { z } from "zod";
import { createProposalReader, isFullProposalId } from "../src/lib/hn/proposal-read";
import { openDb } from "../src/lib/workbox/db";
import { getProject } from "../src/lib/workbox/queries";
import { proposalDetailHref, resolveProposalDetail } from "../src/lib/workbox/proposal-detail";
import { readAutomaticProposalChecks } from "../src/lib/workbox/proposal-checks";
import { projectProposalStatus } from "../src/lib/workbox/proposal-status";

const input = z.strictObject({
  project: z.string().trim().min(1),
  candidate: z.string().refine(isFullProposalId),
  mode: z.enum(["exact", "lineage"]).default("exact"),
});

export const proposalStatusTool = {
  name: "workbox_proposal_status",
  description: "Read the exact proposal revision, merge state and blockers shown in Workbox. Use lineage mode to follow a proposal.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      candidate: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      mode: { enum: ["exact", "lineage"], default: "exact" },
    },
    required: ["project", "candidate"],
    additionalProperties: false,
  },
};

export async function proposalStatusForProject(args: unknown) {
  const parsed = input.safeParse(args);
  if (!parsed.success) return { ok: false, error: { code: "invalid_input", message: "Provide a project, full proposal ID, and a valid lookup mode." } };
  const { project, candidate, mode } = parsed.data;
  const requested = { project, candidate, mode };
  try {
    using db = openDb();
    const repo = getProject(db, project);
    if (!repo) return { ok: false, error: { code: "not_found", message: "Project unavailable." } };
    const reader = createProposalReader(repo.repoPath);
    const detail = await resolveProposalDetail(db, repo, candidate, mode, reader);
    if (detail.kind === "unavailable") {
      return { ok: false, error: { code: "unavailable", message: "Proposal revision unavailable." } };
    }
    const href = (id: string) => proposalDetailHref(project, id, { view: "checks" });
    if (detail.kind === "choose") {
      return { ok: true, data: { kind: detail.kind, requested, incomplete: detail.incomplete,
        choices: detail.candidates.map(({ id, title, head }) => ({ id, title, head, href: href(id) })) } };
    }
    const [status, checks] = await Promise.all([
      projectProposalStatus(detail.candidate, detail.related, detail.incomplete, reader),
      readAutomaticProposalChecks(repo.repoPath, detail.candidate.id),
    ]);
    const automaticChecks = checks.ok ? {
      availability: checks.data.value.availability,
      checks: checks.data.value.checks.filter(check =>
        check.candidate === status.id && check.commit === status.head
      ).map(check => ({
        ...check,
        required: status.pipelines === null ? null : status.pipelines.some(
          requirement => requirement.name === check.pipeline && requirement.required > 0
        ),
      })),
    } : null;
    return { ok: true, data: { kind: detail.kind, requested, ...status, automaticChecks, href: href(status.id) } };
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Proposal revision unavailable." } };
  }
}
