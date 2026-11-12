import { connection } from "next/server";
import { canSignCollaborationRequest, collaborationResponse } from "@/lib/workbox/collaboration";
import { runDiscussionOperation } from "@/lib/workbox/discussions";

export const instant = false;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const input: unknown = await request.json().catch(() => null);
  return collaborationResponse<unknown>(await runDiscussionOperation(id, input, canSignCollaborationRequest(request)));
}
