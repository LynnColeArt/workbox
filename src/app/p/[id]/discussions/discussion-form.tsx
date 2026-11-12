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

const recoverable = new Set(["native_unavailable", "admission_pending", "concurrent_update", "output_limit", "invalid_history", "repository_error"]);

export function DiscussionForm({ endpoint, actor, action, fields, replies, submitLabel, heading, navigate }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<FormFields | null>(null);
  const { title = "", category = "", body = "" } = draft ?? fields ?? {};
  const [replyTo, setReplyTo] = useState(fields?.replyTo ?? "");
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const [reviewedExpected, setReviewedExpected] = useState(action.expected);
  const revisionBound = fields?.body !== undefined && action.expected !== undefined;
  const changed = revisionBound && draft !== null && JSON.stringify(reviewedExpected) !== JSON.stringify(action.expected);
  const locked = busy || pending !== null;
  const draftKey = fields?.body !== undefined && action.discussionId && action.action !== "reply"
    ? `workbox:discussion-draft:${endpoint}:${String(action.replyId ?? action.discussionId)}` : null;

  function edit(patch: FormFields) {
    if (!draft) setReviewedExpected(action.expected);
    const next = { title, category, body, ...patch };
    setDraft(next);
    if (draftKey) {
      try {
        sessionStorage.setItem(draftKey, JSON.stringify(next));
      } catch { /* Keep the live draft if browser storage is unavailable. */ }
    }
  }

  function refreshDiscussion() {
    if (draftKey) {
      try {
        sessionStorage.setItem(draftKey, JSON.stringify({ title, category, body }));
      } catch {
        setMessage("Your draft is still here. Copy it before reloading to review the new revision.");
        return;
      }
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has("cursor")) {
      url.searchParams.delete("cursor");
      if (typeof action.replyId === "string") {
        url.searchParams.set("reply", action.replyId);
        url.hash = "reply-context";
      }
      router.push(url.pathname + url.search + url.hash);
    } else router.refresh();
    setStale(false);
    setMessage("Review the refreshed revisions before submitting again. Your draft is still here.");
  }

  function restoreDraft() {
    try {
      const raw = draftKey && sessionStorage.getItem(draftKey);
      if (!raw) {
        setMessage("There is no saved draft for this item.");
        return;
      }
      const saved = JSON.parse(raw) as FormFields;
      setReviewedExpected(action.expected);
      setDraft({
        title: typeof saved.title === "string" ? saved.title : title,
        category: typeof saved.category === "string" ? saved.category : category,
        body: typeof saved.body === "string" ? saved.body : body,
      });
      setMessage("Draft restored. Review it against the selected revision before signing.");
    } catch {
      setMessage("Workbox could not read the saved draft.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (changed && !pending)) return;
    const request = pending ?? {
      ...action, ...(revisionBound && draft ? { expected: reviewedExpected } : {}),
      actor: actor.actor, operationId: crypto.randomUUID(),
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
        const preflight = ["not_found", "signer_unavailable", "actor_mismatch"].includes(result.error.code);
        setPending(recoverable.has(result.error.code) || (pending && preflight) ? request : null);
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
      setDraft(null);
      try {
        if (draftKey) sessionStorage.removeItem(draftKey);
      } catch { /* The signed write already succeeded. */ }
      if (action.action === "reply") {
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
      {changed && !pending && <div className="space-y-2 text-sm">
        <p role="status">This item has a new revision. Review it above before applying your draft.</p>
        <button type="button" className="wb-btn" onClick={() => setReviewedExpected(action.expected)}>
          Use current revision and keep draft
        </button>
      </div>}
      {fields?.title !== undefined && <label className="block text-sm">Title
        <input required value={title} onChange={event => edit({ title: event.target.value })} disabled={locked} className="wb-btn mt-1 w-full" />
      </label>}
      {fields?.category !== undefined && <label className="block text-sm">Category
        <input required value={category} onChange={event => edit({ category: event.target.value })} disabled={locked} className="wb-btn mt-1 w-full" />
      </label>}
      {replies && replies.length > 0 && <label className="block text-sm">Reply to
        <select value={replyTo} onChange={event => setReplyTo(event.target.value)} disabled={locked} className="wb-btn ml-2">
          <option value="">Discussion</option>
          {replies.map(reply => <option value={reply.id} key={reply.id}>{reply.label}</option>)}
        </select>
      </label>}
      {fields?.body !== undefined && <MarkdownEditor label={action.action === "reply" ? "Reply" : "Body"}
        value={body} onChange={value => edit({ body: value })} disabled={locked} required={action.action === "reply"} />}
      <div className="flex flex-wrap items-center gap-3">
        <button className="wb-btn" disabled={busy || (changed && !pending)} type="submit">
          {busy ? "Signing…" : pending ? "Retry submission" : submitLabel}
        </button>
        <span className="wb-muted text-xs" title={actor.actor}>Signing as {actor.name || actor.actor.slice(0, 12)}</span>
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
      {stale && <button type="button" className="wb-btn" onClick={refreshDiscussion}>Refresh discussion</button>}
      {draftKey &&
        <button type="button" disabled={locked} className="wb-btn" onClick={restoreDraft}>Restore saved draft</button>}
    </form>
  );
}
