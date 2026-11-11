import type { ProposalChecksModel, ProposalRequirement } from "@/lib/workbox/proposal-checks";

const checkState: Record<ProposalRequirement["state"], string> = {
  satisfied: "Satisfied",
  missing: "Missing",
  unknown: "Unknown",
  "not-applicable": "Not applicable",
};

export function ProposalStageSummary({ checks }: { checks: ProposalChecksModel }) {
  return (
    <dl aria-label="Revision status" className="grid gap-3 sm:grid-cols-3">
      {checks.stages.map(({ label, state, detail }) => (
        <div key={label} className="wb-panel min-w-0 p-3">
          <dt className="wb-muted text-sm">{label}</dt>
          <dd className="mt-1 text-sm font-semibold">{state}</dd>
          {detail && <dd className="wb-muted mt-1 text-xs">{detail}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function ProposalChecks({ checks }: { checks: ProposalChecksModel }) {
  if (checks.kind === "unavailable") {
    return (
      <section aria-labelledby="proposal-checks-heading" className="wb-panel p-4">
        <h2 id="proposal-checks-heading" className="font-semibold">Checks</h2>
        <p className="wb-muted mt-2 text-sm">Hubnot’s evaluation for this revision is unavailable.</p>
      </section>
    );
  }
  const observed = checks.status.disagreements;

  return (
    <section aria-labelledby="proposal-checks-heading" className="wb-panel p-4">
      <h2 id="proposal-checks-heading" className="font-semibold">Checks</h2>
      <ul className="mt-2 divide-y divide-[var(--wb-border)]">
        {checks.requirements.map(({ key, label, state, detail, paths }) => (
          <li key={key} className="flex items-start justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <h3 className="font-semibold [overflow-wrap:anywhere]">{label}</h3>
              <p className="wb-muted mt-1">{detail}</p>
              {paths && paths.length > 0 && (
                <ul aria-label="Changed protected paths" className="wb-mono wb-muted mt-1 space-y-1 text-xs">
                  {paths.map((path) => <li key={path} className="[overflow-wrap:anywhere]">{path}</li>)}
                </ul>
              )}
            </div>
            <span className="wb-chip shrink-0">{checkState[state]}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-[var(--wb-border)] pt-3 text-sm">
        <h3 className="font-semibold">Observed reviews</h3>
        <p className="wb-muted mt-1">{observed.observed_approvals} approvals observed.</p>
        <p className="wb-muted">
          {observed.observed_change_requests} change requests observed ({observed.qualified_change_requests} policy-eligible).
        </p>
      </div>
    </section>
  );
}
