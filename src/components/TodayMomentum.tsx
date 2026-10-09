"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";

type Section = "overdue" | "today" | "upcoming";
type Counts = Record<Section | "done", number>;
type JumpState = { jumpId?: string; status?: string; mixEnd?: unknown };

const CountsContext = createContext<Counts | null>(null);

function cardOf(jumpId: string): Element | null {
  return document.querySelector(`[data-jump-workflow="${CSS.escape(jumpId)}"]`);
}

/** The list section a follow-up's card sits in, read while the card is still in place. */
function sectionOf(jumpId: string): Section | null {
  const section = cardOf(jumpId)?.closest("[data-today-section]")?.getAttribute("data-today-section");
  return section === "overdue" || section === "today" || section === "upcoming" ? section : null;
}

/**
 * Today's counts change the moment an outcome is recorded here: the follow-up leaves its section for Done, and Undo
 * moves it back. Each read from the server (`readAt`) replaces these adjustments (D70, JITM-08 §2.36, TRU-06).
 */
export function TodayLiveCounts({ initial, readAt, children }: { initial: Counts; readAt: string; children: ReactNode }) {
  const key = `${readAt}:${initial.overdue}:${initial.today}:${initial.upcoming}:${initial.done}`;
  const [moved, setMoved] = useState<{ key: string; sections: Map<string, Section> }>({ key, sections: new Map() });
  const sections = useMemo(() => moved.key === key ? moved.sections : new Map<string, Section>(), [moved, key]);
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<JumpState>).detail;
      const jumpId = detail?.jumpId;
      if (!jumpId) return;
      if (detail.status === "DONE" || detail.status === "SKIPPED") {
        // The outcome event arrives before React removes the card, so its section is still readable.
        const section = sectionOf(jumpId);
        if (!section) return;
        setMoved(current => ({ key, sections: new Map(current.key === key ? current.sections : []).set(jumpId, section) }));
      } else if (detail.status === "PENDING") {
        setMoved(current => {
          if (current.key !== key || !current.sections.has(jumpId)) return current;
          const next = new Map(current.sections);
          next.delete(jumpId);
          return { key, sections: next };
        });
      }
    };
    window.addEventListener("jitm:jump-state", onState);
    return () => window.removeEventListener("jitm:jump-state", onState);
  }, [key]);
  const counts = useMemo(() => {
    const live = { ...initial };
    for (const section of sections.values()) { live[section] = Math.max(0, live[section] - 1); live.done += 1; }
    return live;
  }, [initial, sections]);
  return <CountsContext.Provider value={counts}>{children}</CountsContext.Provider>;
}

/** One of Today's live counts. */
export function LiveCount({ name }: { name: keyof Counts }) {
  const counts = useContext(CountsContext);
  return <>{counts ? counts[name].toLocaleString("en-US") : null}</>;
}

/** A list section that leaves once its live count reaches 0, and returns on Undo; its cards stay mounted for Undo. */
export function LiveSection({ name, children, ...props }: { name: "overdue" | "today" } & Omit<ComponentProps<"section">, "hidden">) {
  const counts = useContext(CountsContext);
  return <section {...props} data-today-section={name} hidden={counts?.[name] === 0 || undefined}>{children}</section>;
}

/** The header's summary of what needs attention, kept in step with the live counts. */
export function LiveAttentionSummary() {
  const counts = useContext(CountsContext);
  if (!counts) return null;
  const attention = counts.overdue + counts.today;
  if (!attention) return <>Nothing else needs your attention right now.</>;
  return <>{`${attention.toLocaleString("en-US")} follow-up${attention === 1 ? " needs" : "s need"} your attention${counts.overdue ? ` · ${counts.overdue.toLocaleString("en-US")} overdue` : ""}.`}</>;
}
