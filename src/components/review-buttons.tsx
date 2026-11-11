"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ReviewVerdict } from "@/lib/workbox/proposal-actions";

export default function ReviewButtons({
  projectId,
  proposalId,
  state,
}: {
  projectId: string;
  proposalId: string;
  state: string;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState<ReviewVerdict | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);

  async function send(verdict: ReviewVerdict) {
    if (submitting.current || state !== "candidate") return;
    submitting.current = true;
    const submittedPage = window.location.href;
    setBusy(verdict);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId, verdict, comment }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        data?: { projectId: string; proposalId: string; verdict: string };
        error?: { message: string; uncertain?: boolean };
      };
      if (response.ok && data.ok && data.data?.projectId === projectId &&
          data.data.proposalId === proposalId && data.data.verdict === verdict) {
        setResult("Review recorded.");
        setComment("");
        setOpen(false);
        submitting.current = false;
        if (window.location.href === submittedPage) router.refresh();
        return;
      }
      if (data.ok !== false || typeof data.error?.message !== "string") {
        throw new Error("Unexpected review response");
      }
      setError(data.error.message);
      if (data.error.uncertain) {
        setUncertain(true);
      } else {
        submitting.current = false;
      }
    } catch {
      setError("The review outcome could not be confirmed. Refresh this revision and check Conversation before submitting again.");
      setUncertain(true);
    } finally {
      setBusy(null);
    }
  }

  if (state !== "candidate") {
    return <span className="wb-chip ml-2">{state}</span>;
  }

  const disabled = busy !== null || uncertain;
  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-2">
      {!open && (
        <button type="button" className="wb-btn" onClick={() => { setResult(null); setOpen(true); }}>
          {result ? "Review again" : "Review"}
        </button>
      )}
      {open && (
        <>
          <label className="flex max-w-full flex-wrap items-center gap-2 text-xs">
            <span className="wb-muted">Review note (optional)</span>
            <input value={comment} disabled={disabled} onChange={(event) => setComment(event.target.value)}
                   className="max-w-full rounded border border-[var(--wb-border)] bg-transparent px-2 py-1" />
          </label>
          <button type="button" className="wb-btn" disabled={disabled} onClick={() => send("approve")}>
            {busy === "approve" ? "Submitting approval…" : "Approve"}
          </button>
          <button type="button" className="wb-btn" disabled={disabled} onClick={() => send("request-changes")}>
            {busy === "request-changes" ? "Submitting changes request…" : "Request changes"}
          </button>
          <button type="button" className="wb-btn" disabled={disabled} onClick={() => setOpen(false)}>Cancel</button>
        </>
      )}
      {result && <span role="status" className="text-xs">{result}</span>}
      {error && <span role="alert" className="basis-full text-xs">{error}</span>}
    </div>
  );
}
