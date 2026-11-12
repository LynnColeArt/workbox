import { NextResponse, connection } from "next/server";
import { openDb } from "@/lib/workbox/db";
import { updateRepoDetails } from "@/lib/workbox/settings-read";

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
  const description = String(body?.description ?? "").slice(0, 1024);
  using db = openDb();
  const result = updateRepoDetails(db, id, { description });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: { message: `unknown project '${id}'` } }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data: { id, description: result.data.description } });
}
