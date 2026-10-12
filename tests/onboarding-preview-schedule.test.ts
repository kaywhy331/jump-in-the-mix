import { describe, expect, it } from "vitest";
import { DEFAULT_JOURNEY_PREFERENCES } from "../src/lib/journey-preferences";
import { starterPlanForReason } from "../src/lib/journey-starts";
import { beatWhen } from "../src/lib/onboarding-preview";
import { onboardingPreviewTimes } from "../src/lib/onboarding-preview-schedule";
import { DEFAULT_PERSONAL_SCHEDULING, type PersonalSchedulingRule } from "../src/lib/personal-scheduling";

// Onboarding's preview dates each Beat as the scheduler will, under the saved rules (JITM-09 §2.20, D73). The first
// follow-up is dated Saturday, Oct 10 in Chicago.
describe("onboarding preview times", () => {
  const when = (reason: string, rules: PersonalSchedulingRule) => {
    const steps = starterPlanForReason("Home services", reason)!.steps.map(step => ({ anchor: "CALENDAR_DAY" as const, offsetMinutes: null, plannedAt: null, dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes }));
    return onboardingPreviewTimes(steps, "2026-10-10", "America/Chicago", rules).map(at => beatWhen(at, "America/Chicago", "en-US"));
  };
  const estimate = "An estimate or quote", afterJob = "After the job";

  it("keeps each Beat's own day and time without saved rules", () => {
    expect(when(estimate, DEFAULT_PERSONAL_SCHEDULING)).toEqual(["Sat, Oct 10 · 10:00 AM", "Thu, Oct 15 · 11:00 AM"]);
    expect(when(afterJob, DEFAULT_PERSONAL_SCHEDULING)[0]).toBe("Sat, Oct 10 · 5:00 PM");
  });

  it("moves Beats by the saved weekend rule and quiet hours", () => {
    expect(when(estimate, { ...DEFAULT_PERSONAL_SCHEDULING, weekendScheduling: "NEXT_MONDAY" })).toEqual(["Mon, Oct 12 · 10:00 AM", "Thu, Oct 15 · 11:00 AM"]);
    expect(when(estimate, { ...DEFAULT_PERSONAL_SCHEDULING, quietHoursEnd: 11 * 60 })[0]).toBe("Sat, Oct 10 · 11:00 AM");
  });

  it("moves Beats into the saved working days and hours", () => {
    // Monday to Friday, 9 to 5: a Saturday text waits for Monday's opening.
    expect(when(estimate, { ...DEFAULT_PERSONAL_SCHEDULING, journeyPreferences: DEFAULT_JOURNEY_PREFERENCES })[0]).toBe("Mon, Oct 12 · 9:00 AM");
    // Every day, 9 to 5: the 5:00 PM thank-you goes at the next opening.
    expect(when(afterJob, { ...DEFAULT_PERSONAL_SCHEDULING, journeyPreferences: { ...DEFAULT_JOURNEY_PREFERENCES, workDays: [0, 1, 2, 3, 4, 5, 6] } })[0]).toBe("Sun, Oct 11 · 9:00 AM");
  });

  it("gives no times without a valid date or timezone", () => {
    const step = { anchor: "CALENDAR_DAY" as const, offsetMinutes: null, plannedAt: null, dayOffset: 0, sendTimeMinutes: 600 };
    expect(onboardingPreviewTimes([step], "", "America/Chicago", DEFAULT_PERSONAL_SCHEDULING)).toEqual([null]);
    expect(onboardingPreviewTimes([step], "2026-10-10", "Mars/Olympus", DEFAULT_PERSONAL_SCHEDULING)).toEqual([null]);
  });
});
