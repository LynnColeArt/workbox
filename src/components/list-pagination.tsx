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
      {numericPages.map(number => <Link key={number} className="wb-link" aria-label={`Page ${number}`}
        aria-current={number === page ? "page" : undefined} href={href(number)}>{number}</Link>)}
      {page < pages && <Link className="wb-link" href={href(page + 1)}>Next</Link>}
    </nav>
  );
}
