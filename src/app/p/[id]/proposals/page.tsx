import { connection } from "next/server";
import IssueListHeader from "@/components/issue-list-header";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { readPolicy } from "@/lib/workbox/ci";
import { CreateForm } from "@/components/create-form";
import ReviewButtons from "@/components/review-buttons";

export const instant = false;

interface EvaluationView {
  eventId: string;
  title: string;
  body: string | null;
  base: string | null;
  head: string | null;
  shortId: string;
  state: string;
  reviews: Array<{ actorName: string; verdict: string; timestamp: string | null }>;
  pipelines: Array<{ kind: string; name: string; summary: string; verified: number }>;
  status: "candidate" | "accepted" | "superseded" | "other";
  lineage: { predecessor: string | null; successors: number };
}

/**
 * Proposal readout: an honest projection of the signed evaluation. For each
 * proposal family member we render what the events say — reviews, pipeline
 * results, decisions — plus the policy thresholds that bind them. This page
 * does not re-implement hubnot's acceptance engine; it renders the chain
 * and names the thresholds, so disagreement between page and engine is
 * always visible instead of hidden.
 */
export default async function ProposalsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = openDb();
  const p = getProject(db, id);
  if (!p) return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;

  const policy = readPolicy(p.repoPath);
  const req = (policy && policy.proposals && typeof policy.proposals === "object" ? policy.proposals : {}) as {
    requiredApprovals?: number; requiredAccepts?: number; allowAuthorApproval?: boolean;
  };

  const rows = db.prepare(`
    SELECT e.event_id, e.kind, e.timestamp, e.actor, e.payload_json, e.verified,
           COALESCE(a.display_name, substr(e.actor, 1, 12)) AS actorName
    FROM events e LEFT JOIN actors a ON a.project_id = e.project_id AND a.fingerprint = e.actor
    WHERE e.project_id = ? AND (e.kind LIKE 'proposal.%' OR e.kind = 'review.submit' OR e.kind LIKE 'run.%')
    ORDER BY e.timestamp ASC`).all(id) as unknown as Array<{
    event_id: string; kind: string; timestamp: string; actor: string; actorName: string; payload_json: string; verified: number;
  }>;

  // Group events into proposal lineages by subject (payload.proposal for
  // evidence events, event_id for proposal.open/revise).
  interface Lineage {
    root: string; title: string; body: string;
    base: string | null; head: string | null;
    state: string;
    items: Array<{ event_id: string; kind: string; label: string; timestamp: string; verified: number; actorName: string }>;
  }
  const byProposal = new Map<string, Lineage>();
  // run.request events: subject = proposal id, payload.subject = run id.
  // run.result payload.subject = run id — join them to attach evidence.
  const runRequestByRun = new Map<string, string>(); // run id -> proposal id
  const runRequestByRequest = new Map<string, Lineage>(); // proposal id -> lineage
  const pidOf = (kind: string, payload: Record<string, unknown>, eventId: string): string => {
    for (const key of ["proposal", "subject"]) {
      const v = payload[key];
      if (typeof v === "string" && (kind === "review.submit" || kind === "run.request" || kind.startsWith("proposal."))) {
        if (kind === "review.submit" || kind.startsWith("run.")) return v;
      }
    }
    return eventId;
  };

  for (const r of rows) {
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(r.payload_json) as Record<string, unknown>; } catch { /* render-safe */ }
    const pid = pidOf(r.kind, payload, r.event_id);
    if (r.kind === "run.result") {
      // run.result carries no proposal link; bind it to the lineage whose
      // recorded run.request named this run (payload.subject = run request id).
      const runReq = runRequestByRun.get(String(payload.subject ?? ""));
      if (runReq) {
        const parent = runRequestByRequest.get(runReq);
        if (parent) {
          parent.items.push({
            event_id: r.event_id, kind: r.kind,
            label: "run " + String(payload.pipeline ?? "?") + ": " + String(payload.outcome ?? "?"),
            timestamp: r.timestamp, verified: r.verified, actorName: r.actorName,
          });
          continue;
        }
      }
      // Unlinked run result: render under a synthetic lineage so no event hides.
      let orphan = byProposal.get(r.event_id);
      if (!orphan) {
        orphan = { root: r.event_id, title: `run result (${String(payload.pipeline ?? "?")})`, body: "", base: null, head: null, state: "orphan", items: [] };
        byProposal.set(r.event_id, orphan);
      }
      continue;
    }
    if (r.kind === "proposal.open" || r.kind === "proposal.revise") {
      const existing = byProposal.get(pid);
      const item = {
        event_id: r.event_id, kind: r.kind,
        label: r.kind === "proposal.open" ? "proposal opened" : `revised (base ${String(payload.base ?? "").slice(7, 15)}… → head ${String(payload.head ?? "").slice(7, 15)}…)`,
        timestamp: r.timestamp, verified: r.verified, actorName: r.actorName,
      };
      if (existing) {
        existing.items.push(item);
        existing.head = typeof payload.head === "string" ? payload.head : existing.head;
        existing.base = typeof payload.base === "string" ? payload.base : existing.base;
        existing.body = typeof payload.body === "string" ? payload.body : existing.body;
      } else {
        byProposal.set(pid, {
          root: pid,
          title: String(payload.title ?? "untitled"),
          body: typeof payload.body === "string" ? payload.body : "",
          base: typeof payload.base === "string" ? payload.base : null,
          head: typeof payload.head === "string" ? payload.head : null,
          state: "candidate",
          items: [item],
        });
      }
      continue;
    }
    // evidence kinds
    let lineage = byProposal.get(pid);
    if (!lineage) {
      lineage = { root: pid, title: pid.slice(7, 19), body: "", base: null, head: null, state: "candidate", items: [] };
      byProposal.set(pid, lineage);
    }
    if (r.kind === "review.submit") {
      lineage.items.push({
        event_id: r.event_id, kind: r.kind,
        label: `review: ${String(payload.verdict ?? "?")} by ${r.actorName}`,
        timestamp: r.timestamp, verified: r.verified, actorName: r.actorName,
      });
    } else if (r.kind === "run.request") {
      lineage.items.push({
        event_id: r.event_id, kind: r.kind,
        label: "run requested: " + String(payload.pipeline ?? "?"),
        timestamp: r.timestamp, verified: r.verified, actorName: r.actorName,
      });
      // payload.subject = full proposal id; the run itself is identified by
      // payload.request (hubnot law: subject always names the proposal).
      const runId = r.event_id; // the request event id IS the run id (hn run list keys on it)
      if (lineage) {
        runRequestByRun.set(runId, pid);
        runRequestByRequest.set(pid, lineage);
      }
    } else if (r.kind === "run.result") {
      const runReq = runRequestByRun.get(String(payload.subject ?? ""));
      const parent = runReq ? runRequestByRequest.get(runReq) : undefined;
      const tgt = parent ?? lineage;
      if (tgt) tgt.items.push({
        event_id: r.event_id, kind: r.kind,
        label: "run " + String(payload.pipeline ?? "?") + ": " + String(payload.outcome ?? payload.status ?? "?"),
        timestamp: r.timestamp, verified: r.verified, actorName: r.actorName,
      });
    } else if (r.kind === "proposal.decision") {
      lineage.items.push({
        event_id: r.event_id, kind: r.kind,
        label: `decision: ${String(payload.decision ?? payload.verdict ?? "?")} by ${r.actorName}`,
        timestamp: r.timestamp, verified: r.verified, actorName: r.actorName,
      });
      lineage.state = String(payload.decision ?? payload.verdict ?? "decided") === "accept" ? "accepted" : lineage.state;
    } else if (r.kind === "proposal.merged") {
      lineage.items.push({ event_id: r.event_id, kind: r.kind, label: "merged", timestamp: r.timestamp, verified: r.verified, actorName: r.actorName });
      lineage.state = "merged";
    } else if (r.kind === "proposal.reject") {
      lineage.items.push({ event_id: r.event_id, kind: r.kind, label: "rejected", timestamp: r.timestamp, verified: r.verified, actorName: r.actorName });
      lineage.state = "rejected";
    }
  }

  const lineages = [...byProposal.values()]
    .filter((l) => l.items.length > 0)
    .sort((a, b) =>
      a.items[a.items.length - 1]!.timestamp.localeCompare(b.items[b.items.length - 1]!.timestamp));

  const openCount = lineages.filter((lineage) => lineage.state === "candidate").length;
  const closedCount = lineages.filter((lineage) => ["accepted", "merged", "rejected", "superseded"].includes(lineage.state)).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <CreateForm
        label="New proposal"
        endpoint={`/api/projects/${id}/proposals`}
        cta="Sign & open proposal"
        fields={[
          { key: "title", placeholder: "Proposal title", required: true },
          { key: "body", placeholder: "What does this proposal change, and why?", textarea: true },
          { key: "head", placeholder: "Head branch (descending from main)", required: true },
        ]}
      />
      {policy && (
        <div className="wb-panel p-3 mb-4 wb-mono text-xs wb-muted leading-5 break-words">
          policy {policy.version} · approvals ≥ {req.requiredApprovals ?? "?"} · accepts ≥ {req.requiredAccepts ?? "?"} ·
          author-approval {req.allowAuthorApproval ? "allowed" : "refused"}
        </div>
      )}

      <div className="wb-panel divide-y divide-[var(--wb-border)] overflow-hidden">
        <IssueListHeader open={openCount} closed={closedCount} />
        {lineages.length === 0 && <p className="p-4 wb-muted text-sm">No proposals indexed.</p>}
        {lineages.map((l) => (
          <div key={l.root} className="p-4">
            <div className="flex flex-wrap items-start gap-3 mb-3">
              <svg aria-hidden="true" className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                   style={{ color: l.state === "candidate" ? "var(--wb-open)" : "var(--wb-closed)" }}>
                <circle cx="4" cy="3" r="1.5" /><circle cx="4" cy="13" r="1.5" /><circle cx="12" cy="13" r="1.5" />
                <path d="M4 4.5v7M9 2l3 3-3 3m3-3v6.5" />
              </svg>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold break-words">{l.title}</h2>
                <div className="wb-muted text-xs mt-1 leading-5">
                  <span className="tabular-nums" title={l.root}>#{l.root.slice(7, 19)}</span>
                  {" · "}opened {l.items[0]?.timestamp.slice(0, 10)}
                  {l.state === "candidate" && <span className="wb-chip ml-2">candidate</span>}
                </div>
              </div>
              <div className="max-w-full [&>div]:ml-0 [&>div]:flex-wrap [&_input]:min-w-0 [&_input]:max-w-full">
                <ReviewButtons projectId={id} proposalId={l.root} state={l.state} />
              </div>
            </div>
            {l.body && <p className="text-sm leading-6 whitespace-pre-wrap break-words mb-3">{l.body}</p>}
            {l.base && l.head && (
              <p className="wb-mono text-xs wb-muted mb-4 break-words">
                base {l.base.slice(7, 19)} → head {l.head.slice(7, 19)}
              </p>
            )}
            <ol className="relative border-l wb-muted text-sm space-y-3 ml-2" style={{ borderColor: "var(--wb-border)", listStyle: "none" }}>
              {l.items.map((it) => (
                <li key={it.event_id} className="ml-4 leading-5 break-words" title={it.event_id}>
                  <span className="absolute -left-1 mt-1.5 h-2 w-2 rounded-full" style={{
                    background: it.verified === 1 ? "var(--wb-open)" : "var(--wb-warn)",
                  }} />
                  <span className="text-xs wb-muted tabular-nums mr-2">{it.timestamp.slice(0, 16).replace("T", " ")} </span>
                  {it.label}
                  <span className="ml-2 text-xs" style={{ color: it.verified === 1 ? "var(--wb-open)" : "var(--wb-warn)" }}>
                    {it.verified === 1 ? "✓" : "⚠"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </main>
  );
}
