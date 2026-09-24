import { createHash } from "node:crypto";
import { z } from "zod";
import type { WorkflowConfiguration, WorkflowRule, WorkflowTarget } from "@/lib/mix-workflow-types";

// A portable Mix or Mega-Mix: the wording, timing and connections, without any account ids,
// people, schedules or history. Files, copies and the Marketplace all use this one shape.
export const PORTABLE_FORMAT = "jump-in-the-mix";
export const PORTABLE_VERSION = 1;
export const PORTABLE_LIMITS = { mixes: 60, steps: 40, rules: 400, bytes: 900_000 } as const;

const key = z.string().regex(/^[a-z0-9-]{1,40}$/);
const text = (maximum: number) => z.string().max(maximum).nullable();
const target = z.object({ mix: key, beat: key.nullable() }).strict();
const variant = z.object({ family: z.enum(["TEXT", "EMAIL", "CALL"]), subject: text(300), body: text(10_000), script: text(10_000) }).strict();
const step = z.object({
  key, name: z.string().trim().min(1).max(160), channel: z.enum(["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"]),
  dayOffset: z.number().int().min(-3650).max(3650), sendTimeMinutes: z.number().int().min(0).max(1439).nullable(),
  anchor: z.enum(["CALENDAR_DAY", "APPOINTMENT_START", "APPOINTMENT_END", "VISIT_COMPLETED"]), offsetMinutes: z.number().int().min(-525_600).max(525_600).nullable(),
  subject: text(300), body: text(10_000), script: text(10_000), longSms: z.boolean(), includeOptOut: z.boolean(),
  variants: z.array(variant).max(3)
}).strict();
const mix = z.object({
  key, name: z.string().trim().min(1).max(160), description: text(2000), category: text(160), industry: text(160), framework: text(160),
  triggerMode: z.enum(["MANUAL_START", "DATE_TRIGGERED"]), dateType: z.object({ name: z.string().trim().min(1).max(120), slug: z.string().trim().min(1).max(120) }).strict().nullable(),
  steps: z.array(step).min(1).max(PORTABLE_LIMITS.steps)
}).strict();
const route = z.object({
  key, label: z.string().trim().min(1).max(160), when: z.enum(["FINISHED", "OUTCOME", "TIMEOUT"]), outcome: z.string().trim().max(160),
  delayMinutes: z.number().int().min(0).max(525_600), target: target.nullable(), maxVisits: z.number().int().min(1).max(100).nullable(), replace: z.boolean()
}).strict();
const rule = z.object({
  key, name: z.string().trim().min(1).max(160), enabled: z.boolean(), mode: z.enum(["CHOICE", "PARALLEL"]), source: target,
  routes: z.array(route).min(1).max(50), join: z.object({ mode: z.enum(["ALL", "ANY"]), target, cancelRemaining: z.boolean() }).strict().nullable()
}).strict();
export const portableSchema = z.object({
  format: z.literal(PORTABLE_FORMAT), version: z.literal(PORTABLE_VERSION), kind: z.enum(["mix", "mega-mix"]),
  name: z.string().trim().min(1).max(80), description: text(2000), exportedAt: z.string().max(40).optional(),
  mixes: z.array(mix).min(1).max(PORTABLE_LIMITS.mixes), rules: z.array(rule).max(PORTABLE_LIMITS.rules),
  waitingBeats: z.array(z.object({ mix: key, beat: key }).strict()).max(2000), finishes: z.array(key).max(PORTABLE_LIMITS.mixes)
}).strict().superRefine((value, context) => {
  const mixes = new Map(value.mixes.map(item => [item.key, new Set(item.steps.map(beat => beat.key))]));
  if (mixes.size !== value.mixes.length) context.addIssue({ code: "custom", message: "Each Mix in the file needs its own key." });
  for (const item of value.mixes) if (new Set(item.steps.map(beat => beat.key)).size !== item.steps.length) context.addIssue({ code: "custom", message: `${item.name}: each Beat needs its own key.` });
  if (value.kind === "mix" && (value.mixes.length !== 1 || value.rules.length)) context.addIssue({ code: "custom", message: "A single-Mix file holds one Mix and no connections." });
  const exists = (point: { mix: string; beat: string | null }) => mixes.get(point.mix) && (!point.beat || mixes.get(point.mix)!.has(point.beat));
  for (const item of value.rules) for (const point of [item.source, ...item.routes.flatMap(entry => entry.target ? [entry.target] : []), ...item.join ? [item.join.target] : []]) if (!exists(point)) context.addIssue({ code: "custom", message: `${item.name}: a connection points to a Mix or Beat that is not in the file.` });
  for (const point of value.waitingBeats) if (!exists(point)) context.addIssue({ code: "custom", message: "A waiting Beat is not in the file." });
  for (const point of value.finishes) if (!mixes.has(point)) context.addIssue({ code: "custom", message: "A finish points to a Mix that is not in the file." });
});
export type PortablePackage = z.infer<typeof portableSchema>;
export type PortableMix = PortablePackage["mixes"][number];
export type PortableStep = PortableMix["steps"][number];

/** Read an uploaded file. Errors name the problem in plain words; nothing is saved. */
export function parsePortable(raw: string): PortablePackage {
  if (raw.length > PORTABLE_LIMITS.bytes) throw new Error("This file is too large to import.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("This is not a Jump in the Mix file. Export a Mix or Mega-Mix and choose that file."); }
  if (!value || typeof value !== "object" || (value as { format?: unknown }).format !== PORTABLE_FORMAT) throw new Error("This is not a Jump in the Mix file. Export a Mix or Mega-Mix and choose that file.");
  if ((value as { version?: unknown }).version !== PORTABLE_VERSION) throw new Error("This file was made by a newer version of Jump in the Mix and cannot be imported yet.");
  const parsed = portableSchema.safeParse(value);
  if (!parsed.success) throw new Error(`This file cannot be imported: ${parsed.error.issues[0]?.message ?? "it is incomplete"}.`);
  return parsed.data;
}

export type PortableSourceMix = {
  id: string; name: string; description: string | null; category: string | null; industry: string | null; framework: string | null;
  triggerMode: string; dateType: { name: string; slug: string } | null;
  steps: Array<{ id: string; name: string; channel: PortableStep["channel"]; dayOffset: number; sendTimeMinutes: number | null; anchor: PortableStep["anchor"]; offsetMinutes: number | null;
    subject: string | null; body: string | null; script: string | null; longSms: boolean; includeOptOut: boolean; variants: PortableStep["variants"] }>;
};

/**
 * Build a package from account Mixes. Connections are kept only when their source and every
 * destination are in the package; the count of the rest is returned so the owner can be told.
 */
export function buildPortable(input: { kind: PortablePackage["kind"]; name: string; description: string | null; mixes: PortableSourceMix[]; configuration: WorkflowConfiguration }) {
  const mixKeys = new Map(input.mixes.map((item, index) => [item.id, `m${index + 1}`]));
  const stepKeys = new Map(input.mixes.flatMap(item => item.steps.map((beat, index) => [beat.id, `b${index + 1}`] as const)));
  const point = (value: WorkflowTarget) => mixKeys.has(value.mixId) && (!value.stepId || stepKeys.has(value.stepId)) ? { mix: mixKeys.get(value.mixId)!, beat: value.stepId ? stepKeys.get(value.stepId)! : null } : null;
  let omitted = 0;
  const rules = input.kind === "mix" ? [] : input.configuration.rules.flatMap((item, index) => {
    const source = point(item.source);
    if (!source) return [];
    const routes = item.routes.flatMap((entry, position) => {
      const destination = entry.target ? point(entry.target) : null;
      if (entry.target && !destination) { omitted++; return []; }
      return [{ key: `r${index + 1}-${position + 1}`, label: entry.label, when: entry.when, outcome: entry.outcome, delayMinutes: entry.delayMinutes, target: destination, maxVisits: entry.maxVisits, replace: entry.replace }];
    });
    const join = item.join && point(item.join.target) ? { mode: item.join.mode, target: point(item.join.target)!, cancelRemaining: item.join.cancelRemaining } : null;
    if (item.join && !join) omitted++;
    return routes.length ? [{ key: `c${index + 1}`, name: item.name, enabled: item.enabled, mode: item.mode, source, routes, join }] : [];
  });
  const packaged: PortablePackage = {
    format: PORTABLE_FORMAT, version: PORTABLE_VERSION, kind: input.kind, name: input.name.slice(0, 80), description: input.description?.slice(0, 2000) ?? null,
    mixes: input.mixes.map(item => ({
      key: mixKeys.get(item.id)!, name: item.name, description: item.description, category: item.category, industry: item.industry, framework: item.framework,
      triggerMode: item.triggerMode === "DATE_TRIGGERED" ? "DATE_TRIGGERED" : "MANUAL_START", dateType: item.triggerMode === "DATE_TRIGGERED" ? item.dateType : null,
      steps: item.steps.map(beat => ({ key: stepKeys.get(beat.id)!, name: beat.name, channel: beat.channel, dayOffset: beat.dayOffset, sendTimeMinutes: beat.sendTimeMinutes, anchor: beat.anchor, offsetMinutes: beat.offsetMinutes,
        subject: beat.subject, body: beat.body, script: beat.script, longSms: beat.longSms, includeOptOut: beat.includeOptOut, variants: beat.variants }))
    })),
    rules,
    waitingBeats: input.kind === "mix" ? [] : input.configuration.gatedStepIds.flatMap(id => { const owner = input.mixes.find(item => item.steps.some(beat => beat.id === id)); return owner ? [{ mix: mixKeys.get(owner.id)!, beat: stepKeys.get(id)! }] : []; }),
    finishes: input.kind === "mix" ? [] : input.configuration.intentionalEnds.flatMap(value => value.startsWith("mix:") && mixKeys.has(value.slice(4)) ? [mixKeys.get(value.slice(4))!] : [])
  };
  return { package: packaged, omittedConnections: omitted };
}

/** Same content, same fingerprint: names, wording, timing and connections, not export time. */
export function portableFingerprint(value: PortablePackage): string {
  const { exportedAt: _exportedAt, name: _name, description: _description, ...content } = value;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 32);
}

/** Map a package onto new account ids. `ids` must hold an id for every Mix and Beat key. */
export function portableConfiguration(value: PortablePackage, ids: { mix: (key: string) => string; beat: (mix: string, beat: string) => string; fresh: () => string }): WorkflowConfiguration {
  const point = (entry: { mix: string; beat: string | null }): WorkflowTarget => ({ mixId: ids.mix(entry.mix), stepId: entry.beat ? ids.beat(entry.mix, entry.beat) : null });
  const rules: WorkflowRule[] = value.rules.map(item => ({
    id: ids.fresh(), name: item.name, enabled: item.enabled, mode: item.mode, source: point(item.source),
    routes: item.routes.map(entry => ({ id: ids.fresh(), label: entry.label, when: entry.when, outcome: entry.outcome, delayMinutes: entry.delayMinutes, target: entry.target ? point(entry.target) : null, maxVisits: entry.maxVisits, replace: entry.replace })),
    join: item.join ? { mode: item.join.mode, target: point(item.join.target), cancelRemaining: item.join.cancelRemaining } : null
  }));
  return { rules, gatedStepIds: value.waitingBeats.map(entry => ids.beat(entry.mix, entry.beat)), intentionalEnds: value.finishes.map(entry => `mix:${ids.mix(entry)}`) };
}

export function portableSummary(value: PortablePackage) {
  return { mixes: value.mixes.length, beats: value.mixes.reduce((sum, item) => sum + item.steps.length, 0), connections: value.rules.reduce((sum, item) => sum + item.routes.length, 0) };
}

export const portableFileName = (value: Pick<PortablePackage, "name" | "kind">) => `${value.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || value.kind}.${value.kind === "mix" ? "mix" : "megamix"}.json`;
