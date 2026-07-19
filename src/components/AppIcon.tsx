import type { SVGProps } from "react";

export type AppIconName = "today" | "contacts" | "add" | "mixes" | "more" | "close" | "calendar" | "bolt" | "import";

const paths: Record<AppIconName, React.ReactNode> = {
  today: <><path d="M5 12.5 9.2 17 19 7"/><path d="M7 3.8h10a3 3 0 0 1 3 3v10.4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6.8a3 3 0 0 1 3-3Z"/></>,
  contacts: <><circle cx="9" cy="8" r="3.2"/><path d="M3.8 19c.5-3.3 2.2-5 5.2-5s4.7 1.7 5.2 5M16 7.5h5M18.5 5v5M16 14h5M16 18h5"/></>,
  add: <><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></>,
  mixes: <><path d="M4 6h4c5 0 3 12 8 12h4M4 18h4c5 0 3-12 8-12h4"/><path d="m18 4 2 2-2 2M18 16l2 2-2 2"/></>,
  more: <><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
  bolt: <path d="m13.5 2-8 12h6l-1 8 8-12h-6l1-8Z"/>,
  import: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/></>
};

export function AppIcon({ name, ...props }: { name: AppIconName } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
