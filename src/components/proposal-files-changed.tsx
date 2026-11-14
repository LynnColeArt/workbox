import { NativeInlineForm } from "./native-inline-form";
import { Fragment } from "react";
import { patchLines } from "@/lib/workbox/patch-lines";
import type { InlineReviewThread } from "@/lib/workbox/inline-review-threads";
import { ChangedFileFilter } from "./changed-file-filter";
import Link from "next/link";
import type { ProposalComparison } from "@/lib/workbox/proposal-comparison";

const patchMessages = {
  binary: "This file is binary. A text patch is unavailable.",
  truncated: "This patch exceeds the display limit. Only the beginning is shown.",
  unavailable: "The patch for this file is unavailable for the exact revision.",
  unlisted: "The selected file is outside the displayed comparison.",
};

export function ProposalFilesChanged({
  comparison,
  detailHref,
  reviewLayout = false,
  inlineThreads = [],
  nativeReview,
}: {
  comparison: ProposalComparison;
  detailHref: string;
  reviewLayout?: boolean;
  inlineThreads?: InlineReviewThread[];
  nativeReview?: { endpoint: string; actor: string };
}) {
  const { files, patch, selectedPath, status } = comparison;
  if (status === "unavailable") {
    return <p>The exact base-to-head comparison is unavailable for this revision.</p>;
  }
  if (status === "available" && files.length === 0) {
    return <p>No files changed between these commits.</p>;
  }

  const links = files.map(({ path, previousPath, status }) => {
    const url = new URL(detailHref, "http://localhost");
    url.searchParams.set("file", path);
    return (
        <Link key={path}
          href={url.pathname + url.search}
          prefetch={false}
          aria-current={path === selectedPath ? "true" : undefined}
          className="wb-panel block px-2 py-1 text-sm break-all whitespace-pre-wrap hover:bg-[var(--wb-panel-2)] aria-current:border-[var(--wb-link)]"
        >
          <span className="mr-2 font-mono">{status}</span>
          {previousPath === undefined ? path : `${previousPath} → ${path}`}
        </Link>
    );
  });

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
      <div className="min-w-0">
        {status === "truncated" && (
          <p className="mb-2 text-sm wb-muted">This file list is incomplete due to display limits or unsupported filenames.</p>
        )}
        {reviewLayout ? <ChangedFileFilter files={files.map(file => file.path)}>{links}</ChangedFileFilter> :
          <ul className="space-y-1" aria-label="Changed files">{links.map(link => <li key={link.key}>{link}</li>)}</ul>}
      </div>
      <div className="min-w-0">
        {selectedPath !== undefined && (
          <h3 className="mb-2 font-mono text-sm break-all whitespace-pre-wrap">{selectedPath}</h3>
        )}
        {!patch && files.length > 0 && <p>Select a file to view its patch.</p>}
        {patch && patch.status !== "available" && <p>{patchMessages[patch.status]}</p>}
        {patch?.text && (reviewLayout ? <PatchLines text={patch.text} threads={inlineThreads} posting={nativeReview && selectedPath ? { ...nativeReview, path: selectedPath } : undefined} /> : (
          <pre className="wb-panel mt-2 overflow-auto p-3 text-xs">
            <code>{patch.text}</code>
          </pre>
        ))}
      </div>
    </div>
  );
}

export function ReviewThread({ thread }: { thread: InlineReviewThread }) {
  return <article aria-label="Inline review thread" className="space-y-2 whitespace-normal break-words">
    {thread.comments.map(comment => <div key={comment.id} className="border-b border-[var(--wb-border)] pb-2 last:border-b-0">
      <strong>{comment.author || "Imported reviewer"}</strong>
      {comment.date && <time className="wb-muted ml-2" dateTime={comment.date}>{comment.date.slice(0, 10)}</time>}
      <p className="whitespace-pre-wrap">{comment.body}</p>
    </div>)}
  </article>;
}

export function PatchLines({ text, threads, posting }: { text: string; threads: InlineReviewThread[]; posting?: { endpoint: string; actor: string; path: string } }) {
  return <div tabIndex={0} role="region" aria-label="File diff" className="wb-panel overflow-auto">
    <table className="w-full border-collapse text-left font-mono text-xs">
      <thead className="sr-only"><tr><th>Old line</th><th>New line</th><th>Change</th></tr></thead>
      <tbody>{patchLines(text).map(({ line, oldLine, newLine, kind }, index) => (
        <Fragment key={index}>
          <tr className={kind === "+" ? "bg-green-950/70" : kind === "-" ? "bg-red-950/70" : kind === "hunk" ? "bg-blue-950/60" : ""}>
            <td className="wb-muted select-none px-2 text-right tabular-nums">{oldLine}</td>
            <td className="wb-muted select-none px-2 text-right tabular-nums">{newLine}</td>
            <td className="w-full whitespace-pre px-3 py-0.5"><code>{line}</code>
            {posting && oldLine !== null && <NativeInlineForm {...posting} side="LEFT" line={oldLine} />}
            {posting && newLine !== null && <NativeInlineForm {...posting} side="RIGHT" line={newLine} />}
            </td>
          </tr>
          {threads.filter(thread => thread.rowIndex === index).map(thread => (
            <tr key={thread.id}><td colSpan={3} className="border-y border-[var(--wb-border)] p-3 font-sans text-sm"><ReviewThread thread={thread} />
              {posting && thread.anchor.line && thread.anchor.side && <NativeInlineForm {...posting} side={thread.anchor.side} line={thread.anchor.line} replyTo={thread.id} />}
            </td></tr>
          ))}
        </Fragment>
      ))}</tbody>
    </table>
  </div>;
}
