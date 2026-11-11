"use client";

import { useState } from "react";

export default function DescriptionEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/description`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: value }),
      });
      const data = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (data.ok) {
        setSaved("saved");
        setOpen(false);
        window.location.reload();
      } else {
        setSaved(data.error?.message ?? "failed");
      }
    } catch (err) {
      setSaved((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <p className="wb-muted text-sm mb-4 flex items-center gap-2">
        {initial || <span className="italic">No description yet.</span>}
        <button onClick={() => setOpen(true)} className="wb-chip cursor-pointer" title="Edit description (Workbox curation)">
          edit
        </button>
        {saved && <span className="text-xs" style={{ color: "var(--wb-warn)" }}>{saved}</span>}
      </p>
    );
  }
  return (
    <form onSubmit={save} className="mb-4 space-y-2">
      <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3}
                className="w-full text-sm px-3 py-2 rounded border bg-transparent" style={{ borderColor: "var(--wb-border)" }}
                placeholder="What is this project for?" />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="wb-btn">{busy ? "saving…" : "Save"}</button>
        <button type="button" onClick={() => setOpen(false)} className="wb-btn">Cancel</button>
      </div>
      <p className="wb-muted text-xs">Stored by Workbox (the portal); the underlying repo is untouched.</p>
    </form>
  );
}
