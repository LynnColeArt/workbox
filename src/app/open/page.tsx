import { DatabaseSync } from "node:sqlite";
import { connection } from "next/server";
import { parseWorkboxAddress } from "@/lib/workbox/address";
import { resolveWorkboxAddress } from "@/lib/workbox/address-resolution";
import { dbPath } from "@/lib/workbox/db";

export const instant = false;

type Destination = { path: string } | { error: string };

function findDestination(address: string): Destination {
  const parsed = parseWorkboxAddress(address);
  if (!parsed.ok) {
    return { error: "Enter a valid Workbox address, such as workbox://home." };
  }

  switch (parsed.target.kind) {
    case "home":
      return { path: "/" };
    case "projectDirectory":
      return { error: "Explore is unavailable. Open a specific project or go to the Dashboard." };
    case "trending":
      return { error: "Trending is unavailable. Go to the Dashboard to see recent activity." };
  }

  try {
    using db = new DatabaseSync(dbPath(), { readOnly: true });
    const resolved = resolveWorkboxAddress(db, parsed.target);
    if (!resolved.ok) {
      return { error: "Workbox could not find that project or issue. Check the address and try again." };
    }

    const target = resolved.target;
    if ("projectSlug" in target) {
      const projectPath = `/p/${encodeURIComponent(target.projectSlug)}`;
      switch (target.kind) {
        case "project":
          return { path: projectPath };
        case "issue":
          return { path: `${projectPath}/issue/${encodeURIComponent(target.issueId)}` };
        case "memory":
          return { path: `${projectPath}/memories` };
        case "pipelines":
          return { path: `${projectPath}/ci` };
      }
    }
  } catch {
    return { error: "The project index is unavailable. Check Workbox’s setup and try again." };
  }
  return { error: "That Workbox destination is unavailable." };
}

export default async function OpenAddressPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string | string[] }>;
}) {
  await connection();
  const { address } = await searchParams;
  const entered = Array.isArray(address) ? (address[0] ?? "") : (address ?? "");
  let error: string | undefined;

  if (Array.isArray(address)) {
    error = "Enter exactly one Workbox address.";
  } else if (address !== undefined) {
    const trimmed = address.trim();
    if (!trimmed) {
      error = "Enter a Workbox address.";
    } else {
      const destination = findDestination(trimmed);
      if ("path" in destination) {
        return (
          <main className="mx-auto max-w-xl px-4 py-10">
            {/* App Router streaming redirects rely on hydration in this build. */}
            <meta httpEquiv="refresh" content={`0;url=${destination.path}`} />
            <h1 className="mb-4 text-2xl font-semibold">Open address</h1>
            <a href={destination.path} className="wb-link">Continue to the destination</a>
          </main>
        );
      }
      error = destination.error;
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">Open address</h1>
      <form action="/open" method="get" className="wb-panel space-y-4 p-4">
        <div>
          <label htmlFor="workbox-address" className="block text-sm font-medium">
            Workbox address
          </label>
          <input
            id="workbox-address"
            name="address"
            type="text"
            defaultValue={entered}
            required
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "workbox-address-error" : "workbox-address-example"}
            className="mt-2 block w-full rounded-md border border-[var(--wb-border)] bg-[var(--wb-bg)] px-3 py-2 text-sm"
          />
          {error ? (
            <p id="workbox-address-error" className="mt-2 text-sm text-[var(--wb-warn)]">
              {error}
            </p>
          ) : (
            <p id="workbox-address-example" className="wb-muted mt-2 text-sm">
              Example <code>workbox://home</code>
            </p>
          )}
        </div>
        <button type="submit" className="wb-btn">Open</button>
      </form>
    </main>
  );
}
