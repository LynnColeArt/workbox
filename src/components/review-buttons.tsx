"use client";

import { useState } from "react";

export default function ReviewButtons({
  projectId,
  proposalId,
  state,
}: {
  projectId: string;
  proposalId: string;
  state: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);

  async function send(verdict: string) {
    setBusy(verdict);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId, verdict, comment }),
      });
      const data = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (data.ok) {
        setResult(`${verdict} recorded`);
        window.location.reload();
      } else {
        setError(data.error?.message ?? "failed");
        setBusy(null);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  // hubnot evaluates per-candidate: only live candidates accept reviews.
  // merged/accepted/superseded candidates display state instead of buttons —
  // the engine's refusal is real, not a UI omission.
  if (state !== "candidate") {
    return <span className="wb-chip ml-2">{state}</span>;
  }

  return (
    <div className="ml-2 inline-flex items-center gap-2">
      {!open && (
        <button className="wb-btn" onClick={() => setOpen(true)}>Review</button>
      )}
      {open && (
        <>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Review note (optional)"
                 className="text-xs px-2 py-1 rounded border bg-transparent wb-mono" style={{ borderColor: "var(--wb-border)" }} />
          <button className="wb-btn" disabled={busy !== null}
                  style={{ borderColor: "var(--wb-open)", color: "var(--wb-open)" }}
                  onClick={() => send("approve")}>
            {busy === "approve" ? "…" : "Approve"}
          </button>
          <button className="wb-btn" disabled={busy !== null}
                  style={{ borderColor: "var(--wb-warn)", color: "var(--wb-warn)" }}
                  onClick={() => send("request-changes")}>
            {busy === "request-changes" ? "…" : "Request changes"}
          </button>
          <button className="wb-btn" onClick={() => setOpen(false)}>✕</button>
        </>
      )}
      {result && <span className="text-xs" style={{ color: "var(--wb-open)" }}>{result}</span>}
      {error && <span className="text-xs" style={{ color: "var(--wb-warn)" }} title={error}>refused — see tooltip? hover: {error.slice(0, 60)}</span>}
    </div>
  );
}
