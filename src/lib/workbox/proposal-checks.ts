import type { ProposalStatus } from "@/lib/hn/proposal-read";

export type ProposalRequirement = {
  key: string;
  label: string;
  state: "satisfied" | "missing" | "unknown" | "not-applicable";
  detail: string;
  paths?: readonly string[];
};

type ProposalStage = {
  label: string;
  state: string;
  detail: string;
};

export type ProposalChecksModel = {
  stages: ProposalStage[];
} & (
  | { kind: "unavailable" }
  | {
      kind: "evaluated";
      status: ProposalStatus;
      requirements: ProposalRequirement[];
      blockers: ProposalRequirement[];
    }
);

function threshold(actual: number, required: number, deficit: number, evidence: string): string {
  return `${actual} of ${required} ${evidence}.${deficit > 0 ? ` ${deficit} more needed.` : ""}`;
}

function requirementState(satisfied: boolean): "satisfied" | "missing" {
  return satisfied ? "satisfied" : "missing";
}

function requirementRows({ requirements }: ProposalStatus): ProposalRequirement[] {
  const { code, reviews, pipelines, protected_checks: protection } = requirements;
  const rows: ProposalRequirement[] = [
    {
      key: "code",
      label: "Code match",
      state: code.available ? requirementState(code.matches) : "unknown",
      detail: !code.available ? "The proposal’s code is unavailable locally."
        : code.matches ? "Hubnot verified the revision’s code."
        : "The available code does not match the signed revision.",
    },
    {
      key: "reviews",
      label: "Reviews",
      state: requirementState(reviews.satisfied),
      detail: threshold(reviews.approvals, reviews.required, reviews.deficit, "qualified approvals"),
    },
  ];
  for (const pipeline of pipelines) {
    rows.push({
      key: `pipeline:${pipeline.name}`,
      label: pipeline.name,
      state: requirementState(pipeline.satisfied),
      detail: threshold(pipeline.passes, pipeline.required, pipeline.deficit, "qualified passes"),
    });
  }
  if (protection) {
    rows.push({
      key: "protected_checks",
      label: "Protected checks",
      state: protection.applies ? requirementState(protection.satisfied) : "not-applicable",
      detail: protection.applies
        ? threshold(protection.approvals, protection.required, protection.deficit, "qualified approvals")
        : "This revision changes no protected paths.",
      paths: protection.changed_paths,
    });
  }
  const knownKeys = new Set(rows.map((row) => row.key));
  for (const key of requirements.missing) {
    if (!knownKeys.has(key)) {
      rows.push({ key, label: key, state: "missing", detail: "Hubnot reports this policy requirement as missing." });
      knownKeys.add(key);
    }
  }
  return rows;
}

function lineageRestriction({ lineage, observed_preconditions: observed }: ProposalStatus) {
  if (observed.lineage_terminal) return null;
  if (lineage.merge_conflict) return { state: "Merge conflict", detail: "Hubnot recorded competing merges in this proposal lineage." };
  if (lineage.closed) return { state: "Lineage closed", detail: "Another revision in this lineage has merged." };
  if (lineage.superseded) return { state: "Superseded", detail: "A newer revision supersedes this one." };
  return { state: "Unavailable for this revision", detail: "Hubnot reports that this revision cannot advance in its lineage." };
}

function stageRows(status: ProposalStatus): ProposalStage[] {
  const { decisions, observed_preconditions: observed, requirements } = status;
  const evidence = !requirements.code.available
    ? { state: "Unknown", detail: "Hubnot needs this revision’s code to verify the match." }
    : status.readiness
      ? { state: "Ready", detail: "This revision meets the evaluated evidence requirements." }
      : { state: "Blocked", detail: "This revision has unmet evidence requirements." };
  const restriction = lineageRestriction(status);
  const decisionCounts = threshold(decisions.accepts.length, decisions.required_accepts, decisions.accept_deficit, "qualified acceptances");
  const decision = decisions.rejected ? { state: "Rejected", detail: decisionCounts }
    : decisions.accepted ? { state: "Accepted", detail: decisionCounts }
    : restriction ? { ...restriction, detail: `${restriction.detail} ${decisionCounts}` }
    : observed.acceptance.met ? { state: "Ready for maintainer decision", detail: decisionCounts }
    : { state: "Decision pending", detail: decisionCounts };
  const merge = status.lineage.merge_conflict && decisions.merged
    ? { state: "Merge conflict", detail: "Hubnot recorded a merge for this revision and a competing merge in its lineage." }
    : decisions.merged ? { state: "Merged", detail: "Hubnot recorded a merge for this revision." }
    : restriction ?? (observed.merge.met
      ? { state: "Observed merge conditions met", detail: "Based on selected history. Hubnot checks the actor and checkout when merging." }
      : !observed.merge.not_rejected ? { state: "Rejected", detail: "A maintainer rejection blocks merging." }
      : !observed.merge.evidence_ready ? { state: "Waiting for evidence", detail: "This revision needs verified code and sufficient policy evidence." }
      : { state: "Waiting for acceptance", detail: "This revision needs maintainer acceptance." });
  return [
    { label: "Evidence readiness", ...evidence },
    { label: "Maintainer decision", ...decision },
    { label: "Merge", ...merge },
  ];
}

export function getProposalChecks(status: ProposalStatus | null): ProposalChecksModel {
  if (!status) {
    return {
      kind: "unavailable",
      stages: ["Evidence readiness", "Maintainer decision", "Merge"].map((label) => ({
        label, state: "Unknown", detail: "",
      })),
    };
  }
  const requirements = requirementRows(status);
  const missing = new Set(status.requirements.missing);
  return {
    kind: "evaluated",
    status,
    stages: stageRows(status),
    requirements,
    blockers: requirements.filter((row) => missing.has(row.key)),
  };
}
