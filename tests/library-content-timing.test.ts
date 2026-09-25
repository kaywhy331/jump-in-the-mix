import { describe, expect, it } from "vitest";
import { EMPTY_LIBRARY_CONTENT, LibraryError, validateLibraryContent } from "../src/lib/library-content";

const content = (triggerMode: "MANUAL_START" | "DATE_TRIGGERED", dayOffset: number) => ({
  ...EMPTY_LIBRARY_CONTENT, title: "Check in", description: "A short check-in after a first conversation.", triggerMode,
  dateTypeName: triggerMode === "DATE_TRIGGERED" ? "Birthday" : null, dateTypeSlug: null,
  steps: [{ ...EMPTY_LIBRARY_CONTENT.steps[0], body: "Hi", dayOffset }]
});
const refusal = (value: unknown) => { try { validateLibraryContent(value); } catch (error) { return error instanceof LibraryError ? { message: error.message, field: error.field } : error; } return null; };

describe("staff library Beat timing follows the Mix editor", () => {
  it("keeps each Beat within a year of the start", () => {
    expect(refusal(content("DATE_TRIGGERED", 366))).toEqual({ message: "Beat 1 must be between -365 and 365 days.", field: "steps.0.dayOffset" });
    expect(refusal(content("DATE_TRIGGERED", -3650))).toEqual({ message: "Beat 1 must be between -365 and 365 days.", field: "steps.0.dayOffset" });
    expect(refusal(content("DATE_TRIGGERED", -365))).toBeNull();
  });

  it("refuses a Beat before the start of a Mix you start for someone", () => {
    expect(refusal(content("MANUAL_START", -1))).toEqual({ message: "Beat 1 is scheduled before its start date, which only a Mix that starts from a date can do.", field: "steps.0.dayOffset" });
    expect(refusal(content("MANUAL_START", 0))).toBeNull();
  });
});
