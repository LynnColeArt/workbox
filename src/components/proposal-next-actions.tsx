import type { ProposalIdentity } from "@/lib/hn/proposal-read";
import { getProposalActions } from "@/lib/workbox/proposal-actions";
import type { ProposalChecksModel } from "@/lib/workbox/proposal-checks";
import ReviewButtons from "./review-buttons";

export function ProposalNextActions({ projectId, checks, identity }: {
  projectId: string;
  checks: ProposalChecksModel;
  identity: ProposalIdentity | null;
}) {
  const { review, handoffs } = getProposalActions(checks, identity);
  return (
    <section aria-labelledby="proposal-actions-heading" className="wb-panel space-y-3 p-4 text-sm">
      <h2 id="proposal-actions-heading" className="font-semibold">Next actions</h2>
      <div className="space-y-2">
        <p className="wb-muted">{review.detail}</p>
        {review.available && checks.kind === "evaluated" ? (
          <ReviewButtons key={`${projectId}:${checks.status.id}`} projectId={projectId} proposalId={checks.status.id} state="candidate" />
        ) : (
          <button type="button" className="wb-btn" disabled>Review</button>
        )}
      </div>
      {handoffs.length > 0 && (
        <ul className="divide-y divide-[var(--wb-border)] border-t border-[var(--wb-border)]">
          {handoffs.map(({ title, detail, command }) => (
            <li key={title} className="space-y-1 py-2">
              <h3 className="font-medium wrap-anywhere">{title}</h3>
              <p className="wb-muted">{detail}</p>
              {command && <code className="wb-mono text-xs">{command}</code>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
