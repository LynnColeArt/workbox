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

export function AutomaticProposalChecks({ result }: {
  result: Awaited<ReturnType<typeof import("@/lib/workbox/proposal-checks").readAutomaticProposalChecks>>;
}) {
  return (
    <section aria-label="Automatic proposal checks" className="wb-panel space-y-3 p-4">
      <h2 className="font-semibold">Automatic proposal checks</h2>
      {!result.ok ? <p className="wb-muted text-sm">Automatic check status is unavailable.</p> : (
        <>
          {result.data.value.availability === "no_authority" && <p className="wb-muted text-sm">Runner status is unavailable in this clone. Synced results are shown below.</p>}
          {result.data.value.checks.length === 0 && <p className="wb-muted text-sm">{
            result.data.value.decision === "historical" ? "This revision predates automatic checks." :
              result.data.value.decision === "ineligible" || result.data.value.decision === "unchanged"
                ? "No automatic checks were triggered for this revision." : "No automatic checks have been observed for this revision."
          }</p>}
          {result.data.value.checks.map(check => (
            <article key={check.id} className="space-y-2 border-t border-[var(--wb-border)] pt-3 text-sm">
              <h3 className="font-semibold">{check.pipeline} <span className="wb-chip">{check.status}</span></h3>
              {check.reason && <p>{check.reason}</p>}
              <dl className="wb-muted break-all">
                <dt>Candidate commit</dt><dd><code>{check.commit}</code></dd>
                <dt>Configuration commit</dt><dd><code>{check.source}</code></dd>
                <dt>Configuration digest</dt><dd><code>{check.configuration}</code></dd>
                <dt>Pipeline definition</dt><dd><code>{check.definition}</code></dd>
                <dt>Queued</dt><dd><time dateTime={check.created}>{check.created}</time></dd>
              </dl>
              {check.attempts.length > 0 && <ol aria-label="Check attempts" className="space-y-2">
                {check.attempts.map(attempt => (
                  <li key={attempt.id} className="break-all">
                    <p>{attempt.status} · <time dateTime={attempt.started}>{attempt.started}</time></p>
                    {attempt.finished && <p>Finished <time dateTime={attempt.finished}>{attempt.finished}</time></p>}
                    <p>Attempt <code>{attempt.id}</code></p>
                    {attempt.request && <p>Signed request <code>{attempt.request}</code></p>}
                    {attempt.result && <p>Signed result <code>{attempt.result}</code></p>}
                  </li>
                ))}
              </ol>}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
