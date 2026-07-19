import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><AppIcon name="bolt" /></div>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className="button primary" href={actionHref}>{actionLabel}</Link>
    </div>
  );
}
