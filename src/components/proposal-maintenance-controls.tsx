"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProposalMaintenance } from "@/lib/workbox/proposal-maintenance";

export function ProposalMaintenanceControls({ endpoint, options }: {
  endpoint: string;
  options: NonNullable<ProposalMaintenance>;
}) {
  const router = useRouter();
  const [confirmedTarget, setConfirmedTarget] = useState<NonNullable<ProposalMaintenance>["target"] | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [uncertainMerge, setUncertainMerge] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [completed, setCompleted] = useState<"accept" | "reject" | "merge" | null>(null);

  async function submit(action: "accept" | "reject" | "merge") {
    setPending(true);
    setMessage("");
    setUncertainMerge(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actor: options.actor, confirmed: true, ...(action === "merge" ? { target: confirmedTarget } : action === "reject" ? { reason } : {}) }),
      });
      const result = await response.json();
      if (!result.ok) {
        setMessage(result.error.message);
        setUncertainMerge(action === "merge" && result.error.code === "outcome_unconfirmed");
      }
      else {
        setCompleted(action);
        setConfirmedTarget(null);
        setReason(null);
        setMessage(action === "accept" ? "Acceptance recorded." : action === "reject" ? "Rejection recorded." : "Revision merged.");
      }
      router.refresh();
    } catch {
      setUncertainMerge(action === "merge");
      setMessage("Workbox could not confirm the action. Refresh this revision before retrying.");
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-2">
    {options.maintainer ? <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="wb-btn" disabled={pending || !options.accept || completed === "accept"} onClick={() => submit("accept")}>Accept revision</button>
      {options.reject !== undefined && <button type="button" className="wb-btn" disabled={pending || !options.reject || completed === "reject"} onClick={() => { setConfirmedTarget(null); setReason(""); }}>Reject revision</button>}
      <button type="button" className="wb-btn" disabled={pending || !options.merge || completed === "reject" || completed === "merge"} onClick={() => { setReason(null); setConfirmedTarget(options.target); }}>Merge revision</button>
    </div> : <p className="wb-muted">A maintainer under this revision’s policy can accept, reject, or merge it.</p>}
    {reason !== null && options.reject && (
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (reason.trim() && !pending) void submit("reject"); }}>
        <label className="block">
          Reason for rejecting this revision
          <textarea required maxLength={4096} value={reason} disabled={pending} onChange={event => setReason(event.target.value)}
            className="mt-1 block w-full rounded border border-[var(--wb-border)] bg-[var(--wb-bg)] p-2" />
        </label>
        <button type="submit" className="wb-btn" disabled={pending || !reason.trim()}>Confirm rejection</button>
        <button type="button" className="wb-btn ml-2" disabled={pending} onClick={() => setReason(null)}>Cancel</button>
      </form>
    )}
    {options.merge_blocker && <p className="wb-muted">{options.merge_blocker}</p>}
    {confirmedTarget && options.merge && confirmedTarget.branch === options.target.branch && confirmedTarget.commit === options.target.commit && <div className="space-y-2">
      <p>Merge this exact revision into <strong>{confirmedTarget.branch}</strong> at <code>{confirmedTarget.commit}</code>?</p>
      <div className="flex gap-2">
        <button type="button" className="wb-btn" disabled={pending} onClick={() => submit("merge")}>Confirm merge</button>
        <button type="button" className="wb-btn" disabled={pending} onClick={() => setConfirmedTarget(null)}>Cancel</button>
      </div>
    </div>}
    {uncertainMerge && confirmedTarget && options.maintainer && (
      <button type="button" className="wb-btn" disabled={pending} onClick={() => submit("merge")}>
        Retry confirmed merge
      </button>
    )}
    {message && <p role="status">{message}</p>}
  </div>;
}
