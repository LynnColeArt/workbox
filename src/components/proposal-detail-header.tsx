import { candidateState, countLiveCandidates } from "../lib/workbox/proposal-status";
import Link from "next/link";
import {
  proposalDetailHref,
  type ProposalCandidate,
  type ProposalView,
} from "../lib/workbox/proposal-detail";

const views: [ProposalView, string][] = [
  ["conversation", "Conversation"],
  ["checks", "Checks"],
  ["files", "Files changed"],
];

export function ProposalDetailHeader({
  projectId, candidate, related, view, incomplete = false,
}: {
  projectId: string;
  candidate: ProposalCandidate;
  related: ProposalCandidate[];
  view: ProposalView;
  incomplete?: boolean;
}) {
  const liveCount = countLiveCandidates([candidate, ...related]);
  const lineage = candidate.status?.lineage;

  return (
    <header className="space-y-4">
      <div>
        <div className="mb-2 flex flex-wrap gap-2">
          <span className="wb-chip">{candidateState(candidate, incomplete, liveCount)}</span>
          <span className="wb-chip">{candidate.kind === "proposal.open" ? "Original proposal" : "Revision"}</span>
        </div>
        <h1 className="text-2xl font-semibold wrap-anywhere">{candidate.title}</h1>
        <p className="wb-muted mt-1 text-sm wrap-anywhere">
          Submitted by {candidate.actorName || candidate.actor}
        </p>
      </div>

      <dl className="wb-panel grid gap-2 p-3 text-xs sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="wb-muted">Candidate ID</dt>
        <dd><code className="wb-mono select-all wrap-anywhere">{candidate.id}</code></dd>
        <dt className="wb-muted">Base commit</dt>
        <dd><code className="wb-mono select-all wrap-anywhere">{candidate.base}</code></dd>
        <dt className="wb-muted">Head commit</dt>
        <dd><code className="wb-mono select-all wrap-anywhere">{candidate.head}</code></dd>
      </dl>

      {related.length > 0 && (
        <details className="wb-panel p-3 text-sm">
          <summary className="cursor-pointer font-medium">Related revisions ({related.length})</summary>
          <ul className="mt-2 space-y-2">
            {related.map((revision) => {
              const relationship = [
                revision.id === lineage?.root && "Original proposal",
                revision.id === lineage?.predecessor && "Previous revision",
              ].filter(Boolean).join(" · ");
              return (
                <li key={revision.id} className="wrap-anywhere">
                  <Link className="wb-link" prefetch={false} href={proposalDetailHref(projectId, revision.id, { view })}>
                    {revision.title} <code className="wb-mono text-xs">{revision.id}</code>
                  </Link>
                  <div className="wb-muted text-xs">
                    {relationship && `${relationship} · `}{candidateState(revision, incomplete, liveCount)}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {incomplete && <p className="wb-muted text-sm">Revision history is incomplete.</p>}

      <nav aria-label="Proposal views" className="flex flex-wrap gap-2 border-b border-[var(--wb-border)]">
        {views.map(([key, label]) => (
          <Link
            key={key}
            className={`px-3 py-2 text-sm ${key === view
              ? "border-b-2 border-[var(--wb-accent)] font-semibold"
              : "wb-muted hover:underline"}`}
            aria-current={key === view ? "page" : undefined}
            prefetch={false}
            href={proposalDetailHref(projectId, candidate.id, { view: key })}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
