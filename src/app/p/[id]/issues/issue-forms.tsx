"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MarkdownEditor } from "@/components/markdown-editor";
import type { SigningAvailability } from "@/lib/workbox/collaboration";
import type { IssueDetails } from "@/lib/workbox/issues";

type IssueFormProps = { project: string; signer: SigningAvailability };
type Outcome = { href: string; indexed: boolean; eventId: string };
type Operation = Record<string, unknown> & { action: string };
const uncertain = new Set(["native_unavailable", "concurrent_update", "admission_pending", "output_limit", "invalid_history", "repository_error"]);
const blockedRetry = new Set(["signer_unavailable", "actor_mismatch", "not_found"]);

function useIssueSubmission(project: string, signer: SigningAvailability) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Operation | null>(null);

  async function submit(operation: Operation, saved?: (outcome: Outcome) => void) {
    if (!signer.available || busy) return;
    const request = pending ?? { ...operation, actor: signer.identity.actor, operationId: crypto.randomUUID() };
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project)}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const result = await response.json();
      if (!result.ok) {
        const code = result.error?.code;
        setPending(uncertain.has(code) || (pending && blockedRetry.has(code)) ? request : null);
        setError(result.error?.message ?? "Workbox could not save the issue change.");
        return;
      }
      const outcome: Outcome = result.data;
      if (!outcome.indexed) {
        setPending(request);
        setError("Hubnot signed your change. Retry to finish updating the Workbox index.");
        return;
      }
      setPending(null);
      setNotice("Saved.");
      saved?.(outcome);
      if (request.action === "create") router.push(outcome.href);
      else if (window.location.search) router.replace(outcome.href, { scroll: false });
      else router.refresh();
    } catch {
      setPending(request);
      setError("Workbox could not confirm the result. Retry the same submission.");
    } finally {
      setBusy(false);
    }
  }

  return { submit, error, notice, busy, pending: pending !== null, reload: () => router.refresh() };
}

function SigningIdentity({ signer }: { signer: SigningAvailability }) {
  return signer.available
    ? <p className="wb-muted text-xs">Signing as <span title={signer.identity.actor}>{signer.identity.name || signer.identity.actor.slice(0, 12)}</span></p>
    : <p className="wb-muted text-sm">{signer.reason}</p>;
}

function SubmissionStatus({ submission, showReload = false }: { submission: ReturnType<typeof useIssueSubmission>; showReload?: boolean }) {
  return <>
    {submission.error && <p role="alert" className="text-sm" style={{ color: "var(--wb-warn)" }}>{submission.error}</p>}
    {submission.notice && <p role="status" className="wb-muted text-sm">{submission.notice}</p>}
    {showReload && submission.error && !submission.pending && (
      <button className="wb-btn" type="button" onClick={submission.reload}>Reload current issue</button>
    )}
  </>;
}

const fieldClass = "w-full rounded border border-[var(--wb-border)] bg-[var(--wb-bg)] px-3 py-2 text-sm";
const parseLabels = (text: string) => text.split("\n").filter(line => line.trim() !== "");

export function NewIssueForm({ project, signer }: IssueFormProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [labels, setLabels] = useState("");
  const submission = useIssueSubmission(project, signer);
  const disabled = !signer.available || submission.busy || submission.pending;
  return (
    <details className="wb-panel mb-4 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">New issue</summary>
      <form className="mt-3 space-y-3" onSubmit={event => {
        event.preventDefault();
        void submission.submit({ action: "create", title, body, labels: parseLabels(labels) });
      }}>
        <label className="block text-sm">Title
          <input className={fieldClass} required maxLength={1024} value={title} onChange={event => setTitle(event.target.value)} disabled={disabled} />
        </label>
        <MarkdownEditor label="Description" value={body} onChange={setBody} disabled={disabled} />
        <label className="block text-sm">Labels (one per line)
          <textarea rows={2} className={fieldClass} value={labels} onChange={event => setLabels(event.target.value)} disabled={disabled} />
        </label>
        <SigningIdentity signer={signer} />
        <SubmissionStatus submission={submission} />
        <button className="wb-btn" type="submit" disabled={!signer.available || submission.busy}>
          {submission.pending ? "Retry opening issue" : "Sign and open issue"}
        </button>
      </form>
    </details>
  );
}

export function IssueCommentForm({ project, signer, issueId }: IssueFormProps & { issueId: string }) {
  const [body, setBody] = useState("");
  const submission = useIssueSubmission(project, signer);
  return (
    <form className="wb-panel my-5 space-y-3 p-4" onSubmit={event => {
      event.preventDefault();
      void submission.submit({ action: "comment", issueId, body }, () => setBody(""));
    }}>
      <MarkdownEditor label="Leave a comment" value={body} onChange={setBody} required disabled={!signer.available || submission.busy || submission.pending} />
      <SigningIdentity signer={signer} />
      <SubmissionStatus submission={submission} />
      <button className="wb-btn" type="submit" disabled={!signer.available || submission.busy}>
        {submission.pending ? "Retry comment" : "Sign and comment"}
      </button>
    </form>
  );
}

type Review = { headIds: string[]; basis?: string };
function issueFields(issue: IssueDetails, basis?: string) {
  const selected = issue.heads.find(head => head.id === basis)?.state ?? issue.state;
  return {
    title: selected?.title ?? "",
    body: selected?.body ?? "",
    labels: selected?.labels.join("\n") ?? "",
    status: selected?.status ?? "open",
  };
}

export function IssueEditForm({ project, issue }: { project: string; issue: IssueDetails }) {
  const { signer } = issue;
  const [review, setReview] = useState<Review>({ headIds: issue.headIds, basis: issue.heads[0]?.id });
  const [draft, setDraft] = useState(() => issueFields(issue, review.basis));
  const submission = useIssueSubmission(project, signer);
  const changed = review.headIds.join(",") !== issue.headIds.join(",");
  const resolving = review.headIds.length > 1;
  const allowed = resolving ? issue.actions.resolve : issue.actions.revise;
  const disabled = !signer.available || submission.busy || submission.pending;
  const change = (field: "title" | "body" | "labels", value: string) => setDraft(previous => ({ ...previous, [field]: value }));

  function save(event: FormEvent) {
    event.preventDefault();
    if (!submission.pending && (changed || !allowed)) return;
    const common = { issueId: issue.issueId, expected: review.headIds, title: draft.title, body: draft.body, labels: parseLabels(draft.labels) };
    const payload = resolving ? { action: "resolve", ...common, basis: review.basis, status: draft.status } : { action: "revise", ...common };
    void submission.submit(payload, outcome => setReview({ headIds: [outcome.eventId] }));
  }

  return (
    <details className="wb-panel mb-4 p-4">
      <summary className="cursor-pointer text-sm font-semibold">{issue.conflict ? "Resolve competing revisions" : "Edit issue"}</summary>
      <form className="mt-3 space-y-3" onSubmit={save}>
        {changed && (
          <div className="space-y-2">
            <p role="status" className="text-sm">The issue changed. Compare the current revisions above before using them as the basis for your draft.</p>
            <button className="wb-btn" type="button" disabled={disabled} onClick={() => {
              setReview({ headIds: issue.headIds, basis: issue.heads[0]?.id });
            }}>Use current revisions and keep draft</button>
          </div>
        )}
        {resolving && (
          <>
            <label className="block text-sm">Use revision as a starting point
              <select className={fieldClass} value={review.basis} disabled={disabled || changed} onChange={event => {
                setReview(previous => ({ ...previous, basis: event.target.value }));
                setDraft(issueFields(issue, event.target.value));
              }}>
                {issue.heads.map(head => <option key={head.id} value={head.id}>{head.actorName} · {head.id.slice(7, 19)} · {head.state.title}</option>)}
              </select>
            </label>
            <label className="block text-sm">Resolved status
              <select className={fieldClass} value={draft.status} disabled={disabled} onChange={event => {
                setDraft(previous => ({ ...previous, status: event.target.value === "closed" ? "closed" : "open" }));
              }}><option value="open">Open</option><option value="closed">Closed</option></select>
            </label>
          </>
        )}
        <label className="block text-sm">Title
          <input className={fieldClass} required maxLength={1024} value={draft.title} onChange={event => change("title", event.target.value)} disabled={disabled} />
        </label>
        <MarkdownEditor label="Description" value={draft.body} onChange={value => change("body", value)} disabled={disabled} />
        <label className="block text-sm">Labels (one per line)
          <textarea rows={2} className={fieldClass} value={draft.labels} onChange={event => change("labels", event.target.value)} disabled={disabled} />
        </label>
        <SigningIdentity signer={signer} />
        <SubmissionStatus submission={submission} showReload />
        <button className="wb-btn" type="submit" disabled={submission.busy || !signer.available || (!submission.pending && (!allowed || changed))}>
          {submission.pending ? "Retry saving issue" : resolving ? "Sign and resolve issue" : "Sign and save issue"}
        </button>
      </form>
    </details>
  );
}

export function IssueStatusForm({ project, issue }: { project: string; issue: IssueDetails }) {
  const submission = useIssueSubmission(project, issue.signer);
  const action = issue.actions.close ? "close" : "reopen";
  if (!issue.actions.close && !issue.actions.reopen && !submission.pending) return null;
  return (
    <form className="mb-4 space-y-2" onSubmit={event => {
      event.preventDefault();
      void submission.submit({ action, issueId: issue.issueId, expected: issue.headIds });
    }}>
      <SigningIdentity signer={issue.signer} />
      <SubmissionStatus submission={submission} showReload />
      <button className="wb-btn" type="submit" disabled={submission.busy || !issue.signer.available}>
        {submission.pending ? "Retry changing status" : action === "close" ? "Sign and close issue" : "Sign and reopen issue"}
      </button>
    </form>
  );
}
