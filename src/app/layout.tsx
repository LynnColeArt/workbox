import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workbox",
  description: "A communal room for hubnot projects",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b" style={{ borderColor: "var(--wb-border)", background: "var(--wb-panel)" }}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2" style={{ color: "var(--wb-text)" }}>
              <span aria-hidden className="inline-block h-4 w-4 rounded-sm" style={{ background: "var(--wb-accent)" }} />
              <span className="font-semibold tracking-tight">Workbox</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="wb-link">Dashboard</Link>
              <Link href="/explore" className="wb-link">Explore</Link>
              <span className="wb-muted">Identities</span>
            </nav>
            <div className="ml-auto hidden wb-muted text-xs sm:block">a communal room for hubnot projects</div>
            <form action="/open" method="get" role="search" aria-label="Open a workbox address" className="flex w-full min-w-0 items-center gap-2 text-sm sm:ml-auto sm:w-auto">
              <label className="sr-only" htmlFor="open-address">Open address</label>
              <input
                id="open-address"
                name="address"
                placeholder="workbox://…"
                className="min-w-0 flex-1 rounded border border-[var(--wb-border)] bg-transparent px-2 py-1 text-xs sm:w-40 sm:flex-none"
              />
              <button type="submit" className="wb-btn shrink-0 !py-1 !text-xs">Open</button>
            </form>
          </div>
        </header>
        {children}
        <footer className="border-t mt-12" style={{ borderColor: "var(--wb-border)" }}>
          <div className="mx-auto max-w-6xl px-4 py-6 wb-muted text-xs">
            Trust is rendered, not hidden — every fact shown here is a signed event chain carried by Git.
          </div>
        </footer>
      </body>
    </html>
  );
}
