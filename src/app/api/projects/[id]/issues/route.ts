import { NextResponse, connection } from "next/server";
import { runHn, envelopeData } from "@/lib/hn/runner";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { indexProject, nextIssueNumber } from "@/lib/workbox/index";

export const instant = false;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  let body: { title?: string; body?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: { message: "body must be JSON" } }, { status: 400 });
  }
  const title = String(body.title ?? "").trim();
  const issueBody = String(body.body ?? "").trim();
  if (!title) {
    return NextResponse.json({ ok: false, error: { message: "title is required" } }, { status: 400 });
  }

  const db = openDb();
  const p = getProject(db, id);
  if (!p) return NextResponse.json({ ok: false, error: { message: `unknown project '${id}'` } }, { status: 404 });

  // hn law: flags precede free text. The project's own identity signs it.
  const res = await runHn(p.repoPath, ["issue", "open", "--json", "--body", issueBody, title]);
  if (res.exitCode !== 0 || !res.envelope.ok) {
    return NextResponse.json({ ok: false, error: { message: res.stderr.trim() || JSON.stringify(res.envelope.error ?? {}) } }, { status: 400 });
  }
  const data = envelopeData<{ issue_id?: string; event_id?: string }>(res.envelope);
  const issueId = data?.issue_id ?? data?.event_id ?? "";

  indexProject(db, p);
  const number = nextIssueNumber(db, id) - 1; // just assigned
  void number;
  const created = db.prepare("SELECT number FROM issues WHERE project_id = ? AND issue_id = ?").get(id, issueId) as { number: number | null } | undefined;

  return NextResponse.json({ ok: true, data: { id, issueId, number: created?.number ?? null, url: `/p/${id}/issue/${issueId}` } });
}
