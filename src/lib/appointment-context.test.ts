import { describe, expect, it } from "vitest";
import { appointmentTokenValues, normalizeAppointmentLink } from "./appointment-context";

describe("appointment tokens", () => {
  const appointment = { title: "Kitchen estimate", startsAt: new Date("2026-09-16T21:30:00.000Z"), timezone: "America/Los_Angeles", location: "12 Elm St", link: "https://meet.example.test/abc", details: "Bring the tile samples" };

  it("formats the date and time in the appointment's own timezone", () => {
    const values = appointmentTokenValues(appointment);
    expect(values["{{Appointment Date}}"]).toBe("Wednesday, September 16");
    expect(values["{{Appointment Time}}"]).toBe("2:30 PM");
    expect(values["{{appointment.title}}"]).toBe("Kitchen estimate");
    expect(values["{{appointment.location}}"]).toBe("12 Elm St");
    expect(values["{{Appointment Link}}"]).toBe("https://meet.example.test/abc");
    expect(values["{{appointment.details}}"]).toBe("Bring the tile samples");
  });

  it("renders every token empty without an appointment and falls back to UTC for a broken timezone", () => {
    expect(Object.values(appointmentTokenValues(null)).every((value) => value === "")).toBe(true);
    expect(appointmentTokenValues({ ...appointment, timezone: "Nowhere/Invalid" })["{{Appointment Time}}"]).toBe("9:30 PM");
  });

  it("accepts only full https links and never rewrites them", () => {
    expect(normalizeAppointmentLink("  https://meet.example.test/abc?x=1 ")).toBe("https://meet.example.test/abc?x=1");
    expect(normalizeAppointmentLink("")).toBeNull();
    expect(() => normalizeAppointmentLink("meet.example.test/abc")).toThrow(/https/);
    expect(() => normalizeAppointmentLink("http://meet.example.test/abc")).toThrow(/https/);
    expect(() => normalizeAppointmentLink(`https://x.test/${"a".repeat(500)}`)).toThrow(/500/);
  });
});
