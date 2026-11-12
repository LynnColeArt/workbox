"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MarkdownEditor } from "@/components/markdown-editor";

type FormFields = {
  title?: string;
  category?: string;
  body?: string;
  replyTo?: string;
};

type Props = {
  endpoint: string;
  actor: { actor: string; name: string };
  action: Record<string, unknown>;
  fields?: FormFields;
  replies?: { id: string; label: string }[];
  submitLabel: string;
  heading?: string;
  navigate?: boolean;
};

const recoverable = new Set(["native_unavailable", "admission_pending", "concurrent_update", "output_limit"]);

export function DiscussionForm({ endpoint, actor, action, fields, replies, submitLabel, heading, navigate }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(fields?.title ?? "");
  const [category, setCategory] = useState(fields?.category ?? "");
  const [body, setBody] = useState(fields?.body ?? "");
  const [replyTo, setReplyTo] = useState(fields?.replyTo ?? "");
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const locked = busy || pending !== null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const request = pending ?? {
      ...action, actor: actor.actor, operationId: crypto.randomUUID(),
      ...(fields?.title !== undefined ? { title } : {}),
      ...(fields?.category !== undefined ? { category } : {}),
      ...(fields?.body !== undefined ? { body } : {}),
      ...(replyTo ? { replyTo } : {}),
    };
    setBusy(true);
    setMessage("");
    setStale(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request),
      });
      const result = await response.json();
      if (!result.ok) {
        setPending(recoverable.has(result.error.code) ? request : null);
        setMessage(result.error.message);
        setStale(["stale_revision", "resource_conflict"].includes(result.error.code));
        return;
      }
      if (!result.data.indexed) {
        setPending(request);
        setMessage("Hubnot signed your change. Retry to refresh Workbox without signing it again.");
        return;
      }
      setPending(null);
      setMessage("Change signed.");
      if (action.action === "reply") {
        setBody("");
        setReplyTo("");
      }
      const current = window.location.pathname + window.location.search + window.location.hash;
      if ((navigate || action.action === "reply" || window.location.search) && result.data.href !== current) {
        router.push(result.data.href);
      } else router.refresh();
    } catch {
      setPending(request);
      setMessage("Workbox could not confirm the result. Retry the same submission.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="wb-panel space-y-3 p-4">
      {heading && <h2 className="font-semibold">{heading}</h2>}
      {fields?.title !== undefined && <label className="block text-sm">Title
        <input required value={title} onChange={event => setTitle(event.target.value)} disabled={locked} className="wb-btn mt-1 w-full" />
      </label>}
      {fields?.category !== undefined && <label className="block text-sm">Category
        <input required value={category} onChange={event => setCategory(event.target.value)} disabled={locked} className="wb-btn mt-1 w-full" />
      </label>}
      {replies && replies.length > 0 && <label className="block text-sm">Reply to
        <select value={replyTo} onChange={event => setReplyTo(event.target.value)} disabled={locked} className="wb-btn ml-2">
          <option value="">Discussion</option>
          {replies.map(reply => <option value={reply.id} key={reply.id}>{reply.label}</option>)}
        </select>
      </label>}
      {fields?.body !== undefined && <MarkdownEditor label={action.action === "reply" ? "Reply" : "Body"}
        value={body} onChange={setBody} disabled={locked} required={action.action === "reply"} />}
      <div className="flex flex-wrap items-center gap-3">
        <button className="wb-btn" disabled={busy} type="submit">
          {busy ? "Signing…" : pending ? "Retry submission" : submitLabel}
        </button>
        <span className="wb-muted text-xs" title={actor.actor}>Signing as {actor.name || actor.actor.slice(0, 12)}</span>
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
      {stale && <button type="button" className="wb-btn" onClick={() => {
        router.refresh();
        setStale(false);
        setMessage("Review the refreshed revisions before submitting again. Your draft is still here.");
      }}>Refresh discussion</button>}
    </form>
  );
}
