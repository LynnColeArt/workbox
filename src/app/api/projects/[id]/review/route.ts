import { NextResponse, connection } from "next/server";
import { runHn } from "@/lib/hn/runner";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { indexProject } from "@/lib/workbox/index";
import { parseReviewInput, writeProposalReview } from "@/lib/workbox/proposal-actions";

export const instant = false;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id: projectId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { message: "The request body must be JSON." } }, { status: 400 });
  }
  const input = parseReviewInput(body);
  if (!input) {
    return NextResponse.json({
      ok: false,
      error: { message: "A review requires a full proposal ID, an approve or request-changes verdict, and an optional text note." },
    }, { status: 400 });
  }

  const db = openDb();
  const project = getProject(db, projectId);
  if (!project) return NextResponse.json({ ok: false, error: { message: "Project unavailable." } }, { status: 404 });

  const result = await writeProposalReview(project.repoPath, input, runHn);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: { message: result.message, uncertain: result.uncertain } },
      { status: result.uncertain ? 503 : 400 },
    );
  }

  try {
    indexProject(db, project);
  } catch {
    // Hubnot already recorded the review. Exact proposal detail reads native history.
    console.error("Could not refresh the Workbox index after recording a review.");
  }
  return NextResponse.json({
    ok: true,
    data: { projectId, proposalId: input.proposalId, verdict: input.verdict, prose: result.data },
  });
}
