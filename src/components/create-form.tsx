"use client";

import { useState } from "react";
import { MarkdownEditor } from "./markdown-editor";

type ExactProposal = { actor: string; base: string; head: string };
type Payload = Record<string, string | ExactProposal> & { exact?: ExactProposal };

export function CreateForm({
  label,
  endpoint,
  fields,
  cta,
  signedRetry = false,
}: {
  label: string;
  endpoint: string;
  fields: Array<{ key: string; placeholder: string; textarea?: boolean; markdown?: boolean; required?: boolean }>;
  cta: string;
  signedRetry?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    let payload: Payload = pending ?? (signedRetry ? { ...values, operationId: crypto.randomUUID() } : values);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (signedRetry && !pending) {
        const prepared = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, prepare: true }),
        });
        const result = (await prepared.json()) as { ok: boolean; data?: { exact: Payload["exact"] }; error?: { message: string } };
        if (!result.ok || !result.data?.exact) {
          setError(result.error?.message ?? "Could not prepare the proposal.");
          return;
        }
        payload = { ...payload, exact: result.data.exact };
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok: boolean; data?: { number?: number | null; url?: string }; error?: { code?: string; message: string } };
      if (data.ok) {
        setPending(null);
        setResult(data.data?.number != null ? `created #${data.data.number}` : "created");
        if (data.data?.url) {
          window.location.href = data.data.url;
        }
      } else {
        const definitive = ["invalid_input", "permission_denied", "policy_required", "stale_base", "denied", "operation_conflict"];
        setPending(signedRetry && !definitive.includes(data.error?.code ?? "") ? payload : null);
        setError(data.error?.message ?? "failed");
      }
    } catch (err) {
      if (signedRetry && payload.exact) setPending(payload);
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
        f.markdown ? (
          <MarkdownEditor key={f.key} label={f.placeholder} value={values[f.key] ?? ""}
            disabled={busy || !!pending} required={f.required}
            onChange={value => setValues(previous => ({ ...previous, [f.key]: value }))} />
        ) : f.textarea ? (
          <textarea key={f.key} value={values[f.key] ?? ""} placeholder={f.placeholder} rows={4}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded border bg-transparent" style={{ borderColor: "var(--wb-border)" }} />
        ) : (
          <input key={f.key} disabled={busy || !!pending} required={f.required} value={values[f.key] ?? ""} placeholder={f.placeholder}
                 onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                 className="w-full text-sm px-3 py-2 rounded border bg-transparent" style={{ borderColor: "var(--wb-border)" }} />
        )
      ))}
      <div className="flex gap-2 items-center">
        <button type="submit" disabled={busy} className="wb-btn">{busy ? "working…" : pending ? "Retry submission" : cta}</button>
        <button type="button" onClick={() => setOpen(false)} className="wb-btn">Cancel</button>
        {result && <span className="text-sm" style={{ color: "var(--wb-open)" }}>{result}</span>}
        {error && <span className="text-sm" style={{ color: "var(--wb-warn)" }}>{error}</span>}
      </div>
      <p className="wb-muted text-xs">Signed by this project's hubnot identity through the real CLI.</p>
    </form>
  );
}
