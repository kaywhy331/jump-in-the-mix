import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ context: {} }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => session.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { prisma } from "@/lib/prisma";
import { installMegaMix } from "@/lib/mega-mix-service";
import { MEGA_MIXES } from "@/lib/mega-mixes";
import { readWorkflowDefinition } from "@/lib/mix-workflow";
import { numberJourney } from "@/lib/journey-numbering";
import { DEFAULT_JOURNEY_PREFERENCES, type JourneySetupValues } from "@/lib/journey-preferences";
import { parsePortable, portableContentIssues, portableFingerprint, type PortablePackage } from "@/lib/mix-portable";
import { saveMixAction } from "@/lib/mix-editor-actions";
import { addFromMarketplace, readMarketplaceItem, shareOnMarketplace } from "@/lib/marketplace-service";
import { createMegaMixPipeline, deleteMegaMixPipeline, duplicateMegaMixPipeline, exportMegaMixPipeline, exportSingleMix, importPortable, updateMegaMixPipeline } from "@/lib/mega-mix-pipeline-service";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("named Mega-Mixes, export and import", () => {
  let userId: string, workspaceId: string, otherUserId: string, otherWorkspaceId: string;
  const fixture = async (label: string) => {
    const user = await prisma.user.create({ data: { name: label, email: `${label}-${randomUUID()}@example.invalid` } });
    const workspace = await prisma.workspace.create({ data: { ownerId: user.id, name: label, slug: randomUUID() } });
    return [user.id, workspace.id] as const;
  };
  beforeEach(async () => { [userId, workspaceId] = await fixture("pipeline-owner"); [otherUserId, otherWorkspaceId] = await fixture("pipeline-other"); });
  afterEach(async () => { await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } }); await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } }); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("names each ready-made install and numbers a repeat name", async () => {
    await createMegaMixPipeline({ workspaceId, actorUserId: userId, name: "Contractor", mixIds: [] });
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    const pipeline = await prisma.megaMixPipeline.findUniqueOrThrow({ where: { id: installed.id }, include: { members: true } });
    expect(pipeline).toMatchObject({ name: "Contractor 2", origin: "BLUEPRINT:contractor" });
    expect(pipeline.members).toHaveLength(MEGA_MIXES[0].nodes.length);
  });

  it("exports a Mega-Mix and imports it into another account as an identical, independent journey", async () => {
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    const exported = await exportMegaMixPipeline(prisma, workspaceId, installed.id);
    expect(exported.omittedConnections).toBe(0);
    // The file round-trips through its own reader.
    const value = parsePortable(JSON.stringify(exported.package));
    const result = await importPortable({ workspaceId: otherWorkspaceId, actorUserId: otherUserId, value, name: "Our contractor pipeline", origin: "FILE", source: "test" });
    const [source, copy] = await Promise.all([readWorkflowDefinition(prisma, workspaceId), readWorkflowDefinition(prisma, otherWorkspaceId)]);
    const shape = (definition: typeof source) => { const numbers = numberJourney(definition.mixes, definition).beats; return definition.mixes.map(mix => ({ name: mix.name, beats: mix.steps.map(step => `${numbers[step.id]}:${step.name}:${step.channel}:${step.dayOffset}:${step.body}`) })).sort((a, b) => a.name.localeCompare(b.name)); };
    expect(shape(copy)).toEqual(shape(source));
    expect(copy.rules).toHaveLength(source.rules.length);
    expect(copy.rules.flatMap(rule => rule.routes.map(route => route.id)).some(id => source.rules.some(rule => rule.routes.some(route => route.id === id)))).toBe(false);
    expect(await prisma.megaMixPipeline.findUniqueOrThrow({ where: { id: result.pipelineId! } })).toMatchObject({ name: "Our contractor pipeline", origin: "FILE", originFingerprint: portableFingerprint(value) });
    expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId: otherWorkspaceId } })).toBe(0);
    expect(await prisma.mixAssignment.count({ where: { workspaceId: otherWorkspaceId } })).toBe(0);
    // Editing the copy never changes the source.
    await prisma.mix.updateMany({ where: { workspaceId: otherWorkspaceId }, data: { name: "Changed" } });
    expect((await readWorkflowDefinition(prisma, workspaceId)).mixes.every(mix => mix.name !== "Changed")).toBe(true);
  });

  it("keeps channel versions and appointment timing through a single-Mix file", async () => {
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    const member = await prisma.megaMixPipelineMix.findFirstOrThrow({ where: { pipelineId: installed.id }, orderBy: { position: "asc" }, include: { mix: { include: { steps: { orderBy: { sortOrder: "asc" } } } } } });
    const step = member.mix.steps[0];
    await prisma.stepVersionVariant.create({ data: { stepVersionId: step.stepVersionId, family: "EMAIL", subject: "Your project", body: "Email wording" } });
    await prisma.mixStep.update({ where: { id: step.id }, data: { anchor: "APPOINTMENT_START", offsetMinutes: -60 } });
    const exported = await exportSingleMix(prisma, workspaceId, member.mixId);
    const result = await importPortable({ workspaceId: otherWorkspaceId, actorUserId: otherUserId, value: parsePortable(JSON.stringify(exported.package)), name: "Imported inquiry", origin: "FILE", source: "test" });
    expect(result.pipelineId).toBeNull();
    const mix = await prisma.mix.findUniqueOrThrow({ where: { id: result.mixIds[0] }, include: { steps: { orderBy: { sortOrder: "asc" }, include: { stepVersion: { include: { variants: true } } } } } });
    expect(mix.name).toBe("Imported inquiry");
    expect(mix.steps[0]).toMatchObject({ anchor: "APPOINTMENT_START", offsetMinutes: -60 });
    expect(mix.steps[0].stepVersion.variants).toEqual([expect.objectContaining({ family: "EMAIL", subject: "Your project", body: "Email wording" })]);
  });

  it("drops connections that leave the Mega-Mix and reports how many", async () => {
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    const members = await prisma.megaMixPipelineMix.findMany({ where: { pipelineId: installed.id }, orderBy: { position: "asc" } });
    await updateMegaMixPipeline({ workspaceId, actorUserId: userId, pipelineId: installed.id, name: "Front half", mixIds: members.slice(0, 3).map(member => member.mixId) });
    const exported = await exportMegaMixPipeline(prisma, workspaceId, installed.id);
    expect(exported.package.mixes).toHaveLength(3);
    expect(exported.omittedConnections).toBeGreaterThan(0);
    await expect(importPortable({ workspaceId: otherWorkspaceId, actorUserId: otherUserId, value: exported.package, name: "Front half", origin: "FILE", source: "test" })).resolves.toBeTruthy();
  });

  it("duplicates under a new name, refuses a taken name, and moves a Mix between Mega-Mixes", async () => {
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    await expect(duplicateMegaMixPipeline({ workspaceId, actorUserId: userId, pipelineId: installed.id, name: "contractor" })).rejects.toThrow(/already have a Mega-Mix/);
    const copy = await duplicateMegaMixPipeline({ workspaceId, actorUserId: userId, pipelineId: installed.id, name: "Contractor — summer" });
    expect(copy.mixIds).toHaveLength(MEGA_MIXES[0].nodes.length);
    const definition = await readWorkflowDefinition(prisma, workspaceId);
    expect(definition.rules).toHaveLength(MEGA_MIXES[0].nodes.length * 2);
    const moved = copy.mixIds[0];
    const other = await createMegaMixPipeline({ workspaceId, actorUserId: userId, name: "Leads only", mixIds: [moved] });
    expect(await prisma.megaMixPipelineMix.findUniqueOrThrow({ where: { mixId: moved } })).toMatchObject({ pipelineId: other.id });
    await expect(createMegaMixPipeline({ workspaceId, actorUserId: userId, name: "Stolen", mixIds: [(await prisma.mix.create({ data: { workspaceId: otherWorkspaceId, name: "Theirs", triggerMode: "MANUAL_START" } })).id] })).rejects.toThrow(/this account/);
  });

  it("removing a Mega-Mix keeps its Mixes and allows the ready-made one to be added again", async () => {
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    await deleteMegaMixPipeline({ workspaceId, actorUserId: userId, pipelineId: installed.id });
    expect(await prisma.mix.count({ where: { workspaceId } })).toBe(MEGA_MIXES[0].nodes.length);
    const again = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    expect(again.repeated).toBe(false);
    await expect(createMegaMixPipeline({ workspaceId, actorUserId: otherUserId, name: "Not mine", mixIds: [] })).rejects.toThrow(/unavailable/);
  });

  it("binds imported date-based Mixes to the account's existing date types instead of making duplicates", async () => {
    // The system Birthday type is shipped data; make sure this database has it, as the app installer does.
    await prisma.dateType.createMany({ data: [{ id: "system_birthday", scopeKey: "system", name: "Birthday", slug: "birthday", isSystem: true, isActive: true }], skipDuplicates: true });
    const birthday = await prisma.dateType.findUniqueOrThrow({ where: { scopeKey_slug: { scopeKey: "system", slug: "birthday" } } });
    const dateMix = (owner: string, name: string, dateTypeId: string) => prisma.mix.create({ data: { workspaceId: owner, name, triggerMode: "DATE_TRIGGERED", dateTypeId, status: "ACTIVE",
      steps: { create: { dayOffset: 0, sortOrder: 1, stepVersion: { create: { version: 1, body: `${name} {{First Name}}`, stepTemplate: { create: { workspaceId: owner, name: `${name} text`, channel: "SMS", isActive: false } } } } } } } });
    const travel = async (mixId: string, to: { workspaceId: string; userId: string }, name: string) => {
      const exported = await exportSingleMix(prisma, workspaceId, mixId);
      const result = await importPortable({ workspaceId: to.workspaceId, actorUserId: to.userId, value: parsePortable(JSON.stringify(exported.package)), name, origin: "FILE", source: "test" });
      return { exported: exported.package, mix: await prisma.mix.findUniqueOrThrow({ where: { id: result.mixIds[0] } }) };
    };
    const other = { workspaceId: otherWorkspaceId, userId: otherUserId };
    const before = await prisma.dateType.count();

    // A Mix on the system Birthday type lands on the same system type in the other account.
    const note = await dateMix(workspaceId, "Birthday note", birthday.id);
    const imported = await travel(note.id, other, "Birthday note");
    expect(imported.exported.mixes[0].dateType).toEqual({ name: "Birthday", slug: "birthday" });
    expect(imported.mix).toMatchObject({ triggerMode: "DATE_TRIGGERED", dateTypeId: birthday.id });
    expect(await prisma.dateType.count()).toBe(before);

    // A custom type is matched by name, case-insensitively, when the exported slug is another account's.
    const theirs = await prisma.dateType.create({ data: { workspaceId: otherWorkspaceId, scopeKey: otherWorkspaceId, name: "Policy renewal", slug: "policy-renewal-k3j9x2" } });
    const mine = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Policy Renewal", slug: "policy-renewal-zz71pq" } });
    const renewal = await dateMix(workspaceId, "Renewal reminder", mine.id);
    expect((await travel(renewal.id, other, "Renewal reminder")).mix.dateTypeId).toBe(theirs.id);
    // A copy inside the same account keeps the exact type.
    expect((await travel(renewal.id, { workspaceId, userId }, "Renewal copy")).mix.dateTypeId).toBe(mine.id);
    expect(await prisma.dateType.count()).toBe(before + 2);

    // Only a type the account has never seen is created, once, with a fresh slug.
    const boiler = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Boiler service", slug: "boiler-service-a1b2c3" } });
    const service = await dateMix(workspaceId, "Boiler service reminder", boiler.id);
    const first = await travel(service.id, other, "Boiler service reminder");
    const created = await prisma.dateType.findUniqueOrThrow({ where: { id: first.mix.dateTypeId! } });
    expect(created).toMatchObject({ workspaceId: otherWorkspaceId, name: "Boiler service", isSystem: false, isActive: true });
    expect(created.slug).toMatch(/^boiler-service-[a-z0-9]{6}$/);
    expect((await travel(service.id, other, "Boiler service again")).mix.dateTypeId).toBe(created.id);
    expect(await prisma.dateType.count()).toBe(before + 4);
  });

  it("rejects files that are not Jump in the Mix packages or point outside themselves", () => {
    expect(() => parsePortable("not json")).toThrow(/not a Jump in the Mix file/);
    expect(() => parsePortable(JSON.stringify({ format: "jump-in-the-mix", version: 9 }))).toThrow(/newer version/);
    const broken = { format: "jump-in-the-mix", version: 1, kind: "mega-mix", name: "Broken", description: null, mixes: [{ key: "m1", name: "One", description: null, category: null, industry: null, framework: null, triggerMode: "MANUAL_START", dateType: null, steps: [{ key: "b1", name: "Hi", channel: "SMS", dayOffset: 0, sendTimeMinutes: null, anchor: "CALENDAR_DAY", offsetMinutes: null, subject: null, body: "Hi", script: null, longSms: false, includeOptOut: false, variants: [] }] }],
      rules: [{ key: "c1", name: "Next", enabled: true, mode: "PARALLEL", source: { mix: "m1", beat: null }, routes: [{ key: "r1", label: "Go", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mix: "m9", beat: null }, maxVisits: null, replace: false }], join: null }],
      waitingBeats: [], finishes: [] };
    expect(() => parsePortable(JSON.stringify(broken))).toThrow(/not in the file/);
  });

  it("a Mix the editor saves with every kind of timing and version exports, imports, copies and is added from the Marketplace unchanged", async () => {
    await prisma.dateType.createMany({ data: [{ id: "system_birthday", scopeKey: "system", name: "Birthday", slug: "birthday", isSystem: true, isActive: true }], skipDuplicates: true });
    const birthday = await prisma.dateType.findUniqueOrThrow({ where: { scopeKey_slug: { scopeKey: "system", slug: "birthday" } } });
    const [user, workspace] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: userId } }), prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })]);
    session.context = { user, workspace, impersonation: null };
    type Beat = { channel: string; dayOffset: number; sendTime?: number; anchor?: string; minutes?: string; subject?: string; body?: string; script?: string; text?: string; emailSubject?: string; email?: string; call?: string };
    // Posted exactly as MixEditor posts a new Mix: one timing entry per Beat, in order, and every version field.
    const save = async (name: string, triggerMode: "DATE_TRIGGERED" | "MANUAL_START", beats: Beat[]) => {
      const data = new FormData();
      for (const [key, value] of Object.entries({ name, status: "DRAFT", triggerMode, dateTypeId: triggerMode === "DATE_TRIGGERED" ? birthday.id : "", workflowRevision: "0" })) data.set(key, value);
      for (const [index, beat] of beats.entries()) {
        for (const [key, value] of Object.entries({ mixStepId: "", dayOffset: String(beat.dayOffset), sendTimeMinutes: beat.sendTime === undefined ? "" : String(beat.sendTime), plannedAt: "", anchor: beat.anchor ?? "CALENDAR_DAY", offsetMinutes: beat.minutes ?? "" })) data.append(key, value);
        for (const [key, value] of Object.entries({ [`inlineName-${index}`]: `${name} ${index + 1}`, [`inlineChannel-${index}`]: beat.channel, [`inlineSubject-${index}`]: beat.subject ?? "", [`inlineBody-${index}`]: beat.body ?? "", [`inlineScript-${index}`]: beat.script ?? "",
          [`variantTextBody-${index}`]: beat.text ?? "", [`variantEmailSubject-${index}`]: beat.emailSubject ?? "", [`variantEmailBody-${index}`]: beat.email ?? "", [`variantCallScript-${index}`]: beat.call ?? "" })) data.set(key, value);
      }
      await expect(saveMixAction(data)).rejects.toThrow(/redirect:\/mixes\/[^/]+\/edit\?created=manual/);
      return prisma.mix.findFirstOrThrow({ where: { workspaceId, name } });
    };
    const dated = await save("Birthday run-up", "DATE_TRIGGERED", [
      { channel: "SMS", dayOffset: -365, body: "Hi {{First Name}}, a year to go! {{SMS Signature}}" },
      { channel: "EMAIL", dayOffset: -7, sendTime: 540, subject: "Next week", body: "Hi {{First Name}},\n\nYour day is next week.\n\n{{Email Signature}}", text: "Hi {{First Name}}, next week! {{SMS Signature}}", call: "Wish them well. {{Private Notes}}" },
      { channel: "PHONE_CALL", dayOffset: 0, sendTime: 600, script: "Call to say happy birthday. {{Private Notes}}", text: "Happy birthday, {{First Name}}!", emailSubject: "Happy birthday", email: "Hi {{First Name}}, happy birthday!" },
      { channel: "WHATSAPP", dayOffset: 3, body: "Hope it was a great day, {{First Name}}.", emailSubject: "Hope it was great", email: "Hi {{First Name}}, hope it was a great day.", call: "Ask how the day went." },
      { channel: "VOICEMAIL", dayOffset: 365, script: "Leave a short birthday note." }
    ]);
    const visit = await save("Visit follow-through", "MANUAL_START", [
      { channel: "SMS", dayOffset: 0, anchor: "APPOINTMENT_START", minutes: "-43200", body: "Hi {{First Name}}, your visit is booked. {{SMS Signature}}" },
      { channel: "SMS", dayOffset: 0, anchor: "APPOINTMENT_START", minutes: "-90", body: "Hi {{First Name}}, on my way. {{SMS Signature}}", call: "Confirm access. {{Private Notes}}" },
      { channel: "EMAIL", dayOffset: 0, anchor: "APPOINTMENT_END", minutes: "30", subject: "Thanks for today", body: "Hi {{First Name}},\n\nThanks for having me.\n\n{{Email Signature}}", text: "Thanks for today, {{First Name}}." },
      { channel: "PHONE_CALL", dayOffset: 0, anchor: "VISIT_COMPLETED", minutes: "0", script: "Record the outcome. {{Private Notes}}" },
      { channel: "SMS", dayOffset: 0, anchor: "VISIT_COMPLETED", minutes: "1440", body: "Hi {{First Name}}, how is everything? {{SMS Signature}}" },
      { channel: "PHONE_CALL", dayOffset: 2, sendTime: 660, script: "Check in two days later." }
    ]);
    const shape = async (mixIds: string[]) => (await prisma.mix.findMany({ where: { id: { in: mixIds } }, orderBy: { name: "asc" }, include: { dateType: { select: { slug: true } },
      steps: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { stepVersion: { include: { stepTemplate: true, variants: { orderBy: { family: "asc" } } } } } } } }))
      .map(mix => ({ name: mix.name, triggerMode: mix.triggerMode, dateType: mix.dateType?.slug ?? null, steps: mix.steps.map(step => ({ name: step.stepVersion.stepTemplate.name, channel: step.stepVersion.stepTemplate.channel,
        dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes, anchor: step.anchor, offsetMinutes: step.offsetMinutes, subject: step.stepVersion.subject, body: step.stepVersion.body, script: step.stepVersion.script,
        variants: step.stepVersion.variants.map(item => [item.family, item.subject, item.body, item.script]) })) }));
    const source = await shape([dated.id, visit.id]);
    // The editor stored every kind of timing and a version in each family.
    expect(new Set(source.flatMap(mix => mix.steps.map(step => step.anchor)))).toEqual(new Set(["CALENDAR_DAY", "APPOINTMENT_START", "APPOINTMENT_END", "VISIT_COMPLETED"]));
    expect(new Set(source.flatMap(mix => mix.steps.flatMap(step => step.variants.map(item => item[0]))))).toEqual(new Set(["TEXT", "EMAIL", "CALL"]));
    expect(source[0]).toMatchObject({ name: "Birthday run-up", triggerMode: "DATE_TRIGGERED", dateType: "birthday" });
    expect(source[0].steps.map(step => step.dayOffset)).toEqual([-365, -7, 0, 3, 365]);

    const pipeline = await createMegaMixPipeline({ workspaceId, actorUserId: userId, name: "Every timing", mixIds: [dated.id, visit.id] });
    const exported = await exportMegaMixPipeline(prisma, workspaceId, pipeline.id);
    expect(portableContentIssues(exported.package)).toEqual([]);
    // As a Mega-Mix file into another account.
    const imported = await importPortable({ workspaceId: otherWorkspaceId, actorUserId: otherUserId, value: parsePortable(JSON.stringify(exported.package)), name: "Every timing", origin: "FILE", source: "test" });
    expect(await shape(imported.mixIds)).toEqual(source);
    // As single-Mix files.
    for (const mix of [dated, visit]) {
      const single = await exportSingleMix(prisma, workspaceId, mix.id);
      const copy = await importPortable({ workspaceId: otherWorkspaceId, actorUserId: otherUserId, value: parsePortable(JSON.stringify(single.package)), name: mix.name, origin: "FILE", source: "test" });
      expect(await shape(copy.mixIds)).toEqual(source.filter(item => item.name === mix.name));
    }
    // As a copy in the same account, and as a Marketplace add.
    expect(await shape((await duplicateMegaMixPipeline({ workspaceId, actorUserId: userId, pipelineId: pipeline.id, name: "Every timing copy" })).mixIds)).toEqual(source);
    const listing = await shareOnMarketplace({ workspaceId, actorUserId: userId, kind: "MEGA_MIX", targetId: pipeline.id, publicName: "Timing Co", summary: "", industry: "", confirmed: true });
    const item = await readMarketplaceItem(`listing:${listing.id}`, { userId: otherUserId, workspaceId: otherWorkspaceId });
    if (item?.type !== "listing") throw new Error("Expected a listing.");
    const added = await addFromMarketplace({ listingId: listing.id, workspaceId: otherWorkspaceId, actorUserId: otherUserId, name: "Every timing from the Marketplace", expectedFingerprint: item.listing.fingerprint });
    expect(await shape(added.mixIds)).toEqual(source);
  });

  it("every ready-made Mega-Mix, as shipped and as tailored at setup, exports a file that imports again and can be copied", { timeout: 240_000 }, async () => {
    const tailored: JourneySetupValues = { preferences: { ...DEFAULT_JOURNEY_PREFERENCES, communication: "EMAIL", pace: "RELAXED" }, timezone: "UTC", defaultFollowUpMinutes: 600, quietHoursStart: 1200, quietHoursEnd: 480, appointmentBufferMinutes: 15 };
    try {
      for (const blueprint of MEGA_MIXES) for (const [owner, actor, setup] of [[workspaceId, userId, undefined], [otherWorkspaceId, otherUserId, tailored]] as const) {
        const installed = await installMegaMix({ workspaceId: owner, actorUserId: actor, blueprintId: blueprint.id, expectedVersion: blueprint.version, setup });
        const exported = await exportMegaMixPipeline(prisma, owner, installed.id);
        expect(exported.package.mixes).toHaveLength(blueprint.nodes.length);
        expect(portableContentIssues(exported.package), `${blueprint.id}${setup ? ", tailored" : ""}`).toEqual([]);
        expect(() => parsePortable(JSON.stringify(exported.package))).not.toThrow();
        await expect(duplicateMegaMixPipeline({ workspaceId: owner, actorUserId: actor, pipelineId: installed.id, name: `${blueprint.name} copy` })).resolves.toMatchObject({ pipelineId: expect.any(String) });
      }
    } finally {
      await prisma.userPreference.deleteMany({ where: { userId: otherUserId } });
      await prisma.workspacePreference.deleteMany({ where: { workspaceId: otherWorkspaceId } });
    }
  });

  it("adds nothing from a package holding a Beat the editor would refuse, however it arrives", async () => {
    const leak = (name: string): PortablePackage => ({ format: "jump-in-the-mix", version: 1, kind: "mix", name, description: null, rules: [], waitingBeats: [], finishes: [],
      mixes: [{ key: "m1", name, description: null, category: null, industry: null, framework: null, triggerMode: "MANUAL_START", dateType: null,
        steps: [{ key: "b1", name: "Notes", channel: "EMAIL", dayOffset: 0, sendTimeMinutes: null, anchor: "CALENDAR_DAY", offsetMinutes: null, subject: "Your notes", body: "Hi {{First Name}}, {{Private Notes}}", script: null, longSms: false, includeOptOut: false, variants: [] }] }] });
    expect(() => parsePortable(JSON.stringify(leak("Leaky")))).toThrow("This file cannot be imported: Beat 1 of Leaky uses private notes, which only a phone-call Beat or a call version may show.");
    // A caller that skips the file reader is refused at install.
    await expect(importPortable({ workspaceId: otherWorkspaceId, actorUserId: otherUserId, value: leak("Leaky"), name: "Leaky", origin: "FILE", source: "test" }))
      .rejects.toThrow("This Mix cannot be added: Beat 1 of Leaky uses private notes, which only a phone-call Beat or a call version may show.");
    const unknown = leak("Odd fields"); unknown.mixes[0].steps[0].body = "Hi {{Favourite Colour}}";
    await expect(importPortable({ workspaceId: otherWorkspaceId, actorUserId: otherUserId, value: unknown, name: "Odd fields", origin: "FILE", source: "test" })).rejects.toThrow("uses unsupported placeholders: {{Favourite Colour}}");
    expect(await prisma.mix.count({ where: { workspaceId: otherWorkspaceId } })).toBe(0);
    // A Mega-Mix holding such a Beat, written outside the editor, cannot be copied either.
    const leaky = await prisma.mix.create({ data: { workspaceId, name: "Leaky Mix", triggerMode: "MANUAL_START", status: "ACTIVE",
      steps: { create: { dayOffset: 0, sortOrder: 1, stepVersion: { create: { version: 1, subject: "Notes", body: "{{Private Notes}}", stepTemplate: { create: { workspaceId, name: "Leaky email", channel: "EMAIL", isActive: false } } } } } } } });
    const pipeline = await createMegaMixPipeline({ workspaceId, actorUserId: userId, name: "Leaky pipeline", mixIds: [leaky.id] });
    await expect(duplicateMegaMixPipeline({ workspaceId, actorUserId: userId, pipelineId: pipeline.id, name: "Leaky copy" })).rejects.toThrow("This Mega-Mix cannot be copied: Beat 1 of Leaky Mix uses private notes");
    expect(await prisma.mix.count({ where: { workspaceId } })).toBe(1);
    expect(await prisma.megaMixPipeline.count({ where: { workspaceId } })).toBe(1);
  });
});
