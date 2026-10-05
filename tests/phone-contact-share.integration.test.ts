import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "203.0.113.41", userAgent: "Shortcuts" }) }));

const { POST } = await import("../src/app/api/webhooks/phone-contacts/route");
const { prisma } = await import("../src/lib/prisma");
const { removeContactShareKey, replaceContactShareKey, resolveContactShareKey } = await import("../src/lib/contact-share-keys");

const card = (name: string, email: string, phone: string) => [
  "BEGIN:VCARD", "VERSION:3.0", `N:${name.split(" ")[1]};${name.split(" ")[0]};;;`, `FN:${name}`,
  `item1.EMAIL;type=INTERNET;type=pref:${email}`, `TEL;type=CELL;type=VOICE;type=pref:${phone}`, "END:VCARD"
].join("\r\n");

const share = (key: string, body: string) => POST(new Request("http://127.0.0.1/api/webhooks/phone-contacts", {
  method: "POST",
  headers: { "x-jitm-key": key, "content-type": "text/vcard" },
  body
}));

describe.sequential("contacts shared from a phone", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const userIds: string[] = [];
  const workspaceIds: string[] = [];
  let ownerId = "";
  let memberId = "";
  let workspaceId = "";
  let otherWorkspaceId = "";

  beforeAll(async () => {
    const verified = new Date();
    const [owner, member, other] = await Promise.all([
      prisma.user.create({ data: { email: `share-owner-${suffix}@example.com`, name: "Share Owner", passwordHash: "test-only", emailVerifiedAt: verified } }),
      prisma.user.create({ data: { email: `share-member-${suffix}@example.com`, name: "Share Member", passwordHash: "test-only", emailVerifiedAt: verified } }),
      prisma.user.create({ data: { email: `share-other-${suffix}@example.com`, name: "Share Other", passwordHash: "test-only", emailVerifiedAt: verified } })
    ]);
    userIds.push(owner.id, member.id, other.id);
    ownerId = owner.id;
    memberId = member.id;
    const [workspace, otherWorkspace] = await Promise.all([
      prisma.workspace.create({ data: { name: "Share A", slug: `share-a-${suffix}`, ownerId: owner.id, profile: { create: {} } } }),
      prisma.workspace.create({ data: { name: "Share B", slug: `share-b-${suffix}`, ownerId: other.id, profile: { create: {} } } })
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = otherWorkspace.id;
    workspaceIds.push(workspaceId, otherWorkspaceId);
    await prisma.workspaceMember.createMany({ data: [
      { workspaceId, userId: owner.id, role: "OWNER" },
      { workspaceId, userId: member.id },
      { workspaceId: otherWorkspaceId, userId: other.id, role: "OWNER" }
    ] });
  });

  afterAll(async () => {
    if (workspaceIds.length) await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("adds a shared card to the key owner's Contacts, once, and records the use", async () => {
    const key = await replaceContactShareKey(workspaceId, ownerId);
    const stored = await prisma.contactShareKey.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId: ownerId } } });
    expect(stored.tokenHash).not.toContain(key);

    const body = card("Jordan Lee", `jordan-${suffix}@example.com`, "(626) 555-0142");
    const first = await share(key, body);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("text/plain");
    expect(await first.text()).toBe("Added Jordan Lee to Jump in the Mix.");

    // A double tap sends the same card again: same answer, still one person.
    const repeat = await share(key, body);
    expect(await repeat.text()).toBe("Added Jordan Lee to Jump in the Mix.");
    const saved = await prisma.contact.findMany({ where: { workspaceId, displayName: "Jordan Lee" }, include: { emails: true, phones: true } });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ source: "API", firstName: "Jordan", lastName: "Lee" });
    expect(saved[0].emails.map(email => email.normalized)).toEqual([`jordan-${suffix}@example.com`]);
    expect(await prisma.contact.count({ where: { workspaceId: otherWorkspaceId } })).toBe(0);
    expect((await prisma.contactShareKey.findUniqueOrThrow({ where: { id: stored.id } })).lastUsedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { workspaceId, action: "contact.quick-add", source: "contacts.phone-share" } })).toBeGreaterThan(0);
  });

  it("merges a card that matches a saved person instead of adding them twice", async () => {
    const key = await replaceContactShareKey(workspaceId, ownerId);
    const response = await share(key, card("Jordan Lee", `jordan-${suffix}@example.com`, "(626) 555-0177"));
    expect(await response.text()).toBe("Jordan Lee was already in Jump in the Mix. Any new details were added.");
    const saved = await prisma.contact.findMany({ where: { workspaceId, displayName: "Jordan Lee" }, include: { phones: true } });
    expect(saved).toHaveLength(1);
    expect(saved[0].phones).toHaveLength(2);
  });

  it("refuses unknown, replaced and removed keys, and keys of anyone but the owner", async () => {
    const body = card("Sam Rivera", `sam-${suffix}@example.com`, "(626) 555-0199");
    expect((await share("not-a-key", body)).status).toBe(401);
    expect((await share("A".repeat(43), body)).status).toBe(401);

    const old = await replaceContactShareKey(workspaceId, ownerId);
    const current = await replaceContactShareKey(workspaceId, ownerId);
    const refused = await share(old, body);
    expect(refused.status).toBe(401);
    expect(await refused.text()).toContain("This key doesn't work.");

    const memberKey = await replaceContactShareKey(workspaceId, memberId);
    expect(await resolveContactShareKey(memberKey)).toBeNull();
    expect((await share(memberKey, body)).status).toBe(401);

    await prisma.user.update({ where: { id: ownerId }, data: { suspendedAt: new Date() } });
    expect((await share(current, body)).status).toBe(401);
    await prisma.user.update({ where: { id: ownerId }, data: { suspendedAt: null } });
    expect(await resolveContactShareKey(current)).toMatchObject({ workspaceId, userId: ownerId });

    await removeContactShareKey(workspaceId, ownerId);
    expect((await share(current, body)).status).toBe(401);
    expect(await prisma.contact.count({ where: { workspaceId, displayName: "Sam Rivera" } })).toBe(0);
  });

  it("explains what it can't add", async () => {
    const key = await replaceContactShareKey(workspaceId, ownerId);
    const empty = await share(key, "hello");
    expect(empty.status).toBe(400);
    expect(await empty.text()).toBe("Share a contact from Contacts to add it.");
    const many = Array.from({ length: 51 }, (_, index) => card(`Person ${index}`, `p${index}-${suffix}@example.com`, `(626) 555-${String(1000 + index)}`)).join("\r\n");
    const tooMany = await share(key, many);
    expect(tooMany.status).toBe(413);
    expect(await tooMany.text()).toContain("Share up to 50 people at a time.");
    expect(await prisma.contact.count({ where: { workspaceId, displayName: { startsWith: "Person " } } })).toBe(0);
  });
});
