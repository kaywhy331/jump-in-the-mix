"use client";
import { TimezonePicker } from "@/components/TimezonePicker";
import { COMMUNICATION_CHOICES, WORK_DAYS, type JourneySetupValues } from "@/lib/journey-preferences";
import { formatTimeInput, parseTimeInput } from "@/lib/mix-broadcast";
import { APPOINTMENT_BUFFER_CHOICES } from "@/lib/calendar-availability";
import styles from "./JourneySetup.module.css";

// detectTimezone: only onboarding may adopt the device zone, and only while the account still holds the UTC default;
// the account preferences editor never switches a saved zone on its own.
export function JourneyPreferenceFields({ value, onChange, id, detectTimezone = false }: { value: JourneySetupValues; onChange: (value: JourneySetupValues) => void; id: string; detectTimezone?: boolean }) {
  const p = value.preferences;
  const preference = (change: Partial<typeof p>) => onChange({ ...value, preferences: { ...p, ...change } });
  const time = (label: string, name: string, minutes: number, change: (n: number) => void) => <label className="field"><span>{label}</span><input type="time" name={name} value={Number.isFinite(minutes) ? formatTimeInput(minutes) : ""} required onChange={event => change(parseTimeInput(event.target.value) ?? NaN)} /></label>;
  return <div className="form-stack">
    <fieldset className="onboarding-step-card"><legend>How do you like to keep in touch?</legend><div className="form-stack">
      <label className="field"><span>Preferred communication</span><select aria-label="Preferred communication" aria-describedby={`${id}-communication-help`} name="communication" value={p.communication} onChange={event => preference({ communication: event.target.value as typeof p.communication })}>{Object.entries(COMMUNICATION_CHOICES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><small id={`${id}-communication-help`}>The recommended Mix uses texts, emails and calls. Your preference sets message types in new Mega-Mixes. Check-in calls stay as calls. Review each person’s preferences before sending.</small></label>
      <label className="field"><span>Space between follow-ups</span><select aria-label="Space between follow-ups" aria-describedby={`${id}-pace-help`} name="pace" value={p.pace} onChange={event => preference({ pace: event.target.value as typeof p.pace })}><option value="RECOMMENDED">Use the recommended delays</option><option value="RELAXED">More space · double the wait</option></select><small id={`${id}-pace-help`}>For example, a 3-day wait becomes 6 days. Steps waiting for your decision still wait for you.</small></label>
    </div></fieldset>
    <fieldset className="onboarding-step-card"><legend>When does follow-up fit your day?</legend><div className="form-stack">
      <TimezonePicker key={id} id={`${id}-timezone`} defaultValue={value.timezone} confirmDetection={detectTimezone} onChange={timezone => { if (timezone !== value.timezone) onChange({ ...value, timezone }); }} />
      <fieldset className={styles.days}><legend>Working days</legend><div>{[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day}><input type="checkbox" name="workDay" value={day} checked={p.workDays.includes(day)} onChange={event => preference({ workDays: event.target.checked ? [...p.workDays, day] : p.workDays.filter(item => item !== day) })} /><span>{WORK_DAYS[day]}</span></label>)}</div></fieldset>
      <div className="form-grid">
        {time("Open from", "workStart", p.workStart, workStart => preference({ workStart }))}
        {time("Close at", "workEnd", p.workEnd, workEnd => preference({ workEnd }))}
        {time("Preferred follow-up time", "defaultFollowUpTime", value.defaultFollowUpMinutes, defaultFollowUpMinutes => onChange({ ...value, defaultFollowUpMinutes }))}
        {time("Quiet time starts", "quietHoursStart", value.quietHoursStart, quietHoursStart => onChange({ ...value, quietHoursStart }))}
        {time("Quiet time ends", "quietHoursEnd", value.quietHoursEnd, quietHoursEnd => onChange({ ...value, quietHoursEnd }))}
        <label className="field"><span>Space around appointments</span><select name="appointmentBufferMinutes" value={value.appointmentBufferMinutes} onChange={event => onChange({ ...value, appointmentBufferMinutes: Number(event.target.value) })}>{[...new Set([...APPOINTMENT_BUFFER_CHOICES, value.appointmentBufferMinutes])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n ? `${n} minutes before and after` : "No buffer"}</option>)}</select></label>
      </div>
      <label className="checkbox-card"><input type="checkbox" name="avoidAppointments" checked={p.avoidAppointments} onChange={event => preference({ avoidAppointments: event.target.checked })} /><span>Keep follow-up reminders clear of appointments on my calendar</span></label>
      <small>Flexible follow-ups move to your next available time. Exact appointment reminders and dates you set yourself keep their timing. Matching quiet-time start and end means no quiet time.</small>
    </div></fieldset>
  </div>;
}

export function JourneyPreferenceSummary({ value }: { value: JourneySetupValues }) {
  const p = value.preferences;
  return <dl className={styles.summary}>
    <div><dt>Communication</dt><dd>{COMMUNICATION_CHOICES[p.communication]}</dd></div>
    <div><dt>Spacing</dt><dd>{p.pace === "RELAXED" ? "Double the recommended delays" : "Recommended delays"}</dd></div>
    <div><dt>Working hours</dt><dd>{[1, 2, 3, 4, 5, 6, 0].filter(day => p.workDays.includes(day)).map(day => WORK_DAYS[day].slice(0, 3)).join(", ")} · {formatTimeInput(p.workStart)}–{formatTimeInput(p.workEnd)} · {value.timezone}</dd></div>
    <div><dt>Follow-ups</dt><dd>Prefer {formatTimeInput(value.defaultFollowUpMinutes)}{value.quietHoursStart !== value.quietHoursEnd ? ` · Quiet from ${formatTimeInput(value.quietHoursStart)} to ${formatTimeInput(value.quietHoursEnd)}` : " · No quiet time"}</dd></div>
    <div><dt>Appointments</dt><dd>{p.avoidAppointments ? "Move reminders around calendar appointments" : "Keep reminders within working hours"} · {value.appointmentBufferMinutes}-minute buffer</dd></div>
  </dl>;
}
