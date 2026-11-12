import { connection } from "next/server";
import { canSignCollaborationRequest, collaborationError, collaborationResponse } from "@/lib/workbox/collaboration";
import { legacyCreateIssue, runIssueOperation } from "@/lib/workbox/issues";

export const instant = false;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return collaborationResponse(collaborationError("invalid_input", "Provide a JSON issue operation."));
  }
  if ("action" in input && (input.action === "list" || input.action === "detail")) {
    return collaborationResponse(await runIssueOperation(id, input));
  }
  if (!canSignCollaborationRequest(request)) {
    return Response.json(collaborationError("permission_denied", "Issue changes require a local Workbox request."), { status: 403 });
  }
  if ("action" in input) return collaborationResponse(await runIssueOperation(id, input));

  const created = await legacyCreateIssue(id, input);
  if (!created.ok) return collaborationResponse(created);
  const { issueId, number } = created.data;
  return Response.json({ ok: true, data: { id, issueId, number, url: `/p/${id}/issue/${issueId}` } });
}
