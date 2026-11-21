import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

/**
 * The one auth and system card (JITM-06 §2.38, JITM-07 §2.32): the logo first, then the page's own H1,
 * which names the current state (JITM-08 §2.39), and its actions on the shared leading alignment.
 */
export function AuthCard({ children }: { children: ReactNode }) {
  return <main className="auth-shell"><section className="auth-card"><Logo />{children}</section></main>;
}
