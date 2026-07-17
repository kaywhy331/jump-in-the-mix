import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { replaceContactCustomFieldValues } from "../src/lib/contact-custom-fields";
import { parseBroadcastScheduleInput, saveMixBroadcastSchedule } from "../src/lib/mix-broadcast";
import { prisma } from "../src/lib/prisma";
import {
  findAvailableDateType,
  findWorkspaceContact,
  findWorkspaceCustomFieldDefinition,
  findWorkspaceGroup,
  findWorkspaceJump,
  findWorkspaceMix,
  findWorkspaceStepTemplate,
  requireWorkspaceContacts,
  WorkspaceScopeError
} from "../src/lib/workspace-repository";

describe.sequential("workspace isolation", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [userA, userB] = await Promise.all([
      prisma.user.create({ data: { email: `isolation-a-${suffix}@example.com`, name: "Workspace A", passwordHash: "test-only" } }),
      prisma.user.create({ data: { email: `isolation-b-${suffix}@example.com`, name: "Workspace B", passwordHash: "test-only" } })
    ]);
    ids.userA = userA.id;
    ids.userB = userB.id;

    const [workspaceA, workspaceB] = await Promise.all([
      prisma.workspace.create({ data: { name: "Isolation A", slug: `isolation-a-${suffix}`, ownerId: userA.id } }),
      prisma.workspace.create({ data: { name: "Isolation B", slug: `isolation-b-${suffix}`, ownerId: userB.id } })
    ]);
    ids.workspaceA = workspaceA.id;
    ids.workspaceB = workspaceB.id;

    const [contactA, contactB, groupA, groupB, fieldA, fieldB, globalDateType, customDateTypeB] = await Promise.all([
      prisma.contact.create({ data: { workspaceId: workspaceA.id, displayName: "Contact A" } }),
      prisma.contact.create({ data: { workspaceId: workspaceB.id, displayName: "Contact B" } }),
      prisma.group.create({ data: { workspaceId: workspaceA.id, name: `Group A ${suffix}` } }),
      prisma.group.create({ data: { workspaceId: workspaceB.id, name: `Group B ${suffix}` } }),
      prisma.contactCustomFieldDefinition.create({ data: { workspaceId: workspaceA.id, name: "Policy A", key: `policy_a_${suffix.slice(0, 8)}` } }),
      prisma.contactCustomFieldDefinition.create({ data: { workspaceId: workspaceB.id, name: "Policy B", key: `policy_b_${suffix.slice(0, 8)}` } }),
      prisma.dateType.create({ data: { scopeKey: `global-${suffix}`, name: "Global Test Date", slug: `global-${suffix}`, isSystem: true, isActive: true } }),
      prisma.dateType.create({ data: { workspaceId: workspaceB.id, scopeKey: workspaceB.id, name: "Workspace B Date", slug: `workspace-b-${suffix}`, isSystem: false, isActive: true } })
    ]);
    Object.assign(ids, {
      contactA: contactA.id,
      contactB: contactB.id,
      groupA: groupA.id,
      groupB: groupB.id,
      fieldA: fieldA.id,
      fieldB: fieldB.id,
      globalDateType: globalDateType.id,
      customDateTypeB: customDateTypeB.id
    });

    const [templateA, templateB] = await Promise.all([
      prisma.stepTemplate.create({ data: { workspaceId: workspaceA.id, name: "Jump A", channel: "SMS" } }),
      prisma.stepTemplate.create({ data: { workspaceId: workspaceB.id, name: "Jump B", channel: "SMS" } })
    ]);
    ids.templateA = templateA.id;
    ids.templateB = templateB.id;
    const [versionA, versionB, mixA, mixB] = await Promise.all([
      prisma.stepVersion.create({ data: { stepTemplateId: templateA.id, version: 1, body: "Hello A" } }),
      prisma.stepVersion.create({ data: { stepTemplateId: templateB.id, version: 1, body: "Hello B" } }),
      prisma.mix.create({ data: { workspaceId: workspaceA.id, name: "Mix A", triggerMode: "BROADCAST", status: "DRAFT" } }),
      prisma.mix.create({ data: { workspaceId: workspaceB.id, name: "Mix B", triggerMode: "BROADCAST", status: "DRAFT" } })
    ]);
    ids.mixA = mixA.id;
    ids.mixB = mixB.id;
    const [mixStepA, mixStepB] = await Promise.all([
      prisma.mixStep.create({ data: { mixId: mixA.id, stepVersionId: versionA.id, dayOffset: 0, sortOrder: 1 } }),
      prisma.mixStep.create({ data: { mixId: mixB.id, stepVersionId: versionB.id, dayOffset: 0, sortOrder: 1 } })
    ]);
    const [jumpA, jumpB] = await Promise.all([
      prisma.jump.create({
        data: {
          workspaceId: workspaceA.id,
          contactId: contactA.id,
          mixId: mixA.id,
          mixStepId: mixStepA.id,
          stepVersionId: versionA.id,
          scheduledAt: new Date(),
          reason: "Isolation A",
          templateSnapshot: { channel: "SMS", body: "Hello A" },
          renderedSnapshot: { body: "Hello A" },
          uniquenessKey: `isolation-a-${suffix}`
        }
      }),
      prisma.jump.create({
        data: {
          workspaceId: workspaceB.id,
          contactId: contactB.id,
          mixId: mixB.id,
          mixStepId: mixStepB.id,
          stepVersionId: versionB.id,
          scheduledAt: new Date(),
          reason: "Isolation B",
          templateSnapshot: { channel: "SMS", body: "Hello B" },
          renderedSnapshot: { body: "Hello B" },
          uniquenessKey: `isolation-b-${suffix}`
        }
      })
    ]);
    ids.jumpA = jumpA.id;
    ids.jumpB = jumpB.id;
  });

  afterAll(async () => {
    if (ids.workspaceA && ids.workspaceB) {
      await prisma.mixBroadcastSchedule.deleteMany({ where: { workspaceId: { in: [ids.workspaceA, ids.workspaceB] } } });
      await prisma.workspace.deleteMany({ where: { id: { in: [ids.workspaceA, ids.workspaceB] } } });
    }
    if (ids.globalDateType) await prisma.dateType.deleteMany({ where: { id: ids.globalDateType } });
    if (ids.userA && ids.userB) await prisma.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB] } } });
  });

  it("returns core records only inside their owning workspace", async () => {
    expect((await findWorkspaceContact(prisma, ids.workspaceA, ids.contactA))?.id).toBe(ids.contactA);
    expect(await findWorkspaceContact(prisma, ids.workspaceA, ids.contactB)).toBeNull();
    expect((await findWorkspaceMix(prisma, ids.workspaceA, ids.mixA))?.id).toBe(ids.mixA);
    expect(await findWorkspaceMix(prisma, ids.workspaceA, ids.mixB)).toBeNull();
    expect((await findWorkspaceGroup(prisma, ids.workspaceA, ids.groupA))?.id).toBe(ids.groupA);
    expect(await findWorkspaceGroup(prisma, ids.workspaceA, ids.groupB)).toBeNull();
    expect((await findWorkspaceStepTemplate(prisma, ids.workspaceA, ids.templateA))?.id).toBe(ids.templateA);
    expect(await findWorkspaceStepTemplate(prisma, ids.workspaceA, ids.templateB)).toBeNull();
    expect((await findWorkspaceJump(prisma, ids.workspaceA, ids.jumpA))?.id).toBe(ids.jumpA);
    expect(await findWorkspaceJump(prisma, ids.workspaceA, ids.jumpB)).toBeNull();
    expect((await findWorkspaceCustomFieldDefinition(prisma, ids.workspaceA, ids.fieldA))?.id).toBe(ids.fieldA);
    expect(await findWorkspaceCustomFieldDefinition(prisma, ids.workspaceA, ids.fieldB)).toBeNull();
  });

  it("allows global system date types but rejects another workspace's custom type", async () => {
    expect((await findAvailableDateType(prisma, ids.workspaceA, ids.globalDateType))?.id).toBe(ids.globalDateType);
    expect((await findAvailableDateType(prisma, ids.workspaceB, ids.globalDateType))?.id).toBe(ids.globalDateType);
    expect(await findAvailableDateType(prisma, ids.workspaceA, ids.customDateTypeB)).toBeNull();
  });

  it("rejects mixed-workspace bulk Contact selections", async () => {
    await expect(requireWorkspaceContacts(prisma, ids.workspaceA, [ids.contactA, ids.contactB]))
      .rejects.toBeInstanceOf(WorkspaceScopeError);
    const contacts = await requireWorkspaceContacts(prisma, ids.workspaceA, [ids.contactA]);
    expect(contacts.map((contact) => contact.id)).toEqual([ids.contactA]);
  });

  it("prevents cross-workspace custom-value writes", async () => {
    await expect(replaceContactCustomFieldValues(prisma, ids.workspaceA, ids.contactB, [{ definitionId: ids.fieldA, value: "Blocked" }]))
      .rejects.toBeInstanceOf(WorkspaceScopeError);
    expect(await prisma.contactCustomFieldValue.count({ where: { contactId: ids.contactB } })).toBe(0);

    await replaceContactCustomFieldValues(prisma, ids.workspaceA, ids.contactA, [{ definitionId: ids.fieldA, value: "Allowed" }]);
    const saved = await prisma.contactCustomFieldValue.findUnique({
      where: { contactId_definitionId: { contactId: ids.contactA, definitionId: ids.fieldA } }
    });
    expect(saved?.value).toBe("Allowed");
  });

  it("prevents a workspace from scheduling another workspace's Mix", async () => {
    const schedule = parseBroadcastScheduleInput("2026-12-31", "10:00", "America/Los_Angeles");
    await expect(saveMixBroadcastSchedule(prisma, ids.workspaceA, ids.mixB, schedule))
      .rejects.toBeInstanceOf(WorkspaceScopeError);
    expect(await prisma.mixBroadcastSchedule.findUnique({ where: { mixId: ids.mixB } })).toBeNull();

    await saveMixBroadcastSchedule(prisma, ids.workspaceA, ids.mixA, schedule);
    const saved = await prisma.mixBroadcastSchedule.findUnique({ where: { mixId: ids.mixA } });
    expect(saved?.workspaceId).toBe(ids.workspaceA);
    expect(saved?.timeMinutes).toBe(600);
  });
});
