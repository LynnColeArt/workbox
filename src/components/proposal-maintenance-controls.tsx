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
  const [completed, setCompleted] = useState<"accept" | "merge" | null>(null);

  async function submit(action: "accept" | "merge") {
    setPending(true);
    setMessage("");
    setUncertainMerge(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actor: options.actor, confirmed: true, ...(action === "merge" ? { target: confirmedTarget } : {}) }),
      });
      const result = await response.json();
      if (!result.ok) {
        setMessage(result.error.message);
        setUncertainMerge(action === "merge" && result.error.code === "outcome_unconfirmed");
      }
      else {
        setCompleted(action);
        setConfirmedTarget(null);
        setMessage(action === "accept" ? "Acceptance recorded." : "Revision merged.");
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
      <button type="button" className="wb-btn" disabled={pending || !options.merge || completed === "merge"} onClick={() => setConfirmedTarget(options.target)}>Merge revision</button>
    </div> : <p className="wb-muted">A maintainer under this revision’s policy can accept or merge it.</p>}
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
