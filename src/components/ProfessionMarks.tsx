import type { ReactNode } from "react";
import Link from "next/link";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const icon = (paths: ReactNode) => <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>{paths}</svg>;

// Profession marks, not customer logos: the product is pre-launch and this section makes no
// usage claim. Each mark is a simple line icon drawn here so nothing is fetched.
// Marks with a page of their own link to it; the anchor text is the profession, which is what the
// page is about.
export const PROFESSION_MARKS: { label: string; icon: ReactNode; href?: string }[] = [
  { label: "Real estate agents", href: "/for/real-estate-agents", icon: icon(<><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M10 20v-5h4v5" /></>) },
  { label: "Consultants", href: "/for/consultants", icon: icon(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M3 12h18" /></>) },
  { label: "Contractors", href: "/for/contractors", icon: icon(<><path d="M14.5 6.5 19 11" /><path d="m4 20 8.5-8.5" /><path d="M12.5 11.5 16 8l2.5-2.5-1.5-1.5L14.5 6.5l-3.5 3.5z" /><path d="M3.5 18.5 5.5 20.5" /></>) },
  { label: "Photographers", href: "/for/photographers", icon: icon(<><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>) },
  { label: "Recruiters", href: "/for/independent-recruiters", icon: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M17 8h4M19 6v4" /></>) },
  { label: "Coaches & trainers", icon: icon(<><circle cx="12" cy="5.5" r="2" /><path d="M9 21v-6l-2.5-3 3-4.5h5l3 4.5L15 15v6" /><path d="M6.5 12 4 13.5M17.5 12 20 13.5" /></>) },
  { label: "Sales reps", icon: icon(<><path d="M4 18 10 12l3 3 7-7" /><path d="M15 8h5v5" /></>) },
  { label: "Event planners", icon: icon(<><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="m9.5 15.5 1.8 1.8 3.5-3.8" /></>) },
  { label: "Entrepreneurs", icon: icon(<><path d="M12 3c3 2 4.5 5.5 4.5 9.5L12 15l-4.5-2.5C7.5 8.5 9 5 12 3z" /><path d="M7.5 12.5 5 15l2.5.5M16.5 12.5 19 15l-2.5.5" /><path d="M12 15v5" /></>) },
  { label: "Financial advisors", icon: icon(<><path d="M12 3v18" /><path d="M16.5 7.5c0-1.7-2-2.5-4.5-2.5S7.5 6 7.5 7.75 9.5 10 12 10s4.5 1 4.5 2.75S14.5 15 12 15s-4.5-.8-4.5-2.5" /></>) },
  { label: "Insurance agents", icon: icon(<><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" /><path d="m9.5 12 1.8 1.8 3.4-3.6" /></>) },
  // The list is illustrative, not exhaustive; the last mark says so instead of naming a twelfth trade.
  // Order matters: six per row, so "Coaches & trainers" closes the first row and "And more" the second.
  { label: "And more", icon: icon(<><circle cx="6" cy="12" r="1.7" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.7" fill="currentColor" stroke="none" /></>) }
];

export function ProfessionMarks() {
  return <section className="section profession-marks" aria-labelledby="professions-title">
    <div className="section-heading"><h2 id="professions-title">Find a follow-up Mix for your work.</h2><p>An estimate. A proposal. A client who’s not ready yet. Start with the conversation you already need to continue.</p></div>
    <ul className="profession-grid">{PROFESSION_MARKS.map(mark => <li key={mark.label}>{mark.href
      ? <Link href={mark.href}><span className="profession-icon">{mark.icon}</span><span>{mark.label}</span></Link>
      : <><span className="profession-icon">{mark.icon}</span><span>{mark.label}</span></>}</li>)}</ul>
  </section>;
}
