"use client";

import { useState } from "react";

export function CreateForm({
  label,
  endpoint,
  fields,
  cta,
}: {
  label: string;
  endpoint: string;
  fields: Array<{ key: string; placeholder: string; textarea?: boolean; required?: boolean }>;
  cta: string;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { ok: boolean; data?: { number?: number | null; url?: string }; error?: { message: string } };
      if (data.ok) {
        setResult(data.data?.number != null ? `created #${data.data.number}` : "created");
        if (data.data?.url) {
          window.location.href = data.data.url;
        }
      } else {
        setError(data.error?.message ?? "failed");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="wb-btn mb-4">
        {label}
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="wb-panel p-4 mb-4 space-y-3">
      {fields.map((f) => (
        f.textarea ? (
          <textarea key={f.key} value={values[f.key] ?? ""} placeholder={f.placeholder} rows={4}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded border bg-transparent" style={{ borderColor: "var(--wb-border)" }} />
        ) : (
          <input key={f.key} required={f.required} value={values[f.key] ?? ""} placeholder={f.placeholder}
                 onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                 className="w-full text-sm px-3 py-2 rounded border bg-transparent" style={{ borderColor: "var(--wb-border)" }} />
        )
      ))}
      <div className="flex gap-2 items-center">
        <button type="submit" disabled={busy} className="wb-btn">{busy ? "working…" : cta}</button>
        <button type="button" onClick={() => setOpen(false)} className="wb-btn">Cancel</button>
        {result && <span className="text-sm" style={{ color: "var(--wb-open)" }}>{result}</span>}
        {error && <span className="text-sm" style={{ color: "var(--wb-warn)" }}>{error}</span>}
      </div>
      <p className="wb-muted text-xs">Signed by this project's hubnot identity through the real CLI.</p>
    </form>
  );
}
