import Link from "next/link";
export function AdminPagination({ page, total, pageSize, href }: { page: number; total: number; pageSize: number; href: (page: number) => string }) {
  return <nav className="admin-pagination" aria-label="Results pages"><span role="status">{total === 0 ? "0 results" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} results`}</span><div className="page-actions">{page > 1 && <Link className="button" href={href(page - 1)}>Previous</Link>}{page * pageSize < total && <Link className="button" href={href(page + 1)}>Next</Link>}</div></nav>;
}
