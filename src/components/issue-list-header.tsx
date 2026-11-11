export default function IssueListHeader({ open, closed }: { open: number; closed: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-[var(--wb-panel-2)] px-4 py-3 text-sm" aria-label="Open and closed counts">
      <span className="inline-flex items-center gap-2 font-semibold">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r=".75" fill="currentColor" stroke="none" />
        </svg>
        {open.toLocaleString("en-US")} Open
      </span>
      <span className="inline-flex items-center gap-2 wb-muted">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="m3 8 3 3 7-7" />
        </svg>
        {closed.toLocaleString("en-US")} Closed
      </span>
    </div>
  );
}
