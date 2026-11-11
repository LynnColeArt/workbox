import type { DatabaseSync } from "node:sqlite";
import { createProposalReader, isFullProposalId, type VisibleProposalEvent } from "../hn/proposal-read";
import type { ProposalCandidate } from "./proposal-detail";
import type { ProjectSummary } from "./queries";

export interface ProposalConversationEntry {
  candidateId: string;
  record: VisibleProposalEvent;
  reviewEligibility?: { policy: boolean; protectedChecks: boolean };
}

export interface ProposalConversationData {
  entries: ProposalConversationEntry[];
  candidates: Pick<ProposalCandidate, "id" | "title">[];
  incomplete: boolean;
}

const directKinds = ["review.submit", "proposal.decision", "proposal.merged", "run.request"];
const runKinds = ["run.result", "run.withdraw"];
const hintLimit = 24;
const concurrency = 4;

function indexedIds(db: DatabaseSync, projectId: string, subjects: string[], kinds: string[]) {
  if (!subjects.length) return [];
  const parameters = (values: string[]) => values.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT event_id FROM events
    WHERE project_id = ? AND verified = 1
      AND subject IN (${parameters(subjects)}) AND kind IN (${parameters(kinds)})
    ORDER BY timestamp DESC, event_id DESC
    LIMIT ?
  `).all(projectId, ...subjects, ...kinds, hintLimit + 1);
  return rows.map(({ event_id }) => event_id);
}

export async function readProposalConversation(
  db: DatabaseSync,
  project: ProjectSummary,
  candidate: ProposalCandidate,
  related: ProposalCandidate[] = [],
  reader: Pick<ReturnType<typeof createProposalReader>, "event"> = createProposalReader(project.repoPath),
): Promise<ProposalConversationData> {
  const candidates = [candidate, ...related].map(({ id, title }) => ({ id, title }));
  const visibleCandidates = new Map([candidate, ...related].map((revision) => [revision.id, revision]));
  const candidateIds = [...visibleCandidates.keys()];
  const entries: ProposalConversationEntry[] = [];
  const requests = new Map<string, string>();
  const visited = new Set<string>();
  let incomplete = false;

  async function read(ids: unknown[], limit = ids.length) {
    incomplete ||= ids.length > limit;
    const verified: VisibleProposalEvent[] = [];
    const pending = ids.slice(0, limit).filter((id): id is string => {
      if (!isFullProposalId(id)) {
        incomplete = true;
        return false;
      }
      if (visited.has(id)) return false;
      visited.add(id);
      return true;
    });
    for (let start = 0; start < pending.length; start += concurrency) {
      const batch = pending.slice(start, start + concurrency);
      const results = await Promise.all(batch.map((id) => reader.event(id)));
      for (const [index, result] of results.entries()) {
        if (result.ok && result.value.id === batch[index]) {
          verified.push(result.value);
        } else if (result.ok || result.reason !== "not_visible") {
          incomplete = true;
        }
      }
    }
    return verified;
  }

  const revisions = await read(candidateIds);
  incomplete ||= revisions.length < candidateIds.length;
  for (const record of revisions) {
    if (record.event.kind === "proposal.open" || record.event.kind === "proposal.revise") {
      entries.push({ candidateId: record.id, record });
    } else {
      incomplete = true;
    }
  }

  // The index schedules native lookups. Signed subjects alone establish attribution.
  for (const record of await read(indexedIds(db, project.id, candidateIds, directKinds), hintLimit)) {
    const { event } = record;
    if (event.kind === "proposal.open" || event.kind === "proposal.revise" ||
        event.kind === "run.result" || event.kind === "run.withdraw") continue;
    const revision = visibleCandidates.get(event.subject);
    if (!revision) continue;
    const entry: ProposalConversationEntry = { candidateId: revision.id, record };
    if (event.kind === "review.submit") {
      const review = revision.status?.current_reviews[event.actor];
      if (review?.id === record.id && review.subject === revision.id) {
        entry.reviewEligibility = {
          policy: review.policy_eligible,
          protectedChecks: review.protected_policy_eligible,
        };
      }
    }
    entries.push(entry);
    if (event.kind === "run.request") requests.set(record.id, event.subject);
  }

  for (const record of await read(indexedIds(db, project.id, [...requests.keys()], runKinds), hintLimit)) {
    const { event } = record;
    if (event.kind !== "run.result" && event.kind !== "run.withdraw") continue;
    const candidateId = requests.get(event.subject);
    if (candidateId) entries.push({ candidateId, record });
  }

  entries.sort((a, b) =>
    Date.parse(a.record.event.timestamp) - Date.parse(b.record.event.timestamp) ||
    a.record.id.localeCompare(b.record.id)
  );
  return { candidates, entries, incomplete };
}
