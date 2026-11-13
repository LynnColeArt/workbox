import { connection } from "next/server";
import { ListPagination } from "@/components/list-pagination";
import { MigrationForm } from "@/components/migration-form";
import { runMigrationOperation } from "@/lib/workbox/migrations";

export const instant = false;

export default async function MigrationsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  await connection();
  const { id } = await params;
  const requestedPage = Number((await searchParams).page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [catalog, sessions] = await Promise.all([
    runMigrationOperation(id, { action: "catalog" }),
    runMigrationOperation(id, { action: "sessions", page }),
  ]);
  const available = catalog.ok && "sources" in catalog.data ? catalog.data : null;
  const listing = sessions.ok && "sessions" in sessions.data ? sessions.data : null;
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Migrations</h1>
      {!available && <p role="status">Migration catalog unavailable. Reload after checking the configured Hubnot installation.</p>}
      <MigrationForm endpoint={`/api/projects/${encodeURIComponent(id)}/migrations`}
        sources={available?.sources ?? []} destinations={available?.destinations ?? []} paths={available?.paths ?? []}
        sessions={listing?.sessions ?? []} key={listing?.page} />
      {listing && <ListPagination page={listing.page} pages={listing.totalPages} label="Migration session pages" href={next => `?page=${next}`} />}
    </main>
  );
}
