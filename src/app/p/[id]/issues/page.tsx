import { connection } from "next/server";
import Link from "next/link";
import IssueListHeader from "@/components/issue-list-header";
import { openDb } from "@/lib/workbox/db";
import { listIssues } from "@/lib/workbox/queries";
import { CreateForm } from "@/components/create-form";

export const instant = false;

export default async function IssuesPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const issues = listIssues(db, id);
  const openCount = issues.filter((issue) => issue.status === "open").length;
  const closedCount = issues.filter((issue) => issue.status === "closed").length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <CreateForm
        label="New issue"
        endpoint={`/api/projects/${id}/issues`}
        cta="Sign & open issue"
        fields={[
          { key: "title", placeholder: "Title", required: true },
          { key: "body", placeholder: "Describe the task or problem…", textarea: true },
        ]}
      />
      <div className="wb-panel divide-y divide-[var(--wb-border)] overflow-hidden" style={{ borderColor: "var(--wb-border)" }}>
        <IssueListHeader open={openCount} closed={closedCount} />
        {issues.length === 0 && <p className="p-4 wb-muted text-sm">No issues yet — open the first one above.</p>}
        {issues.map((i) => (
          <div key={i.issueId} className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--wb-panel-2)]">
            <span className="mt-0.5 shrink-0" title={i.status} style={{ color: i.status === "open" ? "var(--wb-open)" : "var(--wb-closed)" }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="6" />
                {i.status === "open" ? <circle cx="8" cy="8" r=".75" fill="currentColor" stroke="none" /> : <path d="m5 8 2 2 4-4" />}
              </svg>
            </span>
            <div className="min-w-0">
              <Link className="text-sm font-semibold break-words hover:text-[var(--wb-link)] hover:underline" href={`/p/${id}/issue/${i.issueId}`}>{i.title}</Link>
              {i.conflict === 1 && (
                <span className="wb-chip ml-2" style={{ color: "var(--wb-warn)", borderColor: "var(--wb-warn)" }}>conflict</span>
              )}
              <div className="wb-muted text-xs mt-1 leading-5">
                <span className="wb-muted tabular-nums">{i.number !== null ? `#${i.number}` : `#${i.issueId.slice(7, 19)}`}</span> opened {i.createdAt?.slice(0, 10)} · {i.comments.toLocaleString("en-US")} comment{i.comments === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
