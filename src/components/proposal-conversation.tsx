import Link from "next/link";
import type { VisibleProposalEvent } from "../lib/hn/proposal-read";
import type { ProposalConversationData, ProposalConversationEntry } from "../lib/workbox/proposal-conversation";
import { proposalDetailHref, type ProposalCandidate } from "../lib/workbox/proposal-detail";

const eventTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
});

function eventLabel(event: VisibleProposalEvent["event"]) {
  switch (event.kind) {
    case "proposal.open": return "Opened proposal";
    case "proposal.revise": return "Revised proposal";
    case "review.submit": return event.verdict === "approve" ? "Approved in review" : "Requested changes";
    case "proposal.decision": return event.verdict === "accept" ? "Accepted proposal" : "Rejected proposal";
    case "proposal.merged": return "Recorded merge";
    case "run.request": return "Requested run";
    case "run.result": return event.outcome === "passed" ? "Run passed" : "Run failed";
    case "run.withdraw": return "Withdrew run request";
  }
}

export function ProposalConversation({
  projectId, candidate, conversation,
}: {
  projectId: string;
  candidate: ProposalCandidate;
  conversation: ProposalConversationData;
}) {
  const titles = new Map(conversation.candidates.map(({ id, title }) => [id, title]));
  const selectedEntries = conversation.entries.filter((entry) => entry.candidateId === candidate.id);
  const history = conversation.entries.filter((entry) => entry.candidateId !== candidate.id);

  function renderEntries(entries: ProposalConversationEntry[]) {
    return (
      <ol className="space-y-2">
        {entries.map(({ record, candidateId, reviewEligibility }) => {
          const { event } = record;
          return (
            <li key={record.id} className="wb-panel space-y-2 p-3 text-sm wrap-anywhere">
              <p>
                <strong>{event.actorName || event.actor}</strong>{" "}
                <span>{eventLabel(event)}</span>
                {"pipeline" in event && <span className="wb-muted"> · {event.pipeline}</span>}
              </p>
              <p className="wb-muted text-xs">
                <time dateTime={event.timestamp}>{eventTime.format(new Date(event.timestamp))} UTC</time>
                {candidateId !== candidate.id && (
                  <>
                    {" · "}
                    <Link className="wb-link" prefetch={false} href={proposalDetailHref(projectId, candidateId)}>
                      {titles.get(candidateId)} <code className="wb-mono">{candidateId}</code>
                    </Link>
                  </>
                )}
              </p>
              {event.body && <p className="whitespace-pre-wrap">{event.body}</p>}
              {reviewEligibility && (
                <p className="wb-muted text-xs">
                  {reviewEligibility.policy ? "Eligible under review policy" : "Outside review policy eligibility"}
                  {reviewEligibility.protectedChecks && " · Eligible for protected checks"}
                </p>
              )}
              <details className="text-xs">
                <summary className="wb-muted cursor-pointer">Signed event ID</summary>
                <code className="wb-mono select-all">{record.id}</code>
              </details>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="proposal-conversation">
      <h2 className="text-lg font-semibold" id="proposal-conversation">Conversation</h2>
      {conversation.incomplete && <p className="wb-muted text-sm">Signed history is incomplete.</p>}
      {selectedEntries.length > 0
        ? renderEntries(selectedEntries)
        : <p className="wb-muted text-sm">No signed events available for this revision.</p>}
      {history.length > 0 && (
        <section className="space-y-2" aria-labelledby="other-revision-history">
          <h3 className="font-semibold" id="other-revision-history">Other revisions</h3>
          {renderEntries(history)}
        </section>
      )}
    </section>
  );
}
