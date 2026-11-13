import Link from "next/link";

export function ListPagination({ page, pages, label, href }: {
  page: number;
  pages: number;
  label: string;
  href: (page: number) => string;
}) {
  if (pages <= 1) return null;
  const numericPages = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter(number => number >= 1 && number <= pages).sort((a, b) => a - b);
  return (
    <nav aria-label={label} className="mt-4 flex flex-wrap gap-3 text-sm">
      {page > 1 && <Link className="wb-link" href={href(page - 1)}>Previous</Link>}
      <span>Page {page} of {pages}</span>
      {numericPages.map(number => <Link key={number} className="wb-btn min-w-7 text-center aria-[current=page]:border-[var(--wb-link)] aria-[current=page]:font-semibold" aria-label={`Page ${number}`}
        aria-current={number === page ? "page" : undefined} href={href(number)} prefetch={false}>{number}</Link>)}
      {page < pages && <Link className="wb-link" href={href(page + 1)}>Next</Link>}
    </nav>
  );
}

export function CursorPagination({ label, firstHref, nextHref, nextText = "Next page" }: {
  label: string;
  firstHref?: string;
  nextHref?: string;
  nextText?: string;
}) {
  if (!firstHref && !nextHref) return null;
  return <nav aria-label={label} className="mt-3 flex flex-wrap gap-3 text-sm">
    {firstHref && <Link className="wb-link" href={firstHref} prefetch={false}>First page</Link>}
    {nextHref && <Link className="wb-link" href={nextHref} prefetch={false}>{nextText}</Link>}
  </nav>;
}
