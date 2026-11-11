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
const ancestryLimit = 32;
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
}

export async function listProposalLineages(
  db: DatabaseSync,
  project: ProjectSummary,
  offset = 0,
  reader = createProposalReader(project.repoPath),
): Promise<ProposalLineagePage> {
  // Group by indexed predecessor edges before pagination. These keys and event
  // IDs only schedule native reads and are never used as display data.
  const hints = db.prepare(`
    WITH RECURSIVE hints(id, predecessor, timestamp) AS (
      SELECT event_id, CASE WHEN kind = 'proposal.revise' THEN subject END, timestamp
      FROM events
      WHERE project_id = ? AND verified = 1 AND kind IN ('proposal.open', 'proposal.revise')
    ),
    ancestors(id, anchor, predecessor, depth) AS (
      SELECT id, id, predecessor, 0 FROM hints
      UNION ALL
      SELECT a.id, h.id, h.predecessor, a.depth + 1
      FROM ancestors a JOIN hints h ON h.id = a.predecessor
      WHERE a.depth < ?
    ),
    ancestry AS (
      SELECT id, anchor, predecessor, depth,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY depth DESC) AS farthest
      FROM ancestors
    ),
    ranked AS (
      SELECT h.id, h.timestamp, a.anchor, a.predecessor IS NOT NULL AS incompleteAncestry,
        ROW_NUMBER() OVER (PARTITION BY a.anchor ORDER BY h.timestamp DESC, h.id DESC) AS position,
        COUNT(*) OVER (PARTITION BY a.anchor) AS size
      FROM hints h JOIN ancestry a ON a.id = h.id AND a.farthest = 1
    ),
    page AS (
      SELECT anchor, timestamp, id FROM ranked WHERE position = 1
      ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?
    )
    SELECT r.id, r.anchor, r.size, r.incompleteAncestry
    FROM page p JOIN ranked r ON r.anchor = p.anchor
    WHERE r.position <= ?
    ORDER BY p.timestamp DESC, p.id DESC, r.position
  `).all(project.id, ancestryLimit, pageSize + 1, offset, hintsPerLineage) as {
    id: string;
    anchor: string;
    size: number;
    incompleteAncestry: number;
  }[];
  const groups = new Map<string, typeof hints>();
  for (const hint of hints) {
    const group = groups.get(hint.anchor);
    if (group) group.push(hint);
    else groups.set(hint.anchor, [hint]);
  }

  const read = candidateReads(reader);
  const visible = new Map<string, ProposalCandidate>();
  let incomplete = false;
  const page = [...groups.values()].slice(0, pageSize);
  for (let start = 0; start < page.length; start += concurrentReads) {
    const batch = await Promise.all(page.slice(start, start + concurrentReads).map(async (group) => {
      let partial = group.some((hint) => hint.incompleteAncestry);
      for (const { id } of group) {
        if (!isFullProposalId(id)) {
          partial = true;
          continue;
        }
        const result = await read(id);
        if (result.kind === "visible") {
          return {
            candidate: result.candidate,
            groupKey: result.candidate.status?.lineage.root ?? group[0].anchor,
            partial: partial || result.candidate.status === null,
          };
        }
        if (result.kind === "unknown") partial = true;
      }
      return { partial: partial || group[0].size > group.length };
    }));
    for (const result of batch) {
      if (result.candidate && !visible.has(result.groupKey)) visible.set(result.groupKey, result.candidate);
      if (result.partial) incomplete = true;
    }
  }

  return {
    candidates: [...visible.values()],
    incomplete,
    nextOffset: groups.size > pageSize ? offset + pageSize : null,
  };
}
