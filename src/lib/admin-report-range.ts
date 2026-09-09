export const REPORT_DAY_MS = 86_400_000;
export class ReportError extends Error {}
export type ReportRange = { from: Date; until: Date; asOf: Date; fromDay: string; throughDay: string; days: number };
function date(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) throw new ReportError("Choose valid start and end dates.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ReportError("Choose valid start and end dates.");
  return parsed;
}
export function parseReportRange(input: { from?: unknown; through?: unknown; days?: unknown }, now = new Date()): ReportRange {
  const today = date(now.toISOString().slice(0, 10));
  let from: Date, through: Date;
  if (input.from !== undefined || input.through !== undefined) { from = date(input.from); through = date(input.through); }
  else {
    const preset = input.days === undefined ? "30" : input.days;
    if ((typeof preset !== "number" && typeof preset !== "string") || !/^(7|30|90)$/.test(String(preset))) throw new ReportError("Choose 7, 30, or 90 days, or enter a date range.");
    const days = Number(preset);
    through = today; from = new Date(today.getTime() - (days - 1) * REPORT_DAY_MS);
  }
  const days = Math.round((through.getTime() - from.getTime()) / REPORT_DAY_MS) + 1;
  if (days < 1 || days > 366 || through > today) throw new ReportError("Choose up to 366 days, ending today or earlier.");
  return { from, until: new Date(through.getTime() + REPORT_DAY_MS), asOf: new Date(now), fromDay: from.toISOString().slice(0, 10), throughDay: through.toISOString().slice(0, 10), days };
}
export function reportRatio(numerator: number, denominator: number) { return denominator ? `${Math.round(numerator / denominator * 1000) / 10}%` : "—"; }

export function configuredReportExclusions(value: string | undefined, kind: "ids" | "emails") {
  const values = [...new Set((value ?? "").split(",").map(v => kind === "emails" ? v.trim().toLowerCase() : v.trim()).filter(Boolean))];
  if (values.length > 100 || values.some(v => v.length > 254 || /[\s\u0000-\u001f\u007f]/u.test(v) || (kind === "emails" && !/^[^@]+@[^@]+\.[^@]+$/.test(v)))) {
    throw new ReportError("Report exclusions are invalid. Ask the application operator to check REPORT_EXCLUDED_USER_IDS and REPORT_EXCLUDED_EMAILS; each allows up to 100 entries.");
  }
  return values;
}
