import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";

export const BROADCAST_TIMEZONE = "America/Los_Angeles";

export type BroadcastFixture = {
  userId: string;
  workspaceId: string;
  contactId: string;
  /** Adds an active fixed-date broadcast mix assigned to the fixture contact and returns its id. */
  addBroadcast: (name: string, daysFromToday: number, options?: { timeMinutes?: number; timezone?: string }) => Promise<string>;
  cleanup: () => Promise<void>;
};

/** Noon UTC on the calendar day the given number of days from today, the form broadcast schedules use. */
export function localDateDaysFromToday(days: number, now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, 12));
}

/** One owner, one workspace and one contact, with broadcast mixes added on demand. */
export async function createBroadcastFixture(prefix: string, firstName = "Alex"): Promise<BroadcastFixture> {
  const suffix = randomUUID().replaceAll("-", "");
  const user = await prisma.user.create({ data: { email: `${prefix}-${suffix}@example.com`, name: `${prefix} owner`, passwordHash: "test-only" } });
  const workspace = await prisma.workspace.create({
    data: { name: `${prefix} workspace`, slug: `${prefix}-${suffix}`, ownerId: user.id, profile: { create: {} } }
  });
  const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, firstName, displayName: firstName } });
  return {
    userId: user.id,
    workspaceId: workspace.id,
    contactId: contact.id,
    async addBroadcast(name, daysFromToday, options = {}) {
      const template = await prisma.stepTemplate.create({ data: { workspaceId: workspace.id, name, channel: "SMS" } });
      const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}" } });
      const mix = await prisma.mix.create({ data: { workspaceId: workspace.id, name, triggerMode: "BROADCAST", status: "ACTIVE" } });
      await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
      await prisma.mixAssignment.create({
        data: { assignmentKey: `${workspace.id}:${mix.id}:audience:${contact.id}`, workspaceId: workspace.id, mixId: mix.id, contactId: contact.id, mode: "DYNAMIC" }
      });
      await prisma.mixBroadcastSchedule.create({
        data: { workspaceId: workspace.id, mixId: mix.id, localDate: localDateDaysFromToday(daysFromToday), timeMinutes: options.timeMinutes ?? 600, timezone: options.timezone ?? BROADCAST_TIMEZONE }
      });
      return mix.id;
    },
    async cleanup() {
      await prisma.mixBroadcastSchedule.deleteMany({ where: { workspaceId: workspace.id } });
      await prisma.workspace.deleteMany({ where: { id: workspace.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  };
}
