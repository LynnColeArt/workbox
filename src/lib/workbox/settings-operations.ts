import { DatabaseSync } from "node:sqlite";
import { dbPath, openDb } from "./db";
import { getProject } from "./queries";
import { readRepoSettings, updateRepoDetails } from "./settings-read";
import { previewSettingsPipeline, settingsProposalAccess, submitSettingsProposal } from "./settings-submit";

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
        const repo = getProject(db, project);
        return settings && repo
          ? { ok: true, data: { ...settings, proposalSubmission: await settingsProposalAccess(repo.repoPath) } } as const
          : { ok: false, error: { code: "not_found", message: "Repository not found." } } as const;
      }
      case "update": return updateRepoDetails(db, project, fields);
      case "preview": return await previewSettingsPipeline(db, project, fields);
      case "submit": return await submitSettingsProposal(db, project, fields);
      default: return { ok: false, error: { code: "invalid_input", message: "Unknown Settings action." } } as const;
    }
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Workbox could not complete this Settings operation." } } as const;
  }
}
