import { canSignCollaborationRequest } from "@/lib/workbox/collaboration";
import { applyProposalMaintenance } from "@/lib/workbox/proposal-maintenance";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; candidateId: string }> }) {
  if (!canSignCollaborationRequest(request)) {
    return Response.json({ ok: false, error: { code: "permission_denied", message: "Use the local Workbox session." } }, { status: 403 });
  }
  const { id, candidateId } = await params;
  const result = await applyProposalMaintenance(id, candidateId, await request.json().catch(() => null));
  const status = result.ok ? 200 : ({
    invalid_input: 400, not_found: 404, permission_denied: 403, actor_mismatch: 403,
    stale_revision: 409, concurrent_update: 409, unsupported: 501,
  } as Record<string, number>)[result.error.code] ?? 503;
  return Response.json(result, { status });
}
