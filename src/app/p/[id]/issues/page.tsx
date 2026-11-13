import { FilterTag } from "@/components/filter-tag";
import { CursorPagination } from "@/components/list-pagination";
import { StatusTag } from "@/components/status-tag";
import { workboxPageSize } from "@/lib/workbox/list-settings";
import Link from "next/link";
import { connection } from "next/server";
import { collaborationProject } from "@/lib/workbox/collaboration";
import { readIssueList } from "@/lib/workbox/issues";
import { NewIssueForm } from "./issue-forms";

export const instant = false;

type Query = { q?: string | string[]; label?: string | string[]; status?: string | string[]; cursor?: string | string[] };

export default async function IssuesPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  await connection();
  const { id } = await params;
  const query = await searchParams;
  const project = collaborationProject(id);
  if (!project) return <main className="p-4"><p>Project not found.</p></main>;
  const status = query.status === "closed" || query.status === "all" ? query.status : "open";
  const q = typeof query.q === "string" ? query.q : "";
  const label = typeof query.label === "string" ? query.label : "";
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const result = await readIssueList(project, { action: "list", q, label, status, cursor, limit: workboxPageSize() });
  const base = `/p/${encodeURIComponent(id)}/issues`;
  function href(value?: string, selectedLabel = label) {
    const query = new URLSearchParams({ q, label: selectedLabel, status });
    if (value) query.set("cursor", value);
    return `${base}?${query}`;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      {result.ok && <NewIssueForm project={id} signer={result.data.signer} />}
      <form aria-label="Issue filters" action={base} className="wb-panel mb-4 flex flex-wrap items-end gap-3 p-4 text-sm">
        <label className="grid gap-1">Search by title or issue number
          <input className="wb-btn" name="q" defaultValue={q} maxLength={1024} type="search" />
        </label>
        <label className="grid gap-1">Label
          <input className="wb-btn" name="label" defaultValue={label} maxLength={256} />
        </label>
        <label className="grid gap-1">Status
          <select className="wb-btn" name="status" defaultValue={status}>
            <option value="all">All</option><option value="open">Open</option><option value="closed">Closed</option>
          </select>
        </label>
        <button className="wb-btn" type="submit">Filter issues</button>
      </form>
      {!result.ok ? (
        <div className="wb-panel p-4">
          <p role="alert">{result.error.message}</p>
          {cursor && <Link className="wb-link text-sm" href={href()}>Start from the first page</Link>}
        </div>
      ) : (
        <>
          <ul className="wb-panel divide-y divide-[var(--wb-border)] overflow-hidden" aria-label="Issues">
            {result.data.items.length === 0 && <li className="p-4 wb-muted text-sm">
              {result.data.nextCursor ? "No matching issues on this page." : "No issues match these filters."}
            </li>}
            {result.data.items.map(issue => (
              <li key={issue.issueId} className="px-4 py-3">
                <Link className="text-sm font-semibold break-words hover:text-[var(--wb-link)] hover:underline" href={issue.href}>{issue.title}</Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs wb-muted">
                  {issue.number !== null && <span>#{issue.number}</span>}
                  <StatusTag status={issue.conflict ? "conflict" : issue.status === "closed" ? "closed" : "open"} />
                  <span>{issue.author}</span>
                  {issue.createdAt && <time dateTime={issue.createdAt}>{issue.createdAt.slice(0, 10)}</time>}
                  {[...new Set(issue.labels)].map(value => {
                    const selected = value.toLowerCase() === label.toLowerCase();
                    return <FilterTag key={value} field="label" value={value} selected={selected}
                      href={href(undefined, selected ? "" : value)} />;
                  })}
                </div>
              </li>
            ))}
          </ul>
          <CursorPagination label="Issue pages" firstHref={cursor ? href() : undefined}
            nextHref={result.data.nextCursor ? href(result.data.nextCursor) : undefined} />
        </>
      )}
    </main>
  );
}
