import Link from "next/link";

export function FilterTag({ value, field, href, selected }: {
  value: string;
  field: "label" | "category";
  href: string;
  selected: boolean;
}) {
  return <Link href={href} className="wb-chip wb-filter-tag break-words max-w-full"
    aria-current={selected ? "true" : undefined}
    aria-label={selected ? `Clear ${field} filter: ${value}` : `Filter by ${field}: ${value}`}
    prefetch={false}>{value}</Link>;
}
