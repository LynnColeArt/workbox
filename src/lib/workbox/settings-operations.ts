import { DatabaseSync } from "node:sqlite";
import { dbPath, openDb } from "./db";
import { readRepoSettings, updateRepoDetails } from "./settings-read";
import { previewPipeline } from "./settings-preview";
import { settingsProposalAvailability, submitSettingsProposal } from "./settings-submit";

export async function runSettingsOperation(project: string, input: unknown, localOperator: boolean) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: { code: "invalid_input", message: "Expected a Settings request object." } } as const;
  }
  const { action, ...fields } = input as Record<string, unknown>;
  if ((action === "update" || action === "submit") && !localOperator) {
    return { ok: false, error: { code: "denied", message: "Use the local Workbox application to change repository settings." } } as const;
  }
  try {
    using db = action === "preview" || action === "submit"
      ? new DatabaseSync(dbPath(), { readOnly: true })
      : openDb();
    switch (action) {
      case "read": {
        const settings = await readRepoSettings(db, project);
        return settings
          ? { ok: true, data: { ...settings, proposalSubmission: settingsProposalAvailability } } as const
          : { ok: false, error: { code: "not_found", message: "Repository not found." } } as const;
      }
      case "update": return updateRepoDetails(db, project, fields);
      case "preview": return previewPipeline(db, project, fields);
      case "submit": return submitSettingsProposal(db, project, fields);
      default: return { ok: false, error: { code: "invalid_input", message: "Unknown Settings action." } } as const;
    }
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Workbox could not complete this Settings operation." } } as const;
  }
}
