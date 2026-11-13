import Link from "next/link";
import { connection } from "next/server";
import { RepoSettings } from "@/components/repo-settings";
import { runSettingsOperation } from "@/lib/workbox/settings-operations";

export const instant = false;

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const result = await runSettingsOperation(id, { action: "read" }, false);
  if (!result.ok || !("details" in result.data)) {
    return <main className="mx-auto max-w-6xl px-4 py-10"><p className="wb-muted">Project not indexed.</p></main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <Link className="wb-link mb-4 inline-block" href={`/p/${encodeURIComponent(id)}/settings/migrations`}>Migrations</Link>
      <RepoSettings settings={result.data} submission={result.data.proposalSubmission} />
    </main>
  );
}
