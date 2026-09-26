import { describe, expect, it } from "vitest";
import { buildPortable, parsePortable, portableContentIssues, PORTABLE_FORMAT, PORTABLE_VERSION, type PortablePackage, type PortableSourceMix, type PortableStep } from "@/lib/mix-portable";
import { MEGA_MIXES, megaMixConfiguration, type MegaMix } from "@/lib/mega-mixes";
import { DEFAULT_JOURNEY_PREFERENCES, tailorMegaMix, type JourneySetupValues } from "@/lib/journey-preferences";
import { READY_MADE_PLANS, starterPlanForBusinessType, starterPlanForMarketingScenario, starterPlanForOnboarding, type ReadyMadePlan } from "@/lib/vertical-plan-library";
import { normalizeSharedMixSteps } from "@/lib/shared-mix";
import { PERSONAS } from "@/lib/persona-mixes";
import { BUSINESS_TYPES } from "@/lib/business-taxonomy";

const NO_CONNECTIONS = { rules: [], gatedStepIds: [], intentionalEnds: [] };
type Step = Partial<PortableStep>;
const beat = (key: string, step: Step = {}): PortableStep => ({ key, name: `Beat ${key}`, channel: "SMS", dayOffset: 0, sendTimeMinutes: null, anchor: "CALENDAR_DAY", offsetMinutes: null,
  subject: null, body: "Hi {{First Name}}, checking in. {{SMS Signature}}", script: null, longSms: false, includeOptOut: false, variants: [], ...step });
const file = (steps: PortableStep[], mix: Partial<PortablePackage["mixes"][number]> = {}): PortablePackage => ({
  format: PORTABLE_FORMAT, version: PORTABLE_VERSION, kind: "mix", name: "Estimate follow-up", description: null,
  mixes: [{ key: "m1", name: "Estimate follow-up", description: null, category: null, industry: null, framework: null, triggerMode: "MANUAL_START", dateType: null, steps, ...mix }],
  rules: [], waitingBeats: [], finishes: []
});
const read = (value: PortablePackage) => parsePortable(JSON.stringify(value));
const refusal = (value: PortablePackage) => { try { read(value); } catch (error) { return (error as Error).message; } return null; };
const onDate = { triggerMode: "DATE_TRIGGERED" as const, dateType: { name: "Birthday", slug: "birthday" } };

// What the app itself stores for a Beat it did not write in the editor: calendar timing, no versions.
const stored = (id: string, step: { name: string; channel: PortableStep["channel"]; dayOffset: number; sendTimeMinutes: number | null; subject?: string | null; body?: string | null; script?: string | null; longSms?: boolean; includeOptOut?: boolean }): PortableSourceMix["steps"][number] => ({
  id, name: step.name, channel: step.channel, dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes, anchor: "CALENDAR_DAY", offsetMinutes: null,
  subject: step.subject ?? null, body: step.body ?? null, script: step.script ?? null, longSms: step.longSms ?? false, includeOptOut: step.includeOptOut ?? false, variants: []
});

/** A ready-made Mega-Mix exactly as installMegaMix stores it and exportMegaMixPipeline reads it back. */
function installedMegaMix(blueprint: MegaMix): PortablePackage {
  const ids = Object.fromEntries(blueprint.nodes.map(node => [node.key, `mix-${node.key}`]));
  return buildPortable({ kind: "mega-mix", name: blueprint.name, description: blueprint.description, configuration: megaMixConfiguration(blueprint, ids, blueprint.id),
    mixes: blueprint.nodes.map(node => ({ id: ids[node.key], name: node.name, description: node.purpose, category: "Customer journey", industry: blueprint.industry, framework: "Mega-mix", triggerMode: "MANUAL_START", dateType: null,
      steps: node.steps.map((step, index) => stored(`${node.key}-${index}`, step)) })) }).package;
}

/**
 * A ready-made Mix as the app stores it: the template setup normalizes the steps and starts the Mix the way
 * its plan says; a starter Mix (ensureStarterMix) keeps the steps as written and always starts from the
 * Follow-up date. Both name each Beat after the Mix.
 */
function installedPlan(plan: ReadyMadePlan, via: "library" | "starter"): PortablePackage {
  const steps = via === "library" ? normalizeSharedMixSteps(plan.steps) : plan.steps;
  const triggerMode = via === "starter" ? "DATE_TRIGGERED" : plan.triggerMode;
  return buildPortable({ kind: "mix", name: plan.title.slice(0, 80), description: plan.description, configuration: NO_CONNECTIONS,
    mixes: [{ id: plan.id, name: plan.title, description: plan.description, category: plan.category, industry: plan.industry, framework: plan.framework, triggerMode,
      dateType: triggerMode === "DATE_TRIGGERED" ? via === "starter" ? { name: "Follow-up", slug: "follow-up" } : { name: plan.dateTypeName ?? "Follow-up", slug: plan.dateTypeSlug ?? "follow-up" } : null,
      steps: steps.map((step, index) => stored(`${plan.id}-${index}`, { ...step, name: `${plan.title} — ${step.name}` })) }] }).package;
}

describe("portable files follow the Mix editor's rules", () => {
  it("accepts every timing the editor saves: calendar days before a date, appointment minutes on a manual start, completion, and a version in each other family", () => {
    const value = file([
      beat("b1", { anchor: "APPOINTMENT_START", offsetMinutes: -43_200, dayOffset: 0 }),
      beat("b2", { anchor: "APPOINTMENT_END", offsetMinutes: 30, channel: "EMAIL", subject: "After your visit", body: "Hi {{First Name}}, thanks for today. {{Email Signature}}", variants: [
        { family: "TEXT", subject: null, body: "Hi {{First Name}}, thanks for today. {{SMS Signature}}", script: null },
        { family: "CALL", subject: null, body: null, script: "Ask how it went. {{Private Notes}}" }] }),
      beat("b3", { anchor: "VISIT_COMPLETED", offsetMinutes: 0, channel: "PHONE_CALL", body: null, script: "Call back. {{Private Notes}}", variants: [
        { family: "TEXT", subject: null, body: "Hi {{First Name}}, how did it go?", script: null },
        { family: "EMAIL", subject: "How did it go?", body: "Hi {{First Name}}, how did it go?", script: null }] }),
      beat("b4", { anchor: "VISIT_COMPLETED", offsetMinutes: 1_440, channel: "VOICEMAIL", body: null, script: "Leave a short note." }),
      beat("b5", { dayOffset: 365, sendTimeMinutes: 600, variants: [{ family: "EMAIL", subject: "A year on", body: "Hi {{First Name}}", script: null }] })
    ]);
    expect(portableContentIssues(value)).toEqual([]);
    expect(read(value)).toEqual(value);
    const dated = file([beat("b1", { dayOffset: -365 }), beat("b2", { dayOffset: -7, sendTimeMinutes: 540 }), beat("b3", { dayOffset: 0 })], onDate);
    expect(read(dated).mixes[0].steps.map(step => step.dayOffset)).toEqual([-365, -7, 0]);
  });

  it("allows fifty Beats in a Mix, as the editor does", () => {
    expect(read(file(Array.from({ length: 50 }, (_, index) => beat(`b${index + 1}`, { dayOffset: index })))).mixes[0].steps).toHaveLength(50);
  });

  it.each([
    ["a day offset past a year", file([beat("b1", { dayOffset: 366 })], onDate), "Beat 1 of Estimate follow-up must be between -365 and 365 days."],
    ["a manual start scheduled before its start", file([beat("b1"), beat("b2", { dayOffset: -1 })]), "Beat 2 of Estimate follow-up is scheduled before its start date, which only a Mix that starts from a date can do."],
    ["a date start with no date, added as a manual start", file([beat("b1", { dayOffset: -3 })], { triggerMode: "DATE_TRIGGERED", dateType: null }), "Beat 1 of Estimate follow-up is scheduled before its start date"],
    ["appointment timing on a date start", file([beat("b1", { anchor: "APPOINTMENT_START", offsetMinutes: -60 })], onDate), "Beat 1 of Estimate follow-up is timed from an appointment, which only a Mix you start for someone can do."],
    ["appointment timing without minutes", file([beat("b1", { anchor: "APPOINTMENT_END", offsetMinutes: null })]), "Beat 1 of Estimate follow-up needs a whole number of minutes."],
    ["appointment timing past thirty days", file([beat("b1", { anchor: "APPOINTMENT_START", offsetMinutes: 43_201 })]), "Beat 1 of Estimate follow-up must stay within 30 days of the appointment."],
    ["a completion Beat before the completion", file([beat("b1", { anchor: "VISIT_COMPLETED", offsetMinutes: -5 })]), "Beat 1 of Estimate follow-up can only follow the moment the visit is marked completed."],
    ["an email without a subject", file([beat("b1", { channel: "EMAIL", subject: " ", body: "Hi" })]), "Beat 1 of Estimate follow-up is an email and needs a subject and a message."],
    ["a text without a message", file([beat("b1", { channel: "WHATSAPP", body: "  " })]), "Beat 1 of Estimate follow-up needs a message."],
    ["a call without notes", file([beat("b1", { channel: "PHONE_CALL", body: "Call them", script: null })]), "Beat 1 of Estimate follow-up needs call or voicemail notes."],
    ["an unknown merge field", file([beat("b1", { body: "Hi {{Favourite Colour}}" })]), "Beat 1 of Estimate follow-up uses unsupported placeholders: {{Favourite Colour}}."],
    ["private notes in an email", file([beat("b1", { channel: "EMAIL", subject: "Notes", body: "{{Private Notes}}" })]), "Beat 1 of Estimate follow-up uses private notes, which only a phone-call Beat or a call version may show."],
    ["private notes in a voicemail", file([beat("b1", { channel: "VOICEMAIL", body: null, script: "Mention {{Private Notes}}" })]), "Beat 1 of Estimate follow-up uses private notes"],
    ["a version of the Beat's own kind", file([beat("b1", { variants: [{ family: "TEXT", subject: null, body: "Another text", script: null }] })]), "Beat 1 of Estimate follow-up already uses text wording, so it cannot also have a text version."],
    ["two versions of one kind", file([beat("b1", { variants: [{ family: "CALL", subject: null, body: null, script: "Ask" }, { family: "CALL", subject: null, body: null, script: "Ask again" }] })]), "Beat 1 of Estimate follow-up has more than one call version."],
    ["a version with no wording", file([beat("b1", { variants: [{ family: "CALL", subject: null, body: "Wrong field", script: null }] })]), "Beat 1 of Estimate follow-up’s call version has no wording."],
    ["an email version without a subject", file([beat("b1", { variants: [{ family: "EMAIL", subject: null, body: "Hello", script: null }] })]), "Beat 1 of Estimate follow-up’s email version needs a subject."],
    ["private notes in a text version", file([beat("b1", { channel: "PHONE_CALL", body: null, script: "Ask", variants: [{ family: "TEXT", subject: null, body: "{{Private Notes}}", script: null }] })]), "Beat 1 of Estimate follow-up’s text version uses private notes"],
    ["an unknown merge field in a version", file([beat("b1", { variants: [{ family: "EMAIL", subject: "Hi {{Nickname}}", body: "Hello", script: null }] })]), "Beat 1 of Estimate follow-up’s email version uses unsupported placeholders: {{Nickname}}."]
  ])("refuses %s with a plain message", (_label, value, message) => {
    expect(refusal(value)).toContain(`This file cannot be imported: ${message.replace(/\.$/, "")}`);
    expect(portableContentIssues(value).join(" ")).toContain(message.replace(/\.$/, ""));
  });

  it("names every problem, not only the first", () => {
    const value = file([beat("b1", { dayOffset: -2 }), beat("b2", { channel: "EMAIL", subject: null, body: "{{Private Notes}}" })]);
    expect(portableContentIssues(value)).toHaveLength(3);
  });
});

describe("everything the app exports today imports again", () => {
  const setups: Array<JourneySetupValues["preferences"]> = (["RECOMMENDED", "SMS", "EMAIL", "PHONE_CALL"] as const).flatMap(communication => (["RECOMMENDED", "RELAXED"] as const).map(pace => ({ ...DEFAULT_JOURNEY_PREFERENCES, communication, pace })));
  const setup = (preferences: JourneySetupValues["preferences"]): JourneySetupValues => ({ preferences, timezone: "UTC", defaultFollowUpMinutes: 600, quietHoursStart: 1200, quietHoursEnd: 480, appointmentBufferMinutes: 15 });

  it.each(MEGA_MIXES.map(blueprint => [blueprint.name, blueprint] as const))("the %s ready-made Mega-Mix, as installed with every setup choice", (_name, blueprint) => {
    for (const preferences of [null, ...setups]) {
      const value = installedMegaMix(preferences ? tailorMegaMix(blueprint, setup(preferences)) : blueprint);
      expect(portableContentIssues(value), `${blueprint.id} ${preferences?.communication ?? "as shipped"} ${preferences?.pace ?? ""}`).toEqual([]);
      expect(() => read(value)).not.toThrow();
    }
  });

  it("every ready-made Mix in the library, as a person sets it up", () => {
    const exportable = READY_MADE_PLANS.filter(plan => plan.triggerMode !== "BROADCAST");
    expect(exportable.length).toBeGreaterThan(20);
    for (const plan of exportable) {
      const value = installedPlan(plan, "library");
      expect(portableContentIssues(value), plan.id).toEqual([]);
      expect(() => read(value), plan.id).not.toThrow();
    }
  });

  it("every starter Mix onboarding and the marketing pages can create", () => {
    const reasons = ["Check in with a friend", "Reconnect personally", "Follow up after an introduction", "Explore a partnership", "Follow up about an estimate", "Follow up on a quote", "Follow up on an inquiry", "Reconnect with a lead",
      "Reconnect with someone", "Check in after the job", "Ask for a review", "Reconnect", "General follow-up", "Something else"];
    const scenarios = ["real-estate", "consulting", "photography", "painting", "recruiting", ...PERSONAS.flatMap(persona => persona.mixes.map(mix => `${persona.id}~${mix.id}`))];
    const plans = [
      ...[null, ...BUSINESS_TYPES].map(type => starterPlanForBusinessType(type)),
      ...[null, ...BUSINESS_TYPES].flatMap(type => reasons.map(reason => starterPlanForOnboarding(type, reason))),
      ...scenarios.flatMap(id => { const plan = starterPlanForMarketingScenario(id); return plan ? [plan] : []; })
    ];
    expect(plans.length).toBeGreaterThan(reasons.length);
    for (const plan of plans) {
      const value = installedPlan(plan, "starter");
      expect(portableContentIssues(value), plan.id).toEqual([]);
      expect(() => read(value), plan.id).not.toThrow();
    }
  });
});
