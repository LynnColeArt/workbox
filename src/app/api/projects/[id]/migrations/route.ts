import { connection } from "next/server";
import { canSignCollaborationRequest } from "@/lib/workbox/collaboration";
import { runMigrationOperation } from "@/lib/workbox/migrations";

export const instant = false;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  if (!canSignCollaborationRequest(request)) return Response.json({ ok: false, error: { message: "Use the local Workbox session." } }, { status: 403 });
  const input: unknown = await request.json().catch(() => null);
  const result = await runMigrationOperation((await params).id, input);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
