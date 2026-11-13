"use client";

import { useEffect } from "react";

export function ProposalLineageRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <a className="wb-link" href={href}>Open selected revision</a>
    </main>
  );
}
