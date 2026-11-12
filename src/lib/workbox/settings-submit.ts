import type { DatabaseSync } from "node:sqlite";
import { previewPipeline } from "./settings-preview";

export const settingsProposalAvailability = {
  available: false,
  reason: "This Hubnot version cannot safely pin the signer and recover an interrupted proposal submission.",
} as const;

export function submitSettingsProposal(db: DatabaseSync, projectId: string, input: Record<string, unknown>) {
  if (input.confirmed !== true || typeof input.operationId !== "string" ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(input.operationId) || typeof input.digest !== "string") {
    return { ok: false, error: { code: "invalid_input", message: "Confirm the exact preview and include an operation ID." } } as const;
  }
  const preview = previewPipeline(db, projectId, input);
  if (!preview.ok) return preview;
  if (preview.data.digest !== input.digest) {
    return { ok: false, error: { code: "stale_preview", message: "Refresh the preview before submitting." } } as const;
  }
  return { ok: false, error: { code: "unsupported", message: settingsProposalAvailability.reason } } as const;
}
