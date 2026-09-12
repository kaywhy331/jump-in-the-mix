"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AppIcon } from "@/components/AppIcon";
import { slotAvailability, type BookedInterval } from "@/lib/calendar-availability";
import { DATE_KEY, addDays, compareDateKeys, dateKeyOf, formatDateLong, formatDateTrigger, formatMonthTitle, formatTimeLabel, keyboardDateTarget, keyboardSlotTarget, minutesOf, monthGrid, parseDateKey, quickSelects, splitLocal, timeSlots, weekdayLabels } from "@/lib/when-picker";

// What is already booked on the chosen day, so appointment slots can be grayed out by name.
export type WhenAvailability = {
  bufferMinutes: number;
  entries: Array<{ id: string; title: string; kind: string; startsAt: string; endsAt: string }>;
  candidateKind: string;
  loading?: boolean;
  error?: string;
};

export type WhenPickerProps = {
  label: string;
  date: string;
  time?: string;
  onChange: (next: { date: string; time?: string }) => void;
  // "sheet" slides up a bottom sheet (the app). "inline" expands beneath the fields, for a
  // picker that lives inside a page section such as the homepage demo.
  variant?: "sheet" | "inline";
  dateName?: string;
  timeName?: string;
  minDate?: string;
  noPast?: boolean;
  disabled?: boolean;
  quickSelect?: boolean;
  availability?: WhenAvailability;
  allowOverlap?: boolean;
  slotRange?: { startMinutes?: number; endMinutes?: number; stepMinutes?: number };
  hint?: string;
  className?: string;
  // The user's saved BCP 47 locale; the formatters otherwise use one fixed locale so server and client match.
  locale?: string;
};

type View = "date" | "time";

const PrevIcon = () => <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 4-6 6 6 6" /></svg>;
const NextIcon = () => <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m8 4 6 6-6 6" /></svg>;

function monthOf(key: string, fallback: string): { year: number; month: number } {
  const parts = parseDateKey(key) ?? parseDateKey(fallback)!;
  return { year: parts.year, month: parts.month };
}

const hasModifier = (event: KeyboardEvent) => event.altKey || event.ctrlKey || event.metaKey;

export function WhenPicker({ label, date, time, onChange, variant = "sheet", dateName, timeName, minDate, noPast, disabled, quickSelect = true, availability, allowOverlap, slotRange, hint, className = "", locale }: WhenPickerProps) {
  const uid = useId();
  const withTime = time !== undefined;
  const [open, setOpen] = useState<View | null>(null);
  const [view, setView] = useState<View>("date");
  const [today, setToday] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => monthOf(date, dateKeyOf(new Date())));
  // The one day or time that is a tab stop while the panel is open; the arrow keys move it.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // Read aloud after a pick, so a screen reader hears the new value without hunting for it.
  const [announcement, setAnnouncement] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dateTrigger = useRef<HTMLButtonElement>(null);
  const timeTrigger = useRef<HTMLButtonElement>(null);
  const openedFrom = useRef<View>("date");
  const pendingFocus = useRef<string | null>(null);
  const focusOnView = useRef(false);

  // Today is read in the browser so server and client render the same absolute label first.
  useEffect(() => { setToday(dateKeyOf(new Date())); }, []);
  const earliest = minDate ?? (noPast ? today ?? undefined : undefined);
  const isPast = (key: string) => Boolean(earliest && compareDateKeys(key, earliest) < 0);

  const show = (next: View) => {
    if (disabled) return;
    openedFrom.current = next;
    focusOnView.current = true;
    setFocusKey(null);
    setCursor(monthOf(date, today ?? dateKeyOf(new Date())));
    setView(next);
    setOpen(next);
  };
  const close = () => {
    if (variant === "sheet" && dialogRef.current?.open) { dialogRef.current.close(); return; }
    setOpen(null);
  };
  const restoreFocus = () => (openedFrom.current === "time" ? timeTrigger : dateTrigger).current?.focus();
  // Closing after a pick returns focus to the trigger that now shows the new value.
  const finish = (target: View) => {
    openedFrom.current = target;
    close();
    if (variant === "inline") restoreFocus();
  };

  useLayoutEffect(() => {
    if (variant !== "sheet") return;
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open, variant]);

  // Land on the current choice when the panel opens or advances from date to time, so
  // keyboard and screen-reader users start from context. Switching views with the tabs
  // leaves focus on the tab.
  useEffect(() => {
    if (!open || !focusOnView.current) return;
    focusOnView.current = false;
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>('[data-key][tabindex="0"]') ?? panel?.querySelector<HTMLElement>("button:not(:disabled)");
    target?.focus({ preventScroll: variant === "inline" });
  }, [open, view, variant]);

  // After an arrow key moved the tab stop (possibly into another month), focus follows it.
  useEffect(() => {
    if (!pendingFocus.current) return;
    const target = panelRef.current?.querySelector<HTMLElement>(`[data-key="${pendingFocus.current}"]`);
    pendingFocus.current = null;
    target?.focus({ preventScroll: variant === "inline" });
  });

  const pickDate = (next: string) => {
    onChange({ date: next, ...(withTime ? { time } : {}) });
    setFocusKey(null);
    if (withTime) {
      setAnnouncement(`Date set to ${formatDateLong(next, locale)}. Now choose a time.`);
      focusOnView.current = true;
      setView("time");
    } else {
      setAnnouncement(`Date set to ${formatDateLong(next, locale)}.`);
      finish("date");
    }
  };
  const pickTime = (next: string) => {
    onChange({ date, time: next });
    setAnnouncement(`Time set to ${formatTimeLabel(next, locale)}${DATE_KEY.test(date) ? ` on ${formatDateLong(date, locale)}` : ""}.`);
    finish("time");
  };

  const slots = useMemo(() => timeSlots(slotRange, time), [slotRange, time]);
  const slotStates = useMemo(() => {
    if (!availability || !DATE_KEY.test(date)) return null;
    const step = slotRange?.stepMinutes ?? 30;
    const booked: BookedInterval[] = [];
    for (const entry of availability.entries) {
      const starts = splitLocal(entry.startsAt), ends = splitLocal(entry.endsAt);
      if (!starts || !ends) continue;
      const start = compareDateKeys(starts.date, date) < 0 ? 0 : compareDateKeys(starts.date, date) > 0 ? 1440 : minutesOf(starts.time);
      const end = compareDateKeys(ends.date, date) > 0 ? 1440 : compareDateKeys(ends.date, date) < 0 ? 0 : minutesOf(ends.time);
      if (end > start) booked.push({ id: entry.id, title: entry.title, kind: entry.kind, start, end });
    }
    return new Map(slotAvailability(slots.map(minutesOf), step, booked, availability.bufferMinutes, availability.candidateKind).map(slot => [slot.time, slot]));
  }, [availability, date, slots, slotRange]);
  const slotBlocked = (slot: string) => {
    const state = slotStates?.get(minutesOf(slot));
    return Boolean(state && state.state !== "free") && !allowOverlap;
  };

  const chips = today ? quickSelects(today).filter(chip => !earliest || compareDateKeys(chip.date, earliest) >= 0) : [];
  const cells = monthGrid(cursor.year, cursor.month);
  const moveMonth = (delta: number) => setCursor(current => {
    const next = new Date(Date.UTC(current.year, current.month - 1 + delta, 1));
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
  });
  const dateLabel = formatDateTrigger(date, today, locale);
  const timeLabel = withTime ? formatTimeLabel(time, locale) : "";
  const monthTitle = formatMonthTitle(cursor.year, cursor.month, locale);
  const panelId = `${uid}-panel`;
  const hintId = `${uid}-hint`;
  const gridHelpId = `${uid}-grid-help`;

  // Which day is the tab stop: the arrow-key position, else the chosen date, else today,
  // else the first day of the month that can still be picked.
  const visibleDay = (key: string | null | undefined) => Boolean(key && cells.some(cell => cell.key === key) && !isPast(key));
  const dayTabStop = visibleDay(focusKey) ? focusKey : visibleDay(date) ? date : visibleDay(today) ? today : cells.find(cell => cell.inMonth && !isPast(cell.key))?.key ?? cells.find(cell => !isPast(cell.key))?.key ?? null;
  const openSlot = (key: string | null | undefined) => Boolean(key && slots.includes(key) && !slotBlocked(key));
  const slotTabStop = openSlot(focusKey) ? focusKey : openSlot(time) ? time : slots.find(slot => !slotBlocked(slot)) ?? null;

  const moveFocus = (next: string | null) => {
    if (!next) return;
    setFocusKey(next);
    pendingFocus.current = next;
    if (DATE_KEY.test(next) && !cells.some(cell => cell.key === next)) setCursor(monthOf(next, next));
  };
  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = event.target instanceof HTMLElement ? event.target.dataset.key : undefined;
    if (!current || hasModifier(event)) return;
    const next = keyboardDateTarget(current, event.key, earliest);
    if (!next) return;
    event.preventDefault();
    moveFocus(next);
  };
  const onSlotsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = event.target instanceof HTMLElement ? event.target.dataset.key : undefined;
    if (!current || hasModifier(event)) return;
    const columns = getComputedStyle(event.currentTarget).gridTemplateColumns.split(" ").filter(Boolean).length;
    const next = keyboardSlotTarget(slots.map(slot => ({ time: slot, available: !slotBlocked(slot) })), current, event.key, columns);
    if (!next) return;
    event.preventDefault();
    moveFocus(next);
  };

  const panel = <div ref={panelRef} className="when-panel" id={panelId} onKeyDown={event => { if (event.key === "Escape" && variant === "inline") { event.preventDefault(); event.stopPropagation(); close(); restoreFocus(); } }}>
    <div className="when-panel-head">
      {withTime ? <div className="when-tabs" role="group" aria-label="Pick a date or a time">
        <button type="button" className="when-tab" aria-pressed={view === "date"} onClick={() => { focusOnView.current = false; setView("date"); }}>Date</button>
        <button type="button" className="when-tab" aria-pressed={view === "time"} onClick={() => { focusOnView.current = false; setView("time"); }}>Time</button>
      </div> : <strong className="when-panel-title">{label}</strong>}
      <button type="button" className="button small when-done" onClick={() => { close(); if (variant === "inline") restoreFocus(); }}>Done</button>
    </div>
    {view === "date" ? <div className="when-date-view">
      {quickSelect && chips.length > 0 && <div className="when-chips" role="group" aria-label="Quick choices">
        {chips.map(chip => <button type="button" key={chip.id} className="when-chip" aria-pressed={chip.date === date} onClick={() => pickDate(chip.date)}>{chip.label}</button>)}
      </div>}
      <div className="when-month">
        <button type="button" className="when-month-nav" aria-label="Previous month" onClick={() => moveMonth(-1)}><PrevIcon /></button>
        <strong aria-live="polite">{monthTitle}</strong>
        <button type="button" className="when-month-nav" aria-label="Next month" onClick={() => moveMonth(1)}><NextIcon /></button>
      </div>
      <div className="when-weekdays" aria-hidden="true">{weekdayLabels(locale).map((day, index) => <span key={index}>{day}</span>)}</div>
      <p className="sr-only" id={gridHelpId}>Use the arrow keys to move between days, Home and End for the ends of the week, and Page Up or Page Down to change the month.</p>
      <div className="when-grid" role="group" aria-label={`Days in ${monthTitle}`} aria-describedby={gridHelpId} onKeyDown={onGridKeyDown}>
        {cells.map(cell => <button type="button" key={cell.key} data-key={cell.key} tabIndex={cell.key === dayTabStop ? 0 : -1} className={`when-day${cell.inMonth ? "" : " outside"}${cell.key === today ? " today" : ""}`} aria-label={`${formatDateLong(cell.key)}${cell.key === today ? ", today" : ""}`} aria-pressed={cell.key === date} disabled={isPast(cell.key)} onClick={() => pickDate(cell.key)}>{cell.day}</button>)}
      </div>
    </div> : <div className="when-time-view">
      <p className="when-time-heading">{DATE_KEY.test(date) ? formatDateLong(date, locale) : "Choose a date first"}</p>
      {availability?.loading && <p className="when-legend" role="status">Checking your calendar…</p>}
      {availability?.error && <p className="when-legend" role="alert">{availability.error}</p>}
      <div className="when-slots" role="group" aria-label="Times" onKeyDown={onSlotsKeyDown}>
        {slots.map(slot => {
          const state = slotStates?.get(minutesOf(slot));
          const taken = state?.state === "busy", buffered = state?.state === "buffer";
          const detail = taken ? `, taken by ${state?.title}` : buffered ? `, inside the buffer around ${state?.title}` : "";
          return <button type="button" key={slot} data-key={slot} tabIndex={slot === slotTabStop ? 0 : -1} className={`when-slot${taken ? " busy" : ""}${buffered ? " buffer" : ""}`} aria-pressed={slot === time} aria-label={`${formatTimeLabel(slot)}${detail}`} disabled={slotBlocked(slot)} onClick={() => pickTime(slot)}>
            <span>{formatTimeLabel(slot, locale)}</span>
            {(taken || buffered) && <small>{buffered ? `Buffer · ${state?.title}` : state?.title}</small>}
          </button>;
        })}
      </div>
      {availability && !availability.loading && <p className="when-legend">Grayed times are already taken{availability.bufferMinutes > 0 ? ` or inside your ${availability.bufferMinutes}-minute buffer` : ""}.{allowOverlap ? " Overlaps are allowed for this event." : ""}</p>}
    </div>}
  </div>;

  return <div className={`when-picker ${variant}${className ? ` ${className}` : ""}`} role="group" aria-label={label}>
    {dateName && <input type="hidden" name={dateName} value={date} />}
    {timeName && withTime && <input type="hidden" name={timeName} value={time} />}
    <div className={`when-triggers${withTime ? "" : " single"}`}>
      <button ref={dateTrigger} type="button" className="when-trigger date" disabled={disabled} aria-haspopup={variant === "sheet" ? "dialog" : undefined} aria-expanded={open !== null && view === "date"} aria-controls={variant === "inline" ? panelId : undefined} aria-describedby={hint ? hintId : undefined} onClick={() => open && view === "date" && variant === "inline" ? close() : show("date")}>
        <AppIcon name="calendar" /><span className="sr-only">{label}, date: </span><span>{dateLabel}</span>
      </button>
      {withTime && <button ref={timeTrigger} type="button" className="when-trigger time" disabled={disabled} aria-haspopup={variant === "sheet" ? "dialog" : undefined} aria-expanded={open !== null && view === "time"} aria-controls={variant === "inline" ? panelId : undefined} aria-describedby={hint ? hintId : undefined} onClick={() => open && view === "time" && variant === "inline" ? close() : show("time")}>
        <AppIcon name="clock" /><span className="sr-only">{label}, time: </span><span>{timeLabel}</span>
      </button>}
    </div>
    {hint && <p className="when-hint" id={hintId}>{hint}</p>}
    <span className="sr-only" role="status" aria-atomic="true">{announcement}</span>
    {variant === "inline" && open && panel}
    {variant === "sheet" && open && <dialog ref={dialogRef} className="sheet when-sheet" aria-label={label} onClick={event => { if (event.target === event.currentTarget) close(); }} onClose={() => { setOpen(null); restoreFocus(); }}>
      <div className="sheet-panel">
        <header className="sheet-header"><div><h2>{label}</h2></div><button className="icon-button" type="button" onClick={close} aria-label={`Close ${label}`}><AppIcon name="close" /></button></header>
        <div className="sheet-body">{panel}</div>
      </div>
    </dialog>}
  </div>;
}

// Uncontrolled convenience for server-rendered forms: holds the value and posts it as hidden inputs.
export function WhenField({ defaultDate, defaultTime, ...props }: Omit<WhenPickerProps, "date" | "time" | "onChange"> & { defaultDate?: string; defaultTime?: string }) {
  const [value, setValue] = useState<{ date: string; time?: string }>({ date: defaultDate ?? "", ...(defaultTime !== undefined ? { time: defaultTime } : {}) });
  // A blank default means "the usual follow-up window": tomorrow, decided in the browser.
  useEffect(() => { setValue(current => current.date ? current : { ...current, date: addDays(dateKeyOf(new Date()), 1) }); }, []);
  return <WhenPicker {...props} date={value.date} time={value.time} onChange={setValue} />;
}
