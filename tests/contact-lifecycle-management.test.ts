import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";

const read = (path: string) => readFileSync(path, "utf8");

describe.sequential("Contact lifecycle management", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `contact-lifecycle-${suffix}@example.com`, name: "Lifecycle Owner", passwordHash: "test-only" } });
    const workspace = await prisma.workspace.create({ data: { name: "Lifecycle Test", slug: `contact-lifecycle-${suffix}`, ownerId: user.id, profile: { create: {} } } });
    const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Jordan Lifecycle", firstName: "Jordan" } });
    await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
    ids.user = user.id;
    ids.workspace = workspace.id;
    ids.contact = contact.id;
  });

  afterAll(async () => {
    if (ids.workspace) await prisma.workspace.deleteMany({ where: { id: ids.workspace } });
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  it("persists first-class relationship state with optimistic versions", async () => {
    const state = await prisma.contactRelationshipState.create({
      data: {
        workspaceId: ids.workspace,
        contactId: ids.contact,
        preferredChannel: "PHONE_CALL",
        priority: "HIGH",
        doNotContact: true,
        relationshipStatus: "Active client"
      }
    });
    expect(state).toMatchObject({ version: 1, priority: "HIGH", doNotContact: true });

    const updated = await prisma.contactRelationshipState.updateMany({
      where: { id: state.id, version: 1 },
      data: { doNotContact: false, priority: "URGENT", version: { increment: 1 } }
    });
    expect(updated.count).toBe(1);
    expect(await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId: ids.contact } })).toMatchObject({ version: 2, priority: "URGENT", doNotContact: false });
    const filtered = await prisma.contact.findMany({
      where: { workspaceId: ids.workspace, relationshipState: { is: { priority: "URGENT", doNotContact: false } } },
      include: { relationshipState: true }
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.relationshipState).toMatchObject({ priority: "URGENT" });
  });

  it("stores one cross-device layout and reusable saved views per user and workspace", async () => {
    await prisma.userContactLayout.create({ data: { userId: ids.user, workspaceId: ids.workspace, cardOrder: ["relationship-state", "important-dates"], collapsedCards: ["important-dates"] } });
    await prisma.contactSavedView.create({ data: { userId: ids.user, workspaceId: ids.workspace, name: "Urgent clients", query: { priority: "URGENT", permission: "contactable" }, isDefault: true } });
    const [layout, view] = await Promise.all([
      prisma.userContactLayout.findUniqueOrThrow({ where: { userId_workspaceId: { userId: ids.user, workspaceId: ids.workspace } } }),
      prisma.contactSavedView.findUniqueOrThrow({ where: { userId_workspaceId_name: { userId: ids.user, workspaceId: ids.workspace, name: "Urgent clients" } } })
    ]);
    expect(layout.cardOrder).toEqual(["relationship-state", "important-dates"]);
    expect(view).toMatchObject({ isDefault: true, query: { priority: "URGENT", permission: "contactable" } });
  });

  it("keeps restore, merge, and do-not-contact enforcement on authenticated server boundaries", () => {
    const lifecycle = read("src/lib/contact-lifecycle-actions.ts");
    const merge = read("src/lib/contact-merge-actions.ts");
    const bulk = read("src/lib/bulk-contact-actions.ts");
    const engine = read("src/lib/jump-engine.ts");
    const layoutApi = read("src/app/api/preferences/contact-layout/route.ts");
    const contactsPage = read("src/app/(app)/contacts/page.tsx");
    expect(lifecycle).toContain("restoreContactAction");
    expect(lifecycle).not.toMatch(/PLAN_LIMITS|upgrade|plan allows/i);
    expect(merge).toContain("contactMergeRecord.create");
    expect(merge).toContain("sourceSnapshot");
    expect(bulk).toContain("assertContactable");
    expect(engine).toContain("doNotContactIds.has(contact.id)");
    expect(layoutApi).toContain("getCurrentSession()");
    expect(layoutApi).toContain("workspaceId: membership.workspaceId");
    expect(contactsPage).toContain("ContactSavedViewsBar");
    expect(contactsPage).toContain("relationshipState: { is:");
    expect(contactsPage).toContain("doNotContact: contact.relationshipState?.doNotContact ?? false");
  });
});
