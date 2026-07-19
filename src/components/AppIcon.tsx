import type { SVGProps } from "react";

export type AppIconName = "today" | "contacts" | "add" | "mixes" | "more" | "close" | "calendar" | "bolt" | "import" | "edit" | "external" | "community" | "integrations" | "billing" | "security" | "privacy";

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
  privacy: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>
};

export function AppIcon({ name, ...props }: { name: AppIconName } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
