const statuses = {
  open: ["Open", "var(--wb-open)"],
  closed: ["Closed", "var(--wb-closed)"],
  merged: ["Merged", "var(--wb-closed)"],
  conflict: ["Competing revisions", "var(--wb-warn)"],
} as const;

export function StatusTag({ status }: { status: keyof typeof statuses }) {
  const [label, color] = statuses[status];
  return <span className="wb-chip" style={{ color }}>{label}</span>;
}
