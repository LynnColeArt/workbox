import type { ProposalMaintenance } from "@/lib/workbox/proposal-maintenance";
import { ProposalMaintenanceControls } from "./proposal-maintenance-controls";
import type { ProposalIdentity } from "@/lib/hn/proposal-read";
import { getProposalActions } from "@/lib/workbox/proposal-actions";
import type { ProposalChecksModel } from "@/lib/workbox/proposal-checks";
import ReviewButtons from "./review-buttons";

export function ProposalNextActions({ projectId, checks, identity, maintenance = null }: {
  projectId: string;
  checks: ProposalChecksModel;
  identity: ProposalIdentity | null;
  maintenance?: ProposalMaintenance;
}) {
  const { review, handoffs } = getProposalActions(checks, identity, maintenance !== null);
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
      {maintenance && checks.kind === "evaluated" && checks.status.observed_preconditions.lineage_terminal &&
        !checks.status.decisions.merged && !checks.status.decisions.rejected && (
          <ProposalMaintenanceControls options={maintenance}
            endpoint={`/api/projects/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(checks.status.id)}/maintain`} />
      )}
      {checks.kind === "evaluated" && !!checks.status.decisions.rejections?.length && (
        <ul aria-label="Rejection reasons" className="space-y-2">
          {checks.status.decisions.rejections.map(({ id, reason }) => (
            <li key={id} className="whitespace-pre-wrap wrap-anywhere">{reason}</li>
          ))}
        </ul>
      )}
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
