import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { parseCalendarTime } from "@/lib/calendar-time";
import { personalSchedulingRules, DEFAULT_PERSONAL_SCHEDULING } from "@/lib/personal-scheduling";
import { validateStepTiming } from "@/lib/step-timing";
import { previewSchedule } from "@/lib/schedule-preview";
import { isValidTimezone } from "@/lib/mix-broadcast";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  const session = await getCurrentSession(); const membership = session?.user.memberships[0];
  if (!membership) return NextResponse.json({ error: "Sign in again to preview timing." }, { status: 401, headers });
  try {
    const raw = await request.text(); if (raw.length > 30_000) throw new Error("This preview is too large.");
    const body = JSON.parse(raw);
    if (!isValidTimezone(body.timezone) || !Array.isArray(body.steps) || !body.steps.length || body.steps.length > 50) throw new Error("Choose a timezone and between 1 and 50 Beats.");
    const start = parseCalendarTime(body.start, body.timezone), end = parseCalendarTime(body.end || body.start, body.timezone);
    if (end < start) throw new Error("The appointment end must follow its start.");
    const steps = body.steps.map((step: Record<string, unknown>, index: number) => {
      const dayOffset = Number(step.dayOffset), time = step.sendTimeMinutes == null ? null : Number(step.sendTimeMinutes);
      if (!Number.isInteger(dayOffset) || Math.abs(dayOffset) > 365 || (time !== null && (!Number.isInteger(time) || time < 0 || time > 1439))) throw new Error(`Check the timing of Beat ${index + 1}.`);
      return { ...validateStepTiming(String(step.anchor ?? "CALENDAR_DAY"), String(step.offsetMinutes ?? ""), index + 1), dayOffset, sendTimeMinutes: time, plannedAt: step.plannedAt ? parseCalendarTime(String(step.plannedAt), body.timezone) : null };
    });
    const saved = (await personalSchedulingRules([membership.workspaceId])).get(membership.workspaceId) ?? DEFAULT_PERSONAL_SCHEDULING;
    let rules = saved;
    if (body.rules) {
      const numbers = ["defaultFollowUpMinutes", "quietHoursStart", "quietHoursEnd"].map(key => Number(body.rules[key]));
      if (numbers.some(value => !Number.isInteger(value) || value < 0 || value > 1439) || !["KEEP", "NEXT_MONDAY", "PREVIOUS_FRIDAY"].includes(body.rules.weekendScheduling)) throw new Error("Check your scheduling defaults.");
      rules = { ...saved, defaultFollowUpMinutes: numbers[0], quietHoursStart: numbers[1], quietHoursEnd: numbers[2], weekendScheduling: body.rules.weekendScheduling };
    }
    return NextResponse.json({ items: previewSchedule(steps, start, end, body.timezone, rules, body.appointment === true), timezone: body.timezone }, { headers });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "The schedule could not be previewed." }, { status: 400, headers }); }
}
