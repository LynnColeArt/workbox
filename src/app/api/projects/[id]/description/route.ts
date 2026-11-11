import { NextResponse, connection } from "next/server";
import { openDb } from "@/lib/workbox/db";

export const instant = false;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  let body: { description?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: { message: "body must be JSON" } }, { status: 400 });
  }
  const description = String(body.description ?? "").slice(0, 1024);
  const db = openDb();
  const exists = db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
  if (!exists) {
    return NextResponse.json({ ok: false, error: { message: `unknown project '${id}'` } }, { status: 404 });
  }
  db.prepare(`INSERT INTO project_meta (id, description) VALUES (?, ?)
              ON CONFLICT(id) DO UPDATE SET description = excluded.description`).run(id, description);
  return NextResponse.json({ ok: true, data: { id, description } });
}
