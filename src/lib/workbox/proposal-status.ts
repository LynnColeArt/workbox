import type { createProposalReader } from "../hn/proposal-read";
import type { ProposalCandidate } from "./proposal-detail";
import { getProposalChecks } from "./proposal-checks";

export function candidateState({ status }: ProposalCandidate, incomplete: boolean, liveCount: number) {
  if (!status) return "Revision state unavailable";
  if (status.lineage.merge_conflict) return "Conflicting merges";
  if (status.lineage.merged) return "Merged revision";
  if (status.lineage.superseded) return "Superseded revision";
  if (status.lineage.closed) return "Historical revision";
  if (status.decisions.rejected) return "Rejected revision";
  return liveCount === 1 && !incomplete ? "Current revision" : "Live revision";
}

export function countLiveCandidates(candidates: ProposalCandidate[]) {
  return candidates.filter(({ status }) => status && !(
    status.lineage.merge_conflict || status.lineage.merged || status.lineage.superseded ||
    status.lineage.closed || status.decisions.rejected
  )).length;
}

export async function projectProposalStatus(
  candidate: ProposalCandidate, related: ProposalCandidate[], incomplete: boolean,
  reader: Pick<ReturnType<typeof createProposalReader>, "event">,
) {
  const status = candidate.status;
  const checks = getProposalChecks(status);
  const visible = [candidate, ...related];
  const mergeEvents: string[] = [];
  const mergeIds = [...new Set(status?.decisions.merge_events ?? [])];
  for (const id of mergeIds.slice(0, 16)) {
    const result = await reader.event(id);
    if (result.ok && result.value.id === id && result.value.event.kind === "proposal.merged" &&
        result.value.event.subject === candidate.id && result.value.event.head === candidate.head &&
        result.value.event.policy === status?.policy) mergeEvents.push(id);
  }
  return {
    id: candidate.id, title: candidate.title, base: candidate.base, head: candidate.head,
    root: visible.some(item => item.id === status?.lineage.root) ? status!.lineage.root : null,
    revisionState: candidateState(candidate, incomplete, countLiveCandidates(visible)),
    status: status?.status ?? null,
    incomplete,
    merge: status ? { recorded: status.decisions.merged, conflict: status.lineage.merge_conflict, events: mergeEvents,
      evidenceIncomplete: mergeEvents.length !== mergeIds.length || (status.decisions.merged && !mergeEvents.length) } : null,
    decision: status ? { accepted: status.decisions.accepted, rejected: status.decisions.rejected,
      required: status.decisions.required_accepts, accepts: status.decisions.accepts.length,
      deficit: status.decisions.accept_deficit } : null,
    stages: checks.stages,
    blockers: checks.kind === "evaluated" ? checks.blockers : null,
    requirements: checks.kind === "evaluated" ? checks.requirements : null,
    reviews: status ? { approvals: status.requirements.reviews.approvals,
      required: status.requirements.reviews.required, deficit: status.requirements.reviews.deficit } : null,
    pipelines: status?.requirements.pipelines.map(({ name, passes, required, deficit, satisfied }) =>
      ({ name, passes, required, deficit, satisfied })) ?? null,
  };
}
