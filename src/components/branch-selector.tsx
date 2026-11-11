"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * GitHub-spec branch selector for the Code page header: a pulldown listing
 * every branch, switching revs in place; "View all branches" opens the
 * branches sub-view exactly like GitHub's View-all-branches link.
 */
export default function BranchSelector({
  projectId,
  current,
  branches,
  path,
}: {
  projectId: string;
  current: string;
  branches: string[];
  path: string;
}) {
  const router = useRouter();
  return (
    <span className="inline-flex items-center gap-3">
      <select
        value={current}
        onChange={(e) => {
          const params = new URLSearchParams({ rev: e.target.value });
          if (path) params.set("path", path);
          router.push(`/p/${projectId}/code?${params.toString()}`);
        }}
        className="wb-btn wb-mono text-sm"
        aria-label="Switch branches"
      >
        {branches.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      <Link href={`/p/${projectId}/branches`} className="wb-link text-sm">View all branches</Link>
    </span>
  );
}
