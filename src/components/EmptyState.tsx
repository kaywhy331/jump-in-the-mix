import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

/**
 * An empty list's card: one icon, a title, the app's hint and one next action (JITM-08 §2.32). Without an action it is a
 * detail pane's selection prompt, which keeps that pane from going blank.
 */
export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  icon = "message",
  className
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  icon?: AppIconName;
  className?: string;
}) {
  return (
    <div className={className ? `empty-state ${className}` : "empty-state"}>
      <div className="empty-icon"><AppIcon name={icon} /></div>
      <h2>{title}</h2>
      <p className="speech-bubble speech-bubble--soft">{description}</p>
      {actionHref && actionLabel && <Link className="button primary" href={actionHref}>{actionLabel}</Link>}
    </div>
  );
}
