import { connection } from "next/server";
import Link from "next/link";
import { openDb } from "@/lib/workbox/db";
import { listIssues } from "@/lib/workbox/queries";
import { CreateForm } from "@/components/create-form";

export const instant = false;

export default async function IssuesPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const issues = listIssues(db, id);

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
      <div className="wb-panel divide-y" style={{ borderColor: "var(--wb-border)" }}>
        {issues.length === 0 && <p className="p-4 wb-muted text-sm">No issues yet — open the first one above.</p>}
        {issues.map((i) => (
          <div key={i.issueId} className="flex items-start gap-3 px-4 py-2.5">
            <span className="mt-1" title={i.status} style={{ color: i.status === "open" ? "var(--wb-open)" : "var(--wb-closed)" }}>
              {i.status === "open" ? "●" : "✔"}
            </span>
            <div className="min-w-0">
              <a className="wb-link text-sm" href={`/p/${id}/issue/${i.issueId}`}>{i.title}</a>
              {i.conflict === 1 && (
                <span className="wb-chip ml-2" style={{ color: "var(--wb-warn)", borderColor: "var(--wb-warn)" }}>conflict</span>
              )}
              <div className="wb-muted text-xs">
                {i.number !== null ? `#${i.number}` : `#${i.issueId.slice(7, 19)}`} · opened {i.createdAt?.slice(0, 10)} · {i.comments} comment{i.comments === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
