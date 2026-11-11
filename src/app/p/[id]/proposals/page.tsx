import Link from "next/link";
import { connection } from "next/server";
import { CreateForm } from "@/components/create-form";
import { openDb } from "@/lib/workbox/db";
import { getProject } from "@/lib/workbox/queries";
import { listProposalLineages, proposalDetailHref } from "@/lib/workbox/proposal-detail";

export const instant = false;

function parseOffset(value: string | string[] | undefined): number {
  const offset = typeof value === "string" ? Number(value) : 0;
  return Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
}

export default async function ProposalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offset?: string | string[]; hintOffset?: string | string[] }>;
}) {
  await connection();
  const { id } = await params;
  const query = await searchParams;
  const offset = parseOffset(query.offset);
  const hintOffset = parseOffset(query.hintOffset);
  using db = openDb();
  const project = getProject(db, id);
  if (!project) return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;

  const { candidates, incomplete, nextOffset, nextHintOffset } =
    await listProposalLineages(db, project, offset, undefined, hintOffset);
  const nextQuery = new URLSearchParams({ offset: String(nextOffset) });
  if (nextHintOffset !== undefined) nextQuery.set("hintOffset", String(nextHintOffset));

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <CreateForm
        label="New proposal"
        endpoint={`/api/projects/${encodeURIComponent(id)}/proposals`}
        cta="Sign & open proposal"
        fields={[
          { key: "title", placeholder: "Proposal title", required: true },
          { key: "body", placeholder: "What does this proposal change, and why?", textarea: true },
          { key: "head", placeholder: "Head branch (descending from main)", required: true },
        ]}
      />
      <section className="wb-panel overflow-hidden" aria-label="Proposal lineages">
        {incomplete && <p className="wb-muted p-4 text-sm">Some proposal details could not be verified. Results may be incomplete.</p>}
        {candidates.length === 0 && !incomplete && (
          <p className="wb-muted p-4 text-sm">No visible proposals on this page.</p>
        )}
        {candidates.length > 0 && (
          <ul className="divide-y divide-[var(--wb-border)]">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="space-y-1 p-4">
                <Link href={proposalDetailHref(id, candidate.id, { mode: "lineage" })} className="font-medium hover:underline">
                  {candidate.title}
                </Link>
                <p className="wb-muted text-sm">{candidate.actorName}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {nextOffset !== null && (
        <Link href={`/p/${encodeURIComponent(id)}/proposals?${nextQuery}`} className="mt-4 inline-block text-sm hover:underline">
          More proposals
        </Link>
      )}
    </main>
  );
}
