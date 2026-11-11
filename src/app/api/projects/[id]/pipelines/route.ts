import { NextResponse, connection } from "next/server";
import { getProject } from "@/lib/workbox/queries";
import { openDb } from "@/lib/workbox/db";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { listPipelines } from "@/lib/workbox/ci";
import { git } from "@/lib/hn/gitread";
import { runHn } from "@/lib/hn/runner";

export const instant = false;

const GIT_AUTHOR = ["-c", "user.name=Workbox", "-c", "user.email=workbox@localhost"];

interface PipelineInput {
  name?: string;
  version?: string;
  steps?: Array<{ name?: string; command?: string; args?: string[] }>;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  let body: PipelineInput;
  try {
    body = (await request.json()) as PipelineInput;
  } catch {
    return NextResponse.json({ ok: false, error: { message: "body must be JSON" } }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(name)) {
    return NextResponse.json({ ok: false, error: { message: "pipeline name must match [a-z][a-z0-9-]{0,39}" } }, { status: 400 });
  }
  const version = String(body.version ?? "hn.pipeline/0");
  let steps = Array.isArray(body.steps)
    ? body.steps.map((s) => ({
        name: String(s.name ?? "").trim() || "step",
        command: String(s.command ?? "").trim(),
        args: Array.isArray(s.args) ? s.args.map(String) : [],
      }))
    : [];
  if (steps.length === 0) {
    // form shape: single first step
    const command = typeof (body as Record<string, unknown>).command === "string" ? String((body as Record<string, unknown>).command ?? "").trim() : "";
    const stepName = String((body as Record<string, unknown>).stepName ?? "").trim() || "step";
    const argString = String((body as Record<string, unknown>).args ?? "").trim();
    if (command) {
      steps = [{ name: stepName, command, args: argString ? argString.split(/\s+/) : [] }];
    }
  }
  if (steps.length === 0 || steps.some((s) => !s.command)) {
    return NextResponse.json({ ok: false, error: { message: "at least one step with a command is required" } }, { status: 400 });
  }
  if (steps.length > 64) {
    return NextResponse.json({ ok: false, error: { message: "at most 64 steps" } }, { status: 400 });
  }

  const db = openDb();
  const p = getProject(db, id);
  if (!p) return NextResponse.json({ ok: false, error: { message: `unknown project '${id}'` } }, { status: 404 });

  const pipeline = { version, steps };
  const rel = join(".hn", "pipelines", `${name}.json`);
  const abs = join(p.repoPath, rel);

  // worktree-only write first; validation is the gate to committing
  mkdirSync(dirname(abs), { recursive: true });
  const before = listPipelines(p.repoPath).find((pl) => pl.name === name);
  const beforeRaw = before?.raw ?? null;
  try {
    writeFileSync(abs, JSON.stringify(pipeline, null, 2) + "\n");
  } catch (e) {
    return NextResponse.json({ ok: false, error: { message: (e as Error).message } }, { status: 400 });
  }

  // Validate through hubnot itself: a run request against HEAD-less worktree
  // is not possible, so instead we ask git to only commit if hn accepts the
  // definition format. Round-trip via hn: `hn run list` won't validate files;
  // the authoritative validator lives in proposal evaluation, so our gate is
  // structural: re-parse with the exact schema shape hubnot accepts.
  const canonical = listPipelines(p.repoPath).find((pl) => pl.name === name);
  if (!canonical || canonical.error || canonical.steps.length === 0) {
    if (beforeRaw !== null) writeFileSync(abs, beforeRaw); else {
      git(p.repoPath, ["rm", "--cached", rel]);
      // leave file removal for cleanup below
    }
    return NextResponse.json({ ok: false, error: { message: "pipeline failed structural validation" } }, { status: 400 });
  }

  const add = git(p.repoPath, ["add", rel]);
  if (!add.ok) {
    return NextResponse.json({ ok: false, error: { message: add.err } }, { status: 400 });
  }
  const status = git(p.repoPath, ["status", "--porcelain", rel]);
  const changed = status.out.trim() !== "" && (beforeRaw === null || beforeRaw !== canonical.raw);
  if (!changed) {
    return NextResponse.json({ ok: false, error: { message: "pipeline unchanged" } }, { status: 400 });
  }
  const commit = git(p.repoPath, [...GIT_AUTHOR, "commit", "-m", `ci: add ${name} pipeline (via Workbox)`]);
  if (!commit.ok) {
    return NextResponse.json({ ok: false, error: { message: commit.err } }, { status: 400 });
  }
  return NextResponse.json({ ok: true, data: { id, name, steps: steps.length, url: `/p/${id}/ci` } });
}
