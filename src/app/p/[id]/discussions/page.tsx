import Link from "next/link";
import { connection } from "next/server";
import { runDiscussionOperation } from "@/lib/workbox/discussions";
import { DiscussionForm } from "./discussion-form";

export const instant = false;

export default async function DiscussionsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ category?: string; status?: string; cursor?: string }>;
}) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const base = `/p/${encodeURIComponent(id)}/discussions`;
  const category = typeof query.category === "string" ? query.category.trim() : "";
  const status = query.status === "open" || query.status === "closed" ? query.status : "";
  const filter = new URLSearchParams();
  if (category) filter.set("category", category);
  if (status) filter.set("status", status);
  const result = await runDiscussionOperation(id, {
    action: "list", category: category || undefined, status: status || undefined, cursor: query.cursor,
  });
  const listing = result.ok && result.data.kind === "list" ? result.data : null;
  const next = new URLSearchParams(filter);
  if (listing?.nextCursor) next.set("cursor", listing.nextCursor);

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Discussions</h1>
        {listing?.signer.available && <a className="wb-btn" href="#new-discussion">New discussion</a>}
      </header>
      <form action={base} method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Category
          <input name="category" defaultValue={category} className="wb-btn ml-2" />
        </label>
        <label className="text-sm">Status
          <select name="status" defaultValue={status} className="wb-btn ml-2">
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <button type="submit" className="wb-btn">Filter</button>
      </form>
      {!result.ok && <div className="wb-panel space-y-2 p-4" role="status">
        <p>{result.error.message}</p>
        {query.cursor && <Link className="wb-link" href={`${base}?${filter}`}>Return to the first page</Link>}
      </div>}
      {listing && (
        <section className="wb-panel overflow-hidden" aria-label="Discussion threads">
          {listing.items.length === 0 && <p className="wb-muted p-4">No discussions match on this page.</p>}
          <ul className="divide-y divide-[var(--wb-border)]">
            {listing.items.map(item => (
              <li key={item.id} className="space-y-1 p-4">
                <Link className="wb-link font-semibold" href={item.href}>{item.state?.title ?? item.heads[0]?.state.title ?? "Discussion"}</Link>
                <p className="wb-muted text-sm">
                  {item.conflict ? "Conflicting revisions" : [item.state?.category, item.state?.status === "closed" ? "Closed" : "Open",
                    item.state?.accepted_reply_revision && "Answered"].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {listing?.nextCursor && <Link className="wb-link block" href={`${base}?${next}`}>Next page</Link>}
      {listing && <section id="new-discussion">
        {listing.signer.available ? <DiscussionForm
          endpoint={`/api/projects/${encodeURIComponent(id)}/discussions`} actor={listing.signer.identity}
          action={{ action: "create" }} fields={{ title: "", category: "", body: "" }}
          heading="Start a discussion" submitLabel="Start discussion" navigate
        /> : <p className="wb-muted">{listing.signer.reason}</p>}
      </section>}
    </main>
  );
}
