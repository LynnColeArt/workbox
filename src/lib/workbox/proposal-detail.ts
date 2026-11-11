import type { DatabaseSync } from "node:sqlite";
import {
  createProposalReader,
  isFullProposalId,
  type ProposalStatus,
} from "../hn/proposal-read";
import type { ProjectSummary } from "./queries";

type ProposalReader = ReturnType<typeof createProposalReader>;
export type ProposalView = "conversation" | "checks" | "files";
export type ProposalMode = "exact" | "lineage";

export interface ProposalCandidate {
  id: string;
  kind: ProposalStatus["kind"];
  title: string;
  body: string;
  base: string;
  head: string;
  actor: string;
  actorName: string;
  status: ProposalStatus | null;
}

type CandidateRead =
  | { kind: "visible"; candidate: ProposalCandidate; predecessor: string | null }
  | { kind: "absent" }
  | { kind: "unknown" };

export type ProposalDetail =
  | { kind: "unavailable" }
  | { kind: "choose"; candidates: ProposalCandidate[]; incomplete: boolean }
  | {
      kind: "candidate";
      candidate: ProposalCandidate;
      related: ProposalCandidate[];
      incomplete: boolean;
    };

const pageSize = 12;
const hintsPerLineage = 3;
const relatedLimit = 12;
const concurrentReads = 4;

export function proposalDetailHref(
  projectId: string,
  candidateId: string,
  options: { mode?: ProposalMode; view?: ProposalView } = {},
): string {
  const query = new URLSearchParams();
  if (options.mode === "lineage") query.set("mode", "lineage");
  if (options.view && options.view !== "conversation") query.set("view", options.view);
  const path = `/p/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(candidateId)}`;
  return query.size ? `${path}?${query}` : path;
}

function candidateReads(reader: ProposalReader) {
  const pending = new Map<string, Promise<CandidateRead>>();
  async function read(id: string): Promise<CandidateRead> {
    const status = await reader.status(id);
    if (status.ok) {
      const s = status.value;
      return {
        kind: "visible",
        predecessor: s.lineage.predecessor || null,
        candidate: {
          id: s.id,
          kind: s.kind,
          title: s.title,
          body: s.body,
          base: s.base,
          head: s.head,
          actor: s.actor,
          actorName: s.actor_name,
          status: s,
        },
      };
    }
    if (status.reason === "not_visible") return { kind: "absent" };

    const result = await reader.event(id);
    if (!result.ok) return { kind: result.reason === "not_visible" ? "absent" : "unknown" };
    const { event } = result.value;
    if (event.kind !== "proposal.open" && event.kind !== "proposal.revise") return { kind: "absent" };
    return {
      kind: "visible",
      predecessor: event.kind === "proposal.revise" ? event.subject : null,
      candidate: {
        id: result.value.id,
        kind: event.kind,
        title: event.kind === "proposal.open" ? event.title : "Proposal revision",
        body: event.body ?? "",
        base: event.base,
        head: event.head,
        actor: event.actor,
        actorName: event.actorName,
        status: null,
      },
    };
  }
  return (id: string) => {
    let result = pending.get(id);
    if (!result) {
      result = read(id);
      pending.set(id, result);
    }
    return result;
  };
}

async function readBatch(ids: string[], read: (id: string) => Promise<CandidateRead>) {
  const results: CandidateRead[] = [];
  for (let start = 0; start < ids.length; start += concurrentReads) {
    results.push(...await Promise.all(ids.slice(start, start + concurrentReads).map(read)));
  }
  return results;
}

export async function resolveProposalDetail(
  _db: DatabaseSync,
  project: ProjectSummary,
  candidateId: string,
  mode: ProposalMode = "exact",
  reader = createProposalReader(project.repoPath),
): Promise<ProposalDetail> {
  if (!isFullProposalId(candidateId)) return { kind: "unavailable" };
  const read = candidateReads(reader);
  const selected = await read(candidateId);
  if (selected.kind !== "visible") return { kind: "unavailable" };
  const anchor = selected.candidate;
  const lineage = anchor.status?.lineage;
  if (!lineage) return { kind: "candidate", candidate: anchor, related: [], incomplete: true };

  // A native lineage reference alone does not authorize rendering that candidate.
  const ids = [...new Set([
    ...lineage.successors,
    ...lineage.siblings,
    ...lineage.descendants,
    ...lineage.merged_candidates,
    ...lineage.ancestors,
    lineage.predecessor,
    lineage.root,
    ...lineage.members,
  ])].filter((id) => id !== candidateId && isFullProposalId(id));
  const results = await readBatch(ids.slice(0, relatedLimit), read);
  const related = results.flatMap((r) => r.kind === "visible" ? [r.candidate] : []);
  const candidates = [anchor, ...related];
  const incomplete = ids.length > relatedLimit || results.some((r) => r.kind === "unknown")
    || related.some((r) => r.status === null);

  if (mode === "lineage") {
    const live = candidates.filter(({ status }) => status && !(
      status.lineage.superseded || status.lineage.closed || status.lineage.merge_conflict ||
      status.lineage.merged || status.decisions.rejected
    ));
    if (live.length > 1 || (incomplete && candidates.length > 1)) {
      return { kind: "choose", candidates: !incomplete && live.length > 1 ? live : candidates, incomplete };
    }
    const merged = candidates.filter(({ status }) => status?.lineage.merged);
    const current = !incomplete
      ? (live.length === 1 ? live[0] : merged.length === 1 ? merged[0] : anchor)
      : anchor;
    return { kind: "candidate", candidate: current, related: candidates.filter(({ id }) => id !== current.id), incomplete };
  }

  return { kind: "candidate", candidate: anchor, related, incomplete };
}

export interface ProposalLineagePage {
  candidates: ProposalCandidate[];
  incomplete: boolean;
  nextOffset: number | null;
  nextHintOffset?: number;
}

interface ProposalHint {
  id: string;
  predecessor: string | null;
}

interface IndexedRoot {
  id: string;
  incomplete: boolean;
}

function groupIndexedHints(hints: ProposalHint[]) {
  const byId = new Map(hints.map((hint) => [hint.id, hint]));
  const roots = new Map<string, IndexedRoot>();
  const groups = new Map<string, { root: IndexedRoot; ids: string[] }>();

  for (const hint of hints) {
    let id = hint.id;
    const chain = new Set<string>();
    while (!roots.has(id)) {
      if (chain.has(id)) {
        // Invalid cycles still terminate and share one stable internal key.
        const cycle = [...chain];
        const key = cycle.slice(cycle.indexOf(id)).reduce((min, member) => member < min ? member : min);
        roots.set(id, { id: key, incomplete: true });
        break;
      }
      const indexed = byId.get(id);
      if (!indexed || !indexed.predecessor) {
        roots.set(id, { id, incomplete: !indexed });
        break;
      }
      chain.add(id);
      id = indexed.predecessor;
    }
    const root = roots.get(id)!;
    for (const member of chain) roots.set(member, root);

    const group = groups.get(root.id);
    if (group) group.ids.push(hint.id);
    else groups.set(root.id, { root, ids: [hint.id] });
  }
  return { groups: [...groups.values()], byId };
}

export async function listProposalLineages(
  db: DatabaseSync,
  project: ProjectSummary,
  offset = 0,
  reader = createProposalReader(project.repoPath),
  hintOffset = 0,
): Promise<ProposalLineagePage> {
  // Indexed IDs and predecessor edges schedule native reads only. Memoize
  // ancestry for the whole index so a long lineage occupies one page slot.
  const hints = db.prepare(`
    SELECT event_id AS id, CASE WHEN kind = 'proposal.revise' THEN subject END AS predecessor
    FROM events
    WHERE project_id = ? AND verified = 1 AND kind IN ('proposal.open', 'proposal.revise')
    ORDER BY timestamp DESC, event_id DESC
  `).all(project.id) as unknown as ProposalHint[];
  const { groups, byId } = groupIndexedHints(hints);
  const read = candidateReads(reader);
  const visible = new Map<string, ProposalCandidate>();
  let incomplete = false;
  const page = groups.slice(offset, offset + pageSize);
  for (let start = 0; start < page.length; start += concurrentReads) {
    const batch = await Promise.all(page.slice(start, start + concurrentReads).map(async (group, index) => {
      const skip = start + index === 0 ? hintOffset : 0;
      // Probe the indexed root on the first attempt even when newer hints exist.
      const rootId = byId.has(group.root.id) ? group.root.id : null;
      const revisions = group.ids.filter((id) => id !== rootId);
      const candidates = revisions.slice(skip, skip + hintsPerLineage);
      if (skip === 0 && rootId) candidates.push(rootId);
      let partial = group.root.incomplete;
      for (const id of candidates) {
        if (!isFullProposalId(id)) {
          partial = true;
          continue;
        }
        const result = await read(id);
        if (result.kind === "visible") {
          return {
            candidate: result.candidate,
            groupKey: result.candidate.status?.lineage.root ?? group.root.id,
            partial: partial || result.candidate.status === null,
          };
        }
        if (result.kind === "unknown") partial = true;
      }
      const next = skip + hintsPerLineage;
      return { partial, nextHintOffset: next < revisions.length ? next : undefined };
    }));
    for (const [index, result] of batch.entries()) {
      if (result.candidate && !visible.has(result.groupKey)) visible.set(result.groupKey, result.candidate);
      if (result.partial) incomplete = true;
      if (result.nextHintOffset !== undefined) {
        // Resume this group before showing later groups. Numeric offsets reveal
        // neither the indexed grouping key nor any denied candidate ID.
        return {
          candidates: [...visible.values()],
          incomplete: true,
          nextOffset: offset + start + index,
          nextHintOffset: result.nextHintOffset,
        };
      }
    }
  }

  return {
    candidates: [...visible.values()],
    incomplete,
    nextOffset: groups.length > offset + pageSize ? offset + pageSize : null,
  };
}
