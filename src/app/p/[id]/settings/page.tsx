import { connection } from "next/server";
import { RepoSettings } from "@/components/repo-settings";
import { openDb } from "@/lib/workbox/db";
import { readRepoSettings } from "@/lib/workbox/settings-read";
import { settingsProposalAvailability } from "@/lib/workbox/settings-submit";

export const instant = false;

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  using db = openDb();
  const settings = await readRepoSettings(db, id);
  if (!settings) {
    return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <RepoSettings settings={settings} submission={settingsProposalAvailability} />
    </main>
  );
}
