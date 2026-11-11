import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ProposalChecks, ProposalStageSummary } from "@/components/proposal-checks";
import { ProposalConversation } from "@/components/proposal-conversation";
import { ProposalDetailHeader } from "@/components/proposal-detail-header";
import { ProposalFilesChanged } from "@/components/proposal-files-changed";
import { ProposalNextActions } from "@/components/proposal-next-actions";
import { createProposalReader, isFullProposalId } from "@/lib/hn/proposal-read";
import { openDb } from "@/lib/workbox/db";
import { getProposalChecks } from "@/lib/workbox/proposal-checks";
import { readProposalComparison } from "@/lib/workbox/proposal-comparison";
import { readProposalConversation } from "@/lib/workbox/proposal-conversation";
import { proposalDetailHref, resolveProposalDetail } from "@/lib/workbox/proposal-detail";
import { getProject } from "@/lib/workbox/queries";

export const instant = false;

function candidateIdFromSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

function ProposalUnavailable({ listHref }: { listHref: string }) {
  return (
    <main className="mx-auto max-w-6xl space-y-3 px-4 py-6">
      <h1 className="text-2xl font-semibold">Proposal unavailable</h1>
      <Link className="wb-link text-sm" href={listHref}>Back to proposals</Link>
    </main>
  );
}

export default async function ProposalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; candidateId: string }>;
  searchParams: Promise<{ mode?: string | string[]; view?: string | string[]; file?: string | string[] }>;
}) {
  await connection();
  const { id: projectId, candidateId: segment } = await params;
  const query = await searchParams;
  const view = query.view === "checks" || query.view === "files" ? query.view : "conversation";
  const mode = query.mode === "lineage" ? "lineage" : "exact";
  const candidateId = candidateIdFromSegment(segment);
  const listHref = `/p/${encodeURIComponent(projectId)}/proposals`;
  if (!isFullProposalId(candidateId)) return <ProposalUnavailable listHref={listHref} />;

  using db = openDb();
  const project = getProject(db, projectId);
  if (!project) return <ProposalUnavailable listHref={listHref} />;

  const reader = createProposalReader(project.repoPath);
  const detail = await resolveProposalDetail(db, project, candidateId, mode, reader);
  if (detail.kind === "unavailable") return <ProposalUnavailable listHref={listHref} />;
  if (detail.kind === "choose") {
    return (
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <Link className="wb-link text-sm" href={listHref}>Back to proposals</Link>
        <h1 className="text-2xl font-semibold">Choose a revision</h1>
        <p className="wb-muted text-sm">
          {detail.incomplete ? "Revision history is incomplete." : "This proposal has multiple live revisions."}
        </p>
        <ul className="wb-panel divide-y divide-[var(--wb-border)]" aria-label="Available revisions">
          {detail.candidates.map((revision) => (
            <li key={revision.id} className="space-y-1 p-3 wrap-anywhere">
              <Link
                className="wb-link block font-medium"
                href={proposalDetailHref(projectId, revision.id, { view })}
                prefetch={false}
              >
                {revision.title} <code className="wb-mono text-xs">{revision.id}</code>
              </Link>
              <p className="wb-muted text-xs">Head <code className="wb-mono">{revision.head}</code></p>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const { candidate, related, incomplete } = detail;
  if (mode === "lineage") redirect(proposalDetailHref(projectId, candidate.id, { view }));

  const checks = getProposalChecks(candidate.status);
  const [identity, conversation] = await Promise.all([
    candidate.status ? reader.identity() : null,
    view === "conversation" ? readProposalConversation(db, project, candidate, related, reader) : null,
  ]);
  const comparison = view === "files"
    ? readProposalComparison(project.repoPath, candidate, typeof query.file === "string" ? query.file : undefined)
    : null;

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <Link className="wb-link text-sm" href={listHref}>Back to proposals</Link>
      <ProposalDetailHeader projectId={projectId} candidate={candidate} related={related} view={view} incomplete={incomplete} />
      <ProposalStageSummary checks={checks} />
      <ProposalNextActions projectId={projectId} checks={checks} identity={identity?.ok ? identity.value : null} />
      {conversation && <ProposalConversation projectId={projectId} candidate={candidate} conversation={conversation} />}
      {view === "checks" && <ProposalChecks checks={checks} />}
      {comparison && (
        <section className="space-y-2" aria-labelledby="proposal-files-heading">
          <h2 id="proposal-files-heading" className="text-lg font-semibold">Files changed</h2>
          <ProposalFilesChanged
            comparison={comparison}
            detailHref={proposalDetailHref(projectId, candidate.id, { view })}
          />
        </section>
      )}
    </main>
  );
}
