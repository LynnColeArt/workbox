"use client";

import { useState, type ReactNode } from "react";

export function ChangedFileFilter({ files, children }: { files: string[]; children: ReactNode[] }) {
  const [query, setQuery] = useState("");
  const matches = files.map(file => file.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <input type="search" aria-label="Filter changed files" placeholder="Filter files…" value={query}
      onChange={event => setQuery(event.target.value)} className="wb-btn mb-2 w-full" />
    <ul aria-label="Changed files" className="max-h-[65vh] space-y-1 overflow-auto">
      {children.map((child, index) => <li key={files[index]} hidden={!matches[index]}>{child}</li>)}
    </ul>
    {!matches.includes(true) && <p className="wb-muted text-sm" role="status">No matching files.</p>}
  </>;
}
