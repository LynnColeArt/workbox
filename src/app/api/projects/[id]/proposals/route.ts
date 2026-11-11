import { NextResponse, connection } from "next/server";
import { runHn } from "@/lib/hn/runner";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { git } from "@/lib/hn/gitread";
import { indexProject } from "@/lib/workbox/index";

export const instant = false;

const GIT_AUTHOR = ["-c", "user.name=Workbox", "-c", "user.email=workbox@localhost"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  let body: { title?: string; body?: string; head?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: { message: "body must be JSON" } }, { status: 400 });
  }
  const title = String(body.title ?? "").trim();
  const description = String(body.body ?? "").trim();
  const headBranch = String(body.head ?? "").trim();
  if (!title || !headBranch) {
    return NextResponse.json({ ok: false, error: { message: "title and head branch are required" } }, { status: 400 });
  }

  const db = openDb();
  const p = getProject(db, id);
  if (!p) return NextResponse.json({ ok: false, error: { message: `unknown project '${id}'` } }, { status: 404 });

  // head must exist as a local branch descending from main
  const check = git(p.repoPath, ["rev-parse", "--verify", `refs/heads/${headBranch}`]);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: { message: `branch '${headBranch}' does not exist locally` } }, { status: 400 });
  }

  // hn law: flags precede free text. Prose-era command (no --json): exit code is the contract.
  const res = await runHn(p.repoPath, ["proposal", "open", "--base", "main", "--head", headBranch, "--body", description, title]);
  if (res.exitCode !== 0 || !res.envelope.ok) {
    return NextResponse.json({ ok: false, error: { message: res.stderr.trim() || res.envelope.error?.message || "proposal open failed" } }, { status: 400 });
  }

  indexProject(db, p);
  // pull the new proposal id from the actor chain tip
  const actorRef = git(p.repoPath, ["for-each-ref", "refs/hn/actors/", "--format=%(refname)"]);
  const tip = actorRef.out.trim().split("\n")[0];
  let proposalId = "";
  if (tip) {
    const payload = git(p.repoPath, ["show", `${tip}:event.json`]);
    try {
      const parsed = JSON.parse(payload.out) as { kind?: string };
      if (parsed.kind === "proposal.open") {
        proposalId = digest(payload.out);
      }
    } catch { /* render-safe */ }
  }
  return NextResponse.json({ ok: true, data: { id, proposalId, url: `/p/${id}/proposals` } });
}

function digest(text: string): string {
  // proposal id = sha256 of the payload bytes (hubnot digest law)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return `sha256:${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`;
}
