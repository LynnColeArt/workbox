"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function NativeInlineForm({ endpoint, actor, path, side, line, replyTo, state }: {
  endpoint: string; actor: string; path: string; side: string; line: number; replyTo?: string; state?: "open" | "resolved";
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const retry = useRef<{ body: string; operation: string } | null>(null);
  const label = replyTo ? "Reply" : `Comment on ${side === "LEFT" ? "old" : "new"} line ${line}`;
  const form = <form className="space-y-2 p-2" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const form = event.currentTarget;
      const body = String(new FormData(form).get("body") ?? "");
      if (retry.current?.body !== body) retry.current = { body, operation: crypto.randomUUID() };
      setBusy(true);
      setError("");
      try {
        const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ actor, path, side, line, replyTo, operation: retry.current.operation, ...(state ? { state } : { body }) }) });
        const result = await response.json();
        if (!result.ok) setError(result.error.message);
        else { form.reset(); retry.current = null; router.refresh(); }
      } catch { setError("Posting failed. Retry to check the same operation."); }
      finally { setBusy(false); }
    }}>
      {!state && <textarea name="body" aria-label={label} required maxLength={16384} className="wb-btn w-full" />}
      <button type="submit" disabled={busy} className="wb-btn">{state === "resolved" ? "Resolve thread" : state === "open" ? "Reopen thread" : replyTo ? "Post reply" : "Post comment"}</button>
      {error && <p role="alert">{error}</p>}
    </form>;
  return state ? form : <details className="my-1 whitespace-normal">
    <summary className="wb-link cursor-pointer">{label}</summary>
    {form}
  </details>;
}
