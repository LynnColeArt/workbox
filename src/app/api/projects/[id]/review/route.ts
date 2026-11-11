import { NextResponse, connection } from "next/server";
import { runHn } from "@/lib/hn/runner";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { indexProject } from "@/lib/workbox/index";

export const instant = false;

/**
 * Review a proposal. The proposal id must be the FULL lineage id (hubnot
 * rejects shorts; the UI passes the canonical id from the projections).
 * hn review is an envelope-era command; exit code + {ok} both checked.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id: projectId } = await params;
  let body: { proposalId?: string; verdict?: string; comment?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: { message: "body must be JSON" } }, { status: 400 });
  }
  const proposalId = String(body.proposalId ?? "").trim();
  const verdict = String(body.verdict ?? "").trim(); // approve | request-changes
  const comment = String(body.comment ?? "").trim();
  if (!/^sha256:[0-9a-f]{64}$/.test(proposalId)) {
    return NextResponse.json({ ok: false, error: { message: "proposalId must be a full sha256 id" } }, { status: 400 });
  }
  if (verdict !== "approve" && verdict !== "request-changes") {
    return NextResponse.json({ ok: false, error: { message: "verdict must be approve or request-changes" } }, { status: 400 });
  }

  const db = openDb();
  const p = getProject(db, projectId);
  if (!p) return NextResponse.json({ ok: false, error: { message: `unknown project '${projectId}'` } }, { status: 404 });

  const flag = verdict === "approve" ? "--approve" : "--request-changes";
  const args = ["review", proposalId, flag];
  if (comment) args.push("--body", comment);

  const res = await runHn(p.repoPath, args);
  if (res.exitCode !== 0 || !res.envelope.ok) {
    // hn refuses for real reasons (author-approval off, already reviewed, …).
    return NextResponse.json({ ok: false, error: { message: res.stderr.trim() || JSON.stringify(res.envelope.error ?? {}) } }, { status: 400 });
  }

  indexProject(db, p);
  return NextResponse.json({ ok: true, data: { projectId, proposalId, verdict, prose: res.envelope.data } });
}
