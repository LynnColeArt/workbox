import { connection } from "next/server";
import { openDb } from "@/lib/workbox/db";
import { getIssue, issueChain, issueComments } from "@/lib/workbox/queries";

export const instant = false;

// Next hands route params undecoded when segments contain a colon, and
// hubnot ids are "sha256:<64hex>". Accept encoded, decoded, or bare hex.
function normalizeIssueId(raw: string): string {
  const decoded = decodeURIComponent(raw);
  const bare = decoded.replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(bare)) return decoded;
  return `sha256:${bare}`;
}

export default async function IssuePage({ params }: { params: Promise<{ id: string; issueId: string }> }) {
  await connection();
  const { id, issueId: rawIssueId } = await params;
  const issueId = normalizeIssueId(rawIssueId);
  const db = openDb();
  const issue = getIssue(db, id, issueId);
  if (!issue) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p className="wb-muted">Issue not found in the local projection.</p>
      </main>
    );
  }
  const comments = issueComments(db, id, issueId);
  const chain = issueChain(db, id, issueId);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-1 wb-muted text-sm">
        <a href={`/p/${id}`} className="wb-link">{id}</a> / issue
      </div>
      <h1 className="text-2xl sm:text-3xl font-normal mb-3 break-words">
        {issue.title}{" "}
        <span className="wb-muted font-light">#{issue.number ?? issue.issueId.slice(7, 19)}</span>
        {issue.conflict === 1 && (
          <span className="wb-chip ml-2" style={{ color: "var(--wb-warn)", borderColor: "var(--wb-warn)" }}>conflict</span>
        )}
      </h1>
      <div className="wb-muted text-sm mb-6 border-b border-[var(--wb-border)] pb-5 leading-6">
        <span style={{ color: issue.status === "open" ? "var(--wb-open)" : "var(--wb-closed)" }}>
          {issue.status === "open" ? "● Open" : "✔ Closed"}
        </span>
        {" · "}opened {issue.createdAt?.slice(0, 10)} by <span className="wb-mono">{issue.creator.slice(7, 19)}</span>
      </div>

      <article className="wb-panel p-5 mb-4 text-sm leading-7 whitespace-pre-wrap break-words">{issue.body}</article>

      {issue.labels.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {issue.labels.map((l) => <span key={l} className="wb-chip">{l}</span>)}
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">{comments.length} comments</h2>
        <div className="space-y-3">
          {comments.map((c) => (
            <article key={c.eventId} className="flex items-start gap-2 sm:gap-3">
              <div aria-hidden="true" className="wb-panel grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold sm:size-10">
                {Array.from(c.actorName.trim())[0]?.toUpperCase() || "?"}
              </div>
              <div className="wb-panel min-w-0 flex-1 overflow-hidden">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--wb-border)] bg-[var(--wb-panel-2)] px-4 py-2 text-sm">
                  <div className="wb-muted min-w-0 wrap-anywhere">
                    <span className="font-semibold text-[var(--wb-text)]">{c.actorName}</span>
                    {c.timestamp ? (
                      <> commented on <time dateTime={c.timestamp}>{c.timestamp.slice(0, 16).replace("T", " ")}</time></>
                    ) : " commented"}
                  </div>
                  {c.verified === 1 && (
                    <span className="wb-chip ml-auto shrink-0" style={{ color: "var(--wb-open)" }}>✓ signed</span>
                  )}
                </header>
                <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">{c.body}</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold wb-muted mb-2 uppercase tracking-wide">Signed event chain</h2>
        <p className="wb-muted text-xs mb-2">Every state change on this issue is an individual signed fact. Hover a row for its full event id.</p>
        <div className="wb-panel divide-y divide-[var(--wb-border)] wb-mono text-xs" style={{ borderColor: "var(--wb-border)" }}>
          {chain.map((e) => (
            <div key={e.eventId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" title={e.eventId}>
              <span className="wb-chip">{e.kind}</span>
              {e.intent && e.intent !== e.kind.split(".")[1] && <span className="wb-muted">{e.intent}</span>}
              <span className="min-w-0 break-all">{e.actorName}</span>
              <span className="wb-muted whitespace-nowrap">seq {e.sequence}</span>
              <span className="ml-auto whitespace-nowrap" style={{ color: e.verified === 1 ? "var(--wb-open)" : "var(--wb-warn)" }}>
                {e.verified === 1 ? "✓ verified" : "⚠ unverified"}
              </span>
              <span className="wb-muted whitespace-nowrap tabular-nums">{e.timestamp?.slice(0, 16).replace("T", " ")}</span>
            </div>
          ))}
          {chain.length === 0 && <p className="p-4 wb-muted">No events reference this issue in the projection.</p>}
        </div>
      </section>
    </main>
  );
}
