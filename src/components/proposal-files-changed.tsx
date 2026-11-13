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
}: {
  comparison: ProposalComparison;
  detailHref: string;
  reviewLayout?: boolean;
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
        {patch?.text && (reviewLayout ? <PatchLines text={patch.text} /> : (
          <pre className="wb-panel mt-2 overflow-auto p-3 text-xs">
            <code>{patch.text}</code>
          </pre>
        ))}
      </div>
    </div>
  );
}

function PatchLines({ text }: { text: string }) {
  let before = 0;
  let after = 0;
  let inHunk = false;
  return <div tabIndex={0} role="region" aria-label="File diff" className="wb-panel overflow-auto">
    <table className="w-full border-collapse text-left font-mono text-xs">
      <thead className="sr-only"><tr><th>Old line</th><th>New line</th><th>Change</th></tr></thead>
      <tbody>{text.replace(/\n$/, "").split("\n").map((line, index) => {
        const hunk = /^@@ -([0-9]+)(?:,[0-9]+)? \+([0-9]+)(?:,[0-9]+)? @@/.exec(line);
        if (hunk) {
          before = Number(hunk[1]);
          after = Number(hunk[2]);
          inHunk = true;
        }
        const marker = inHunk && !hunk ? line[0] : "";
        const added = marker === "+";
        const removed = marker === "-";
        const context = marker === " ";
        const oldLine = removed || context ? before++ : null;
        const newLine = added || context ? after++ : null;
        return <tr key={index} className={added ? "bg-green-950/70" : removed ? "bg-red-950/70" : hunk ? "bg-blue-950/60" : ""}>
          <td className="wb-muted select-none px-2 text-right tabular-nums">{oldLine}</td>
          <td className="wb-muted select-none px-2 text-right tabular-nums">{newLine}</td>
          <td className="w-full whitespace-pre px-3 py-0.5"><code>{line}</code></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
