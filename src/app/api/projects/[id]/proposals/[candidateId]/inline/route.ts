import { canSignCollaborationRequest } from "@/lib/workbox/collaboration";
import { nativeInline } from "@/lib/workbox/native-inline";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; candidateId: string }> }) {
  if (!canSignCollaborationRequest(request)) return Response.json({ ok: false, error: { message: "Use the local Workbox session." } }, { status: 403 });
  const { id, candidateId } = await params;
  const result = await nativeInline(id, candidateId, await request.json().catch(() => null));
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
