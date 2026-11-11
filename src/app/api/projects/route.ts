import { NextResponse, connection } from "next/server";
import { createProject } from "@/lib/workbox/create";
import { openDb } from "@/lib/workbox/db";
import { fullIndex } from "@/lib/workbox/index";

export const instant = false;

export async function POST(request: Request) {
  await connection();
  let body: { id?: string; name?: string; description?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_input", message: "body must be JSON" } }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  const name = (body.name ?? "").trim() || id;
  const description = (body.description ?? "").trim();

  if (!id) {
    return NextResponse.json({ ok: false, error: { code: "invalid_input", message: "id is required" } }, { status: 400 });
  }

  const result = await createProject({ id, name, description });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: { code: "create_failed", step: "createProject:" + result.step, message: result.error } }, { status: 400 });
  }

  // Index immediately so the new project appears in the feed and tabs.
  const db = openDb();
  fullIndex(db, [{ id: result.id, name, description, repoPath: result.repoPath }]);

  return NextResponse.json({
    ok: true,
    data: { id: result.id, repoPath: result.repoPath, actor: result.actor, issueId: result.issueId, url: `/p/${result.id}` },
  });
}
