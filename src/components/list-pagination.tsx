import Link from "next/link";

export function ListPagination({ page, pages, label, href }: {
  page: number;
  pages: number;
  label: string;
  href: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={label} className="mt-4 flex flex-wrap gap-3 text-sm">
      {page > 1 && <Link className="wb-link" href={href(page - 1)}>Previous</Link>}
      <span>Page {page} of {pages}</span>
      {page < pages && <Link className="wb-link" href={href(page + 1)}>Next</Link>}
    </nav>
  );
}
