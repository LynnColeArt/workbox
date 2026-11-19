import Link from "next/link";
import { redirect } from "next/navigation";
import { parseWorkboxAddress } from "@/lib/workbox/address";

export default async function OpenAddressPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string | string[] }>;
}) {
  const { address } = await searchParams;
  const input = Array.isArray(address) ? address[0] : address;
  const result = input ? parseWorkboxAddress(input) : null;
  if (result?.ok) redirect(result.target.href);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <h1 className="text-xl font-semibold">Open address</h1>
      <p className="wb-muted text-sm">
        {result && !result.ok ? result.error.message : "Paste a workbox:// address to open its canonical page."}
      </p>
      <form action="/open" method="get" className="flex flex-wrap items-end gap-2">
        <label className="min-w-60 flex-1 text-sm">
          <span className="mb-1 block">Address</span>
          <input
            name="address"
            defaultValue={input ?? ""}
            placeholder="workbox://project/<id>/issues/1"
            className="w-full rounded border border-[var(--wb-border)] bg-transparent px-3 py-2"
          />
        </label>
        <button type="submit" className="wb-btn">Open</button>
      </form>
      <p className="wb-muted text-xs">
        Native OS handler installation is opt-in; native Safari acceptance is tracked separately in issue #1.
      </p>
      <Link href="/" className="wb-link text-sm">Back to dashboard</Link>
    </main>
  );
}
