import type { SVGProps } from "react";

export type AppIconName = "today" | "contacts" | "add" | "mixes" | "more" | "close" | "calendar" | "bolt" | "import" | "edit" | "external" | "community" | "integrations" | "billing" | "security" | "privacy" | "archive" | "heart" | "arrowUp" | "arrowDown" | "arrowLeft" | "chevronUp" | "chevronDown" | "trash" | "check" | "refresh" | "email" | "phone" | "message" | "alert" | "circle" | "settings";

const paths: Record<AppIconName, React.ReactNode> = {
  today: <><path d="M5 12.5 9.2 17 19 7"/><path d="M7 3.8h10a3 3 0 0 1 3 3v10.4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6.8a3 3 0 0 1 3-3Z"/></>,
  contacts: <><circle cx="9" cy="8" r="3.2"/><path d="M3.8 19c.5-3.3 2.2-5 5.2-5s4.7 1.7 5.2 5M16 7.5h5M18.5 5v5M16 14h5M16 18h5"/></>,
  add: <><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></>,
  mixes: <><path d="M4 6h4c5 0 3 12 8 12h4M4 18h4c5 0 3-12 8-12h4"/><path d="m18 4 2 2-2 2M18 16l2 2-2 2"/></>,
  more: <><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
  bolt: <path d="m13.5 2-8 12h6l-1 8 8-12h-6l1-8Z"/>,
  import: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/></>,
  edit: <><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m13.8 7.2 3 3"/></>,
  external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></>,
  community: <><circle cx="9" cy="9" r="3"/><circle cx="17" cy="8" r="2"/><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6M15 14c3 0 5 1.5 5.5 4"/></>,
  integrations: <><path d="M8 12h8M6 8l-4 4 4 4M18 8l4 4-4 4"/></>,
  billing: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/></>,
  security: <><path d="M12 3 5 6v5c0 4.5 2.7 8 7 10 4.3-2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
  privacy: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  archive: <><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M3 4h18v4H3zM9 12h6"/></>,
  heart: <path d="M20.8 8.7c0 5-8.8 10.3-8.8 10.3S3.2 13.7 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z"/>,
  arrowUp: <><path d="m6 10 6-6 6 6"/><path d="M12 4v16"/></>,
  arrowDown: <><path d="m6 14 6 6 6-6"/><path d="M12 20V4"/></>,
  arrowLeft: <><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></>,
  chevronUp: <path d="m6 15 6-6 6 6"/>,
  chevronDown: <path d="m6 9 6 6 6-6"/>,
  trash: <><path d="M4 7h16M9 3h6l1 4H8l1-4Z"/><path d="m7 7 1 14h8l1-14M10 11v6M14 11v6"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  refresh: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8.5A7 7 0 0 1 18.7 7L20 12M4 12l1.3 5A7 7 0 0 0 17.9 15.5"/></>,
  email: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
  phone: <path d="M7.2 3.5 10 8l-2.1 2.1a15 15 0 0 0 6 6L16 14l4.5 2.8-.8 3.2c-.2.8-1 1.3-1.8 1.2C9.8 20.1 3.9 14.2 2.8 6.1c-.1-.8.4-1.6 1.2-1.8l3.2-.8Z"/>,
  message: <><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/></>,
  alert: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></>,
  circle: <circle cx="12" cy="12" r="7"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3.1 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3.1V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>
};

export function AppIcon({ name, ...props }: { name: AppIconName } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
