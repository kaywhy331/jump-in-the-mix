import { findWorkspaceMix, type WorkspaceDb, WorkspaceScopeError } from "@/lib/workspace-repository";

export type BroadcastScheduleInput = {
  localDate: Date;
  dateInput: string;
  timeMinutes: number;
  timeInput: string;
  timezone: string;
};

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_INPUT = /^(\d{2}):(\d{2})$/;

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function parseTimeInput(value: string): number | null {
  const match = TIME_INPUT.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatTimeInput(minutes: number | null | undefined): string {
  const safe = Number.isInteger(minutes) && Number(minutes) >= 0 && Number(minutes) <= 1439 ? Number(minutes) : 600;
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function formatDateInput(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export function parseBroadcastScheduleInput(dateValue: string, timeValue: string, timezoneValue: string): BroadcastScheduleInput {
  const dateInput = dateValue.trim();
  const timeInput = timeValue.trim();
  const timezone = timezoneValue.trim();
  if (!DATE_INPUT.test(dateInput)) throw new Error("Choose a valid plan start date.");
  const localDate = new Date(`${dateInput}T12:00:00.000Z`);
  if (Number.isNaN(localDate.getTime()) || localDate.toISOString().slice(0, 10) !== dateInput) {
    throw new Error("Choose a valid plan start date.");
  }
  const timeMinutes = parseTimeInput(timeInput);
  if (timeMinutes === null) throw new Error("Choose a valid plan start time.");
  if (!isValidTimezone(timezone)) throw new Error("Choose a valid plan timezone.");
  return { localDate, dateInput, timeMinutes, timeInput, timezone };
}

export async function saveMixBroadcastSchedule(
  db: WorkspaceDb,
  workspaceId: string,
  mixId: string,
  schedule: BroadcastScheduleInput
): Promise<void> {
  const mix = await findWorkspaceMix(db, workspaceId, mixId);
  if (!mix) throw new WorkspaceScopeError("Plan");
  await db.mixBroadcastSchedule.upsert({
    where: { mixId: mix.id },
    create: {
      workspaceId,
      mixId: mix.id,
      localDate: schedule.localDate,
      timeMinutes: schedule.timeMinutes,
      timezone: schedule.timezone
    },
    update: {
      workspaceId,
      localDate: schedule.localDate,
      timeMinutes: schedule.timeMinutes,
      timezone: schedule.timezone
    }
  });
}

export async function removeMixBroadcastSchedule(db: WorkspaceDb, workspaceId: string, mixId: string): Promise<void> {
  await db.mixBroadcastSchedule.deleteMany({ where: { workspaceId, mixId } });
}
