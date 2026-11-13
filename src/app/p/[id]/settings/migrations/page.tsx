import { connection } from "next/server";
import { MigrationForm } from "@/components/migration-form";
import { runMigrationOperation } from "@/lib/workbox/migrations";

export const instant = false;

export default async function MigrationsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [catalog, sessions] = await Promise.all([
    runMigrationOperation(id, { action: "catalog" }),
    runMigrationOperation(id, { action: "sessions" }),
  ]);
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Migrations</h1>
      {catalog.ok && "sources" in catalog.data ? (
        <MigrationForm endpoint={`/api/projects/${encodeURIComponent(id)}/migrations`}
          sources={catalog.data.sources} foreign={catalog.data.providers}
          sessions={sessions.ok && "sessions" in sessions.data ? sessions.data.sessions : []} />
      ) : <p role="status">Migration catalog unavailable. Reload after checking the configured Hubnot installation.</p>}
    </main>
  );
}
