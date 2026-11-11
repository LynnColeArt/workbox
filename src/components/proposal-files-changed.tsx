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
}: {
  comparison: ProposalComparison;
  detailHref: string;
}) {
  const { files, patch, selectedPath, status } = comparison;
  if (status === "unavailable") {
    return <p>The exact base-to-head comparison is unavailable for this revision.</p>;
  }
  if (status === "available" && files.length === 0) {
    return <p>No files changed between these commits.</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="min-w-0">
        {status === "truncated" && (
          <p className="mb-2 text-sm wb-muted">This file list is incomplete due to display limits or unsupported filenames.</p>
        )}
        <ul className="space-y-1" aria-label="Changed files">
          {files.map(({ path, previousPath, status }) => {
            const url = new URL(detailHref, "http://localhost");
            url.searchParams.set("file", path);
            return (
              <li key={path}>
                <Link
                  href={url.pathname + url.search}
                  prefetch={false}
                  aria-current={path === selectedPath ? "true" : undefined}
                  className="wb-panel block px-2 py-1 text-sm break-all whitespace-pre-wrap hover:bg-[var(--wb-panel-2)] aria-current:border-[var(--wb-link)]"
                >
                  <span className="mr-2 font-mono">{status}</span>
                  {previousPath === undefined ? path : `${previousPath} → ${path}`}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="min-w-0">
        {selectedPath !== undefined && (
          <h3 className="mb-2 font-mono text-sm break-all whitespace-pre-wrap">{selectedPath}</h3>
        )}
        {!patch && files.length > 0 && <p>Select a file to view its patch.</p>}
        {patch && patch.status !== "available" && <p>{patchMessages[patch.status]}</p>}
        {patch?.text && (
          <pre className="wb-panel mt-2 overflow-auto p-3 text-xs">
            <code>{patch.text}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
