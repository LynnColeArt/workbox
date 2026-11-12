"use client";

import { Close } from "@radix-ui/react-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CreateProjectInput, CreateProjectResult } from "@/lib/workbox/create";

type Success = Extract<CreateProjectResult, { ok: true }>["data"];
type Failure = Pick<Extract<CreateProjectResult, { ok: false }>["error"], "message" | "recovery">;

const unknownOutcome: Failure = {
  message: "Workbox could not confirm the result. Check Explore before submitting again.",
};
const inputClass = "w-full rounded border border-[var(--wb-border)] bg-transparent px-3 py-2 text-sm";

export default function NewProjectForm({
  beginSubmission, endSubmission,
}: {
  beginSubmission: () => boolean;
  endSubmission: () => void;
}) {
  const router = useRouter();
  const [input, setInput] = useState({ id: "", name: "", description: "" });
  const [pendingAction, setPendingAction] = useState<"create" | "index" | null>(null);
  const [result, setResult] = useState<Success | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const projectLink = useRef<HTMLAnchorElement>(null);
  const busy = pendingAction !== null;
  const retryIndex = error?.recovery === "retry_indexing" || pendingAction === "index";

  useEffect(() => {
    if (result) projectLink.current?.focus();
  }, [result]);

  function update(field: keyof CreateProjectInput, value: string) {
    setInput((previous) => ({ ...previous, [field]: value }));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.id.trim() || !beginSubmission()) return;
    setPendingAction(retryIndex ? "index" : "create");
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const receipt = (await response.json()) as CreateProjectResult;
      const expectedId = input.id.trim();
      const expectedHref = `/p/${encodeURIComponent(expectedId)}`;
      const issuePrefix = `${expectedHref}/issue/`;
      if (response.ok && receipt.ok && receipt.data.id === expectedId && receipt.data.url === expectedHref &&
          receipt.data.foundingIssue.url.startsWith(issuePrefix) &&
          /^sha256%3A[0-9a-f]{64}$/.test(receipt.data.foundingIssue.url.slice(issuePrefix.length))) {
        setResult(receipt.data);
        router.refresh();
      } else if (!response.ok && receipt.ok === false && typeof receipt.error.message === "string") {
        setError(receipt.error);
      } else {
        setError(unknownOutcome);
      }
    } catch {
      setError(unknownOutcome);
    } finally {
      setPendingAction(null);
      endSubmission();
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <p role="status" className="wrap-anywhere text-sm">Created project <strong>{result.id}</strong>.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link ref={projectLink} href={result.url} className="wb-link text-sm font-medium">Open project</Link>
          <Link href={result.foundingIssue.url} className="wb-link text-sm">Open founding issue</Link>
          <Close className="wb-btn ml-auto">Close</Close>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Project ID</span>
        <input
          name="id" value={input.id} onChange={(event) => update("id", event.target.value)}
          className={`${inputClass} wb-mono`} required readOnly={busy} autoComplete="off"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Display name</span>
        <input
          name="name" value={input.name} onChange={(event) => update("name", event.target.value)}
          className={inputClass} readOnly={busy} placeholder="Defaults to the project ID"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Description</span>
        <textarea
          name="description" value={input.description} onChange={(event) => update("description", event.target.value)}
          className={inputClass} readOnly={busy} rows={3}
        />
      </label>
      {error && <p role="alert" className="text-sm text-[var(--wb-warn)]">{error.message}</p>}
      {busy && <p role="status" className="wb-muted text-sm">{retryIndex ? "Indexing project…" : "Creating project…"}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Close className="wb-btn" aria-disabled={busy}>Cancel</Close>
        <button
          type="submit" className="wb-btn bg-[var(--wb-accent-dim)] font-medium aria-disabled:opacity-50"
          aria-disabled={busy}
        >
          {retryIndex ? "Retry indexing" : "Create project"}
        </button>
      </div>
    </form>
  );
}
