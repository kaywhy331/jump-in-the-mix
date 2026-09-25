import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EXPORT_PAGE_ROWS, openAccountExport } from "@/lib/account-export-stream";
import { encryptIntegrationCredentials } from "@/lib/integration-crypto";
import { decryptAttemptRecipient } from "@/lib/jump-attempts";
import { prisma } from "@/lib/prisma";
import { clearRateLimit } from "@/lib/rate-limit";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
import { GET as exportAccount } from "@/app/api/account/export/route";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");

type Owner = { id: string; name: string; email: string; createdAt: Date; updatedAt: Date };
type Document = Record<string, unknown>;
type Read = { model: string; operation: string; take: unknown };

/** Fixed instants, so rows can share an order value and only the tie-break separates them. */
const at = (second: number) => new Date(Date.UTC(2026, 0, 5, 12, 0, second));

/** A client that records every model read, and fails reads of one model when asked. */
function recording(reads: Read[], failOn?: string): typeof prisma {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          reads.push({ model, operation, take: (args as { take?: unknown } | undefined)?.take });
          if (model === failOn) throw new Error(`${model} read failed`);
          return query(args);
        }
      }
    }
  }) as unknown as typeof prisma;
}

const normalised = (document: Document): Document => ({ ...document, exportedAt: "normalised" });

/** Release B's in-memory copy of each distinct workflow definition, unchanged. */
function withSharedDefinitions<T extends { definition: unknown }>(instances: T[]): { definitions: Array<{ id: string; definition: unknown }>; instances: Array<Omit<T, "definition"> & { definitionId: string }> } {
  const definitions = new Map<string, unknown>();
  const compact = instances.map(({ definition, ...instance }) => {
    const definitionId = createHash("sha256").update(JSON.stringify(definition) ?? "null", "utf8").digest("hex").slice(0, 16);
    if (!definitions.has(definitionId)) definitions.set(definitionId, definition);
    return { ...instance, definitionId };
  });
  return { definitions: [...definitions].map(([id, definition]) => ({ id, definition })), instances: compact };
}

/**
 * The route's buffered export as Release B built it (parallel reads, one JSON.stringify), with the
 * tie-breaks the streamed export adds so that both sides have one defined order.
 */
async function bufferedExport(user: Owner, workspaceId: string): Promise<Document> {
  const created = [{ createdAt: "asc" as const }, { id: "asc" as const }];
  const [
    profile, userPreference, schedulingPreference, contacts, activities, groups, dateTypes, templates, mixes, jumps, followUpDrafts, followUpAttempts, appointmentBindings, imports,
    notificationPreference, automationPreference, reviewRequests, automatedDeliveries, authIdentities, journeyPreference, journeyStages, journeys, journeyEvents,
    mixWorkflow, mixWorkflowInstances, mixFavorites, megaMixInstallations, megaMixPipelines, marketplace, mixStops, contactGroupStates, customFieldDefinitions,
    calendarEntries, calendarConnections, intakeConnections, intakeReceipts, intakeIdentities,
    savedContactViews, contactMergeRecords, handoffEvents, broadcastSchedules, marketingPreference, sharedMixImports, supportTickets, reminderDeliveries, reminderDevices, accessInvitations
  ] = await Promise.all([
    prisma.workspaceProfile.findUnique({ where: { workspaceId } }),
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    prisma.workspacePreference.findUnique({ where: { workspaceId } }),
    prisma.contact.findMany({ where: { workspaceId }, include: { relationshipState: true, emails: { orderBy: created }, phones: { orderBy: created }, addresses: { orderBy: created }, jumpDates: { include: { dateType: true }, orderBy: created }, customFieldValues: { include: { definition: true }, orderBy: created }, groupMemberships: { include: { group: true }, orderBy: created } }, orderBy: created }),
    prisma.contactActivity.findMany({ where: { workspaceId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] }),
    prisma.group.findMany({ where: { workspaceId }, include: { memberships: { orderBy: created } }, orderBy: created }),
    prisma.dateType.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null, isSystem: true }] }, orderBy: created }),
    prisma.stepTemplate.findMany({ where: { workspaceId }, include: { versions: { orderBy: { version: "asc" }, include: { variants: { orderBy: { family: "asc" } } } } }, orderBy: created }),
    prisma.mix.findMany({ where: { workspaceId }, include: { steps: { orderBy: created }, assignments: { orderBy: created } }, orderBy: created }),
    prisma.jump.findMany({ where: { workspaceId }, include: { contact: { select: { displayName: true } }, mix: { select: { name: true } }, stepVersion: { include: { stepTemplate: { select: { channel: true } } } } }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }] }),
    prisma.jumpDraft.findMany({ where: { workspaceId }, orderBy: [{ updatedAt: "asc" }, { jumpId: "asc" }, { family: "asc" }] }),
    prisma.jumpAttempt.findMany({ where: { workspaceId }, orderBy: created }),
    prisma.appointmentBinding.findMany({ where: { workspaceId }, orderBy: created }),
    prisma.contactImportBatch.findMany({ where: { workspaceId }, orderBy: created }),
    prisma.notificationPreference.findUnique({ where: { workspaceId } }),
    prisma.automationPreference.findUnique({ where: { workspaceId } }),
    prisma.reviewRequest.findMany({ where: { workspaceId }, select: { id: true, contactId: true, status: true, rating: true, feedback: true, openedAt: true, respondedAt: true, reviewClickedAt: true, referralClickedAt: true, expiresAt: true, createdAt: true, updatedAt: true }, orderBy: created }),
    prisma.automatedDelivery.findMany({ where: { workspaceId }, orderBy: created }),
    prisma.authIdentity.findMany({ where: { userId: user.id }, select: { provider: true, email: true, createdAt: true, updatedAt: true }, orderBy: created }),
    prisma.journeyPreference.findUnique({ where: { workspaceId } }),
    prisma.journeyStage.findMany({ where: { workspaceId }, include: { outgoingRules: { orderBy: { id: "asc" } } }, orderBy: [{ position: "asc" }, { id: "asc" }] }),
    prisma.contactJourney.findMany({ where: { workspaceId }, orderBy: { contactId: "asc" } }),
    prisma.journeyEvent.findMany({ where: { workspaceId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] }),
    prisma.mixWorkflow.findUnique({ where: { workspaceId } }),
    prisma.mixWorkflowInstance.findMany({ where: { workspaceId }, orderBy: created }),
    prisma.mixFavorite.findMany({ where: { workspaceId, userId: user.id }, orderBy: created }),
    prisma.megaMixInstallation.findMany({ where: { workspaceId }, orderBy: created }),
    prisma.megaMixPipeline.findMany({ where: { workspaceId }, orderBy: created, include: { members: { orderBy: [{ position: "asc" }, { mixId: "asc" }] } } }),
    Promise.all([
      prisma.marketplaceAuthor.findUnique({ where: { workspaceId } }),
      prisma.marketplaceListing.findMany({ where: { workspaceId }, orderBy: created, include: { _count: { select: { favorites: true, imports: true } } } }),
      prisma.marketplaceFavorite.findMany({ where: { workspaceId, userId: user.id }, orderBy: [{ createdAt: "asc" }, { listingId: "asc" }], select: { listingId: true, createdAt: true } }),
      prisma.marketplaceImport.findMany({ where: { workspaceId }, orderBy: created }),
      prisma.marketplaceReport.findMany({ where: { reporterWorkspaceId: workspaceId }, orderBy: created, select: { listingId: true, reason: true, details: true, status: true, createdAt: true } }),
      prisma.marketplaceReport.findMany({ where: { listing: { workspaceId } }, orderBy: created, select: { listingId: true, reason: true, details: true, status: true, reviewNote: true, createdAt: true } })
    ]).then(([author, listings, favorites, imports, reportsMade, reportsReceived]) => ({ author, listings, favorites, imports, reportsMade, reportsReceived })),
    prisma.mixStop.findMany({ where: { workspaceId }, orderBy: [{ stoppedAt: "asc" }, { id: "asc" }] }),
    prisma.contactGroupState.findMany({ where: { workspaceId }, orderBy: [{ createdAt: "asc" }, { groupId: "asc" }] }),
    prisma.contactCustomFieldDefinition.findMany({ where: { workspaceId }, orderBy: created }),
    prisma.calendarEntry.findMany({ where: { workspaceId }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }),
    prisma.calendarConnection.findMany({ where: { workspaceId }, select: { id: true, name: true, enabled: true, lastSyncedAt: true, lastAttemptAt: true, lastError: true, createdAt: true }, orderBy: created }),
    prisma.intakeConnection.findMany({ where: { workspaceId }, select: { id: true, name: true, kind: true, enabled: true, createdAt: true }, orderBy: created }),
    prisma.intakeReceipt.findMany({ where: { connection: { workspaceId } }, orderBy: created }),
    prisma.intakeIdentity.findMany({ where: { connection: { workspaceId } }, orderBy: [{ connectionId: "asc" }, { externalId: "asc" }] }),
    prisma.contactSavedView.findMany({ where: { workspaceId, userId: user.id }, orderBy: created }),
    prisma.contactMergeRecord.findMany({ where: { workspaceId }, orderBy: created }),
    prisma.jumpActionEvent.findMany({ where: { workspaceId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] }),
    prisma.mixBroadcastSchedule.findMany({ where: { workspaceId }, orderBy: created }),
    prisma.workspaceMarketingPreference.findUnique({ where: { workspaceId } }),
    prisma.sharedMixImport.findMany({ where: { workspaceId }, orderBy: created }),
    prisma.supportTicket.findMany({ where: { workspaceId, requesterUserId: user.id }, select: { id: true, reference: true, title: true, category: true, priority: true, status: true, createdAt: true, updatedAt: true, resolvedAt: true, closedAt: true, messages: { select: { id: true, authorType: true, body: true, createdAt: true, emailStatus: true }, orderBy: created } }, orderBy: created }),
    prisma.notificationDelivery.findMany({ where: { workspaceId, userId: user.id }, orderBy: created }),
    prisma.pushSubscription.findMany({ where: { workspaceId, userId: user.id }, select: { id: true, userAgent: true, lastUsedAt: true, createdAt: true, followUpDeliveries: { select: { jumpId: true, scheduledAt: true, status: true, deliveredAt: true, createdAt: true }, orderBy: created } }, orderBy: created }),
    prisma.referralAccessInvite.findMany({ where: { workspaceId, inviterUserId: user.id }, select: { id: true, contactId: true, recipientEmail: true, recipientPhone: true, manualDelivery: true, lastSentAt: true, acceptedAt: true, revokedAt: true, createdAt: true }, orderBy: created })
  ]);
  const document = {
    format: "jump-in-the-mix-personal-export",
    exportedAt: new Date().toISOString(),
    account: { id: user.id, name: user.name, email: user.email, signInMethods: authIdentities, createdAt: user.createdAt, updatedAt: user.updatedAt },
    preferences: { profile, userPreference, schedulingPreference, notificationPreference, automationPreference },
    contacts,
    activities,
    groups,
    dateTypes,
    templates,
    mixes,
    jumps,
    followUpDrafts,
    followUpAttempts: followUpAttempts.map(({ recipientCiphertext, ...attempt }) => ({ ...attempt, recipient: decryptAttemptRecipient(recipientCiphertext) })),
    appointmentBindings,
    imports,
    reviewRequests,
    automatedDeliveries,
    journey: { preference: journeyPreference, stages: journeyStages, contacts: journeys, events: journeyEvents },
    mixWorkflow: { configuration: mixWorkflow, ...withSharedDefinitions(mixWorkflowInstances) },
    mixFavorites,
    megaMixInstallations,
    megaMixPipelines,
    marketplace,
    mixStops,
    contactGroupStates,
    customFieldDefinitions,
    savedContactViews, contactMergeRecords, handoffEvents, broadcastSchedules, marketingPreference, sharedMixImports, supportTickets, reminderDeliveries, reminderDevices, accessInvitations,
    calendar: { entries: calendarEntries, connections: calendarConnections },
    leadIntake: { connections: intakeConnections, receipts: intakeReceipts, identities: intakeIdentities },
    excludedSecurityMaterial: ["password hashes", "session tokens", "provider credentials", "provider webhook payloads", "connection keys and private calendar URLs", "push endpoints and authentication keys", "invitation tokens"],
    excludedOperationalData: ["platform staff administration and analytics", "shared system-catalog source records", "internal job, transport and audit queues"]
  };
  return JSON.parse(JSON.stringify(document)) as Document;
}

async function readAll(body: ReadableStream<Uint8Array>): Promise<{ text: string; error: unknown }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { text, error: null };
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    return { text, error };
  }
}

describe.skipIf(!local).sequential("streamed personal data export", () => {
  const suffix = randomUUID().slice(0, 8);
  let owner: Owner;
  let workspaceId: string, neighbourWorkspaceId: string, memberId: string, neighbourId: string, sharedMixId: string;

  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `stream-owner-${suffix}@example.com`, name: "Stream owner" } });
    const member = await prisma.user.create({ data: { email: `stream-member-${suffix}@example.com`, name: "Stream member" } }); memberId = member.id;
    const neighbour = await prisma.user.create({ data: { email: `stream-neighbour-${suffix}@example.com`, name: "Stream neighbour" } }); neighbourId = neighbour.id;
    workspaceId = (await prisma.workspace.create({ data: { name: "Stream export", slug: `stream-${suffix}`, ownerId: owner.id } })).id;
    neighbourWorkspaceId = (await prisma.workspace.create({ data: { name: "Stream neighbour", slug: `stream-neighbour-${suffix}`, ownerId: neighbourId } })).id;
    auth.context = { user: owner, workspace: { id: workspaceId }, impersonation: null };

    // Account and preferences; the member's rows in the same workspace must stay out of the owner's export.
    await prisma.authIdentity.createMany({ data: [
      { userId: owner.id, provider: "GOOGLE", providerAccountId: `stream-google-${suffix}`, email: owner.email, createdAt: at(0) },
      { userId: owner.id, provider: "APPLE", providerAccountId: `stream-apple-${suffix}`, email: owner.email, createdAt: at(0) },
      { userId: memberId, provider: "GOOGLE", providerAccountId: `stream-member-${suffix}`, email: member.email }
    ] });
    await prisma.workspaceProfile.create({ data: { workspaceId, company: "Stream Painting", useCases: ["estimates"] } });
    await prisma.userPreference.create({ data: { userId: owner.id, timezone: "America/Denver" } });
    await prisma.workspacePreference.create({ data: { workspaceId, quietDaysEnabled: true } });
    await prisma.notificationPreference.create({ data: { workspaceId, userId: owner.id, digestHour: 8 } });
    await prisma.automationPreference.create({ data: { workspaceId, reviewWindowMinutes: 45 } });

    // Contacts: three share one createdAt and two another.
    const names = ["Avery", "Blake", "Casey", "Drew", "Emery"];
    const contacts = [];
    for (const [index, name] of names.entries()) contacts.push(await prisma.contact.create({ data: { workspaceId, displayName: `${name} Stream`, firstName: name, company: index === 0 ? "Stream Homes" : null, createdAt: at(index < 3 ? 1 : 2) } }));
    const [c1, c2, c3, c4, c5] = contacts.map((contact) => contact.id);
    await prisma.contactEmail.createMany({ data: [
      { contactId: c1, email: "avery@example.com", normalized: "avery@example.com", isPrimary: true, createdAt: at(3) },
      { contactId: c1, email: "avery.work@example.com", normalized: "avery.work@example.com", createdAt: at(3) }
    ] });
    await prisma.contactPhone.create({ data: { contactId: c1, phone: "+1 555 010 0101", normalized: "+15550100101", isPrimary: true } });
    await prisma.contactAddress.create({ data: { contactId: c1, city: "Denver", state: "CO", isPrimary: true } });
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: c1, doNotContact: true, preferredChannel: "EMAIL", priority: "HIGH", relationshipStatus: "Agreed callback" } });
    const dateType = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Move-in", slug: `move-in-${suffix}` } });
    await prisma.jumpDate.create({ data: { workspaceId, contactId: c1, dateTypeId: dateType.id, dateValue: new Date("2026-05-12T00:00:00Z"), month: 5, day: 12, timezone: "America/Denver", label: "Moved in" } });
    const color = await prisma.contactCustomFieldDefinition.create({ data: { workspaceId, name: "Favorite color", key: "favorite_color", createdAt: at(1) } });
    await prisma.contactCustomFieldDefinition.create({ data: { workspaceId, name: "Gate code", key: "gate_code", createdAt: at(1) } });
    await prisma.contactCustomFieldValue.create({ data: { contactId: c1, definitionId: color.id, value: "Blue" } });

    // Groups: one with four members (two pages of two), both groups created together.
    const neighbors = await prisma.group.create({ data: { workspaceId, name: "Neighbors", createdAt: at(1) } });
    const clients = await prisma.group.create({ data: { workspaceId, name: "Clients", createdAt: at(1) } });
    await prisma.contactGroupMembership.createMany({ data: [c1, c2, c3, c4].map((contactId) => ({ contactId, groupId: neighbors.id, createdAt: at(4) })).concat([{ contactId: c5, groupId: clients.id, createdAt: at(4) }]) });
    await prisma.contactGroupState.createMany({ data: [{ groupId: neighbors.id, workspaceId, createdAt: at(1) }, { groupId: clients.id, workspaceId, createdAt: at(1) }] });
    await prisma.contactActivity.createMany({ data: [
      { workspaceId, contactId: c1, kind: "CUSTOMER_NOTE", summary: "Asked about the estimate", occurredAt: at(5) },
      { workspaceId, contactId: c2, kind: "PRIVATE_UPDATE", visibility: "PRIVATE", summary: "Prefers mornings", occurredAt: at(5) },
      { workspaceId, contactId: c3, kind: "CUSTOMER_NOTE", summary: "Sent photos", occurredAt: at(5) },
      { workspaceId, contactId: c1, kind: "SYSTEM", summary: "Imported", occurredAt: at(6), metadata: { source: "stream test" } }
    ] });

    // Templates with several versions, one of them with two channel alternatives.
    const estimate = await prisma.stepTemplate.create({ data: { workspaceId, name: "Estimate check", channel: "SMS", currentVersion: 3, createdAt: at(1) } });
    const thanks = await prisma.stepTemplate.create({ data: { workspaceId, name: "Thank you", channel: "EMAIL", createdAt: at(1) } });
    const review = await prisma.stepTemplate.create({ data: { workspaceId, name: "Review", channel: "SMS", createdAt: at(2) } });
    await prisma.stepVersion.createMany({ data: [1, 2].map((version) => ({ stepTemplateId: estimate.id, version, body: `Estimate check v${version}` })) });
    const estimateV3 = await prisma.stepVersion.create({ data: { stepTemplateId: estimate.id, version: 3, body: "Hi {{First Name}}, any questions?", variants: { create: [{ family: "EMAIL", subject: "Your estimate", body: "Any questions?" }, { family: "CALL", script: "Ask about timing." }] } } });
    const thanksV1 = await prisma.stepVersion.create({ data: { stepTemplateId: thanks.id, version: 1, subject: "Thank you", body: "Thanks for choosing us." } });
    const reviewV1 = await prisma.stepVersion.create({ data: { stepTemplateId: review.id, version: 1, body: "Would you leave a review?" } });

    // Mixes: one with two Beats and four assignments (people, a group, and an appointment's).
    const estimateMix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", triggerMode: "MANUAL_START", status: "ACTIVE", createdAt: at(1) } });
    const thanksMix = await prisma.mix.create({ data: { workspaceId, name: "Thanks", triggerMode: "MANUAL_START", status: "ACTIVE", createdAt: at(1) } });
    const reviewMix = await prisma.mix.create({ data: { workspaceId, name: "Reviews", triggerMode: "BROADCAST", status: "DRAFT", createdAt: at(2) } });
    const first = await prisma.mixStep.create({ data: { mixId: estimateMix.id, stepVersionId: estimateV3.id, dayOffset: 0, sortOrder: 1, createdAt: at(3) } });
    await prisma.mixStep.create({ data: { mixId: estimateMix.id, stepVersionId: thanksV1.id, dayOffset: 2, sortOrder: 2, createdAt: at(3) } });
    const thanksStep = await prisma.mixStep.create({ data: { mixId: thanksMix.id, stepVersionId: reviewV1.id, dayOffset: 0, sortOrder: 1 } });
    await prisma.mixAssignment.createMany({ data: [
      { assignmentKey: `${workspaceId}:${estimateMix.id}:${c1}`, workspaceId, mixId: estimateMix.id, contactId: c1, createdAt: at(4) },
      { assignmentKey: `${workspaceId}:${estimateMix.id}:${c2}`, workspaceId, mixId: estimateMix.id, contactId: c2, createdAt: at(4) },
      { assignmentKey: `${workspaceId}:${estimateMix.id}:group`, workspaceId, mixId: estimateMix.id, groupId: neighbors.id, mode: "DYNAMIC", createdAt: at(4) }
    ] });
    const visitAssignment = await prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${estimateMix.id}:visit`, workspaceId, mixId: estimateMix.id, contactId: c3, createdAt: at(4) } });

    // Follow-ups: three due together, one later.
    const jumpBase = { workspaceId, mixId: estimateMix.id, mixStepId: first.id, stepVersionId: estimateV3.id, reason: "Estimate follow-up", templateSnapshot: { channel: "SMS", body: "Hi {{First Name}}" }, renderedSnapshot: { body: "Hi there" } };
    const jumps = [];
    for (const [index, contactId] of [c1, c2, c3].entries()) jumps.push(await prisma.jump.create({ data: { ...jumpBase, contactId, scheduledAt: at(10), uniquenessKey: `stream-${suffix}-${index}` } }));
    jumps.push(await prisma.jump.create({ data: { ...jumpBase, contactId: c4, mixId: thanksMix.id, mixStepId: thanksStep.id, stepVersionId: reviewV1.id, scheduledAt: at(11), status: "DONE", completedAt: at(11), uniquenessKey: `stream-${suffix}-3` } }));
    const [j1, j2, , j4] = jumps.map((jump) => jump.id);
    // Three drafts of one follow-up and one of another, all saved in the same instant.
    await prisma.jumpDraft.createMany({ data: [
      ...(["TEXT", "EMAIL", "CALL"] as const).map((family) => ({ jumpId: j1, family, workspaceId, stepVersionId: estimateV3.id, body: `Draft ${family}` })),
      { jumpId: j2, family: "TEXT" as const, workspaceId, stepVersionId: estimateV3.id, body: "Draft for Blake", detached: { removed: ["{{Company}}"] } }
    ] });
    await prisma.$executeRaw`UPDATE "JumpDraft" SET "updatedAt" = ${at(12)} WHERE "workspaceId" = ${workspaceId}`;
    const recipient = encryptIntegrationCredentials("+1 555 010 0101");
    await prisma.jumpAttempt.createMany({ data: [0, 1].map((index) => ({ id: randomUUID(), workspaceId, jumpId: j1, contactId: c1, channel: "SMS" as const, family: "TEXT" as const, recipientCiphertext: recipient, recipientHash: `hash-${index}`, body: `Attempt ${index}`, stepVersionId: estimateV3.id, contextVersions: { contactVersion: "v1" }, payloadHash: `payload-${index}`, openedAt: at(13), createdAt: at(13) })) });

    const calendar = await prisma.calendarConnection.create({ data: { workspaceId, name: "Work calendar", urlEncrypted: "test-only", createdAt: at(1) } });
    const visit = await prisma.calendarEntry.create({ data: { workspaceId, contactId: c3, connectionId: calendar.id, externalUid: `visit-${suffix}`, title: "Estimate visit", kind: "APPOINTMENT", startsAt: at(20), endsAt: at(21), timezone: "America/Denver", location: "123 Main St" } });
    await prisma.calendarEntry.create({ data: { workspaceId, title: "Focus time", kind: "BLOCK", startsAt: at(20), endsAt: at(21), timezone: "America/Denver" } });
    await prisma.appointmentBinding.create({ data: { workspaceId, contactId: c3, calendarEntryId: visit.id, mixId: estimateMix.id, assignmentId: visitAssignment.id } });
    await prisma.contactImportBatch.createMany({ data: [1, 1, 2].map((second, index) => ({ workspaceId, actorUserId: owner.id, importId: `stream-import-${index}`, sourceFileName: `people-${index}.csv`, totalRows: 2, payload: { rows: [{ name: `Row ${index}` }] }, createdAt: at(second) })) });
    await prisma.reviewRequest.createMany({ data: [0, 1].map((index) => ({ workspaceId, contactId: c1, tokenHash: `stream-review-${suffix}-${index}`, status: index ? "HAPPY" as const : "READY" as const, rating: index ? 5 : null, expiresAt: at(100), createdAt: at(1) })) });
    await prisma.automatedDelivery.create({ data: { workspaceId, jumpId: j4, channel: "SMS", status: "DELIVERED", reviewEligibleAt: at(30), deliveredAt: at(31) } });

    // Journey: two stages share a position; one stage has three outgoing rules.
    await prisma.journeyPreference.create({ data: { workspaceId } });
    const fresh = await prisma.journeyStage.create({ data: { workspaceId, name: "New", position: 1 } });
    const quoted = await prisma.journeyStage.create({ data: { workspaceId, name: "Quoted", position: 1, planId: estimateMix.id } });
    const won = await prisma.journeyStage.create({ data: { workspaceId, name: "Won", position: 2 } });
    await prisma.journeyRule.createMany({ data: [
      { workspaceId, fromStageId: fresh.id, toStageId: quoted.id, eventType: "CONVERSATION_STARTED" },
      { workspaceId, fromStageId: fresh.id, toStageId: quoted.id, eventType: "MEETING_SCHEDULED" },
      { workspaceId, fromStageId: fresh.id, toStageId: won.id, eventType: "SALE_CONFIRMED", afterDays: 3 },
      { workspaceId, fromStageId: quoted.id, toStageId: won.id, eventType: "WORK_COMPLETED" }
    ] });
    await prisma.contactJourney.createMany({ data: [{ contactId: c1, workspaceId, stageId: fresh.id }, { contactId: c2, workspaceId, stageId: quoted.id }] });
    await prisma.journeyEvent.createMany({ data: [0, 1, 2].map((index) => ({ workspaceId, contactId: c1, eventKey: `stream-event-${index}`, eventType: "MANUAL" as const, source: "Stream test", resultingStageId: quoted.id, occurredAt: at(40) })) });

    // Saved runs: two distinct definitions shared across four instances.
    const shared = { rules: [{ id: "rule-estimate", name: "What happened with the estimate?" }], revision: 1 };
    const other = { rules: [{ id: "rule-warranty", name: "Warranty check" }], revision: 2 };
    await prisma.mixWorkflow.create({ data: { workspaceId, configuration: { rules: [], revision: 2 } } });
    const runs: Array<[string, typeof shared, number]> = [[c1, shared, 1], [c2, shared, 1], [c3, other, 1], [c4, other, 2]];
    await prisma.mixWorkflowInstance.createMany({ data: runs.map(([contactId, definition, second], index) => ({ workspaceId, contactId, admissionKey: `stream-run-${index}`, label: `Run ${index}`, definition, state: { visits: { [`visit-${index}`]: true } }, createdAt: at(second) })) });

    await prisma.mixFavorite.createMany({ data: [
      { workspaceId, userId: owner.id, mixId: estimateMix.id, createdAt: at(1) },
      { workspaceId, userId: owner.id, mixId: thanksMix.id, createdAt: at(1) },
      { workspaceId, userId: memberId, mixId: estimateMix.id }
    ] });
    await prisma.megaMixInstallation.create({ data: { workspaceId, blueprintId: `stream-${suffix}`, version: 1, mixIds: [estimateMix.id] } });
    const pipeline = await prisma.megaMixPipeline.create({ data: { workspaceId, name: "Full journey", description: "Thanks, then reviews", members: { create: [{ mixId: thanksMix.id, position: 1 }, { mixId: reviewMix.id, position: 1 }] } } });

    // Marketplace: own shares reported by a neighbour; the owner's and the member's reports on a neighbour's share.
    await prisma.marketplaceAuthor.create({ data: { workspaceId, publicName: "Stream Author" } });
    const mixListing = await prisma.marketplaceListing.create({ data: { kind: "MIX", workspaceId, authorUserId: owner.id, mixId: estimateMix.id, title: "Estimate follow-up", fingerprint: `stream-mix-${suffix}`, channels: ["SMS"], createdAt: at(1) } });
    const pipelineListing = await prisma.marketplaceListing.create({ data: { kind: "MEGA_MIX", workspaceId, authorUserId: owner.id, pipelineId: pipeline.id, title: "Full journey", mixCount: 2, fingerprint: `stream-pipeline-${suffix}`, createdAt: at(1) } });
    const neighbourListing = await prisma.marketplaceListing.create({ data: { kind: "MIX", workspaceId: neighbourWorkspaceId, authorUserId: neighbourId, title: "Neighbour mix", fingerprint: `stream-neighbour-${suffix}` } });
    await prisma.marketplaceFavorite.createMany({ data: [
      { listingId: neighbourListing.id, userId: owner.id, workspaceId, createdAt: at(1) },
      { listingId: mixListing.id, userId: owner.id, workspaceId, createdAt: at(1) },
      { listingId: neighbourListing.id, userId: memberId, workspaceId },
      { listingId: mixListing.id, userId: neighbourId, workspaceId: neighbourWorkspaceId }
    ] });
    await prisma.marketplaceImport.createMany({ data: [0, 1].map(() => ({ listingId: neighbourListing.id, workspaceId, fingerprint: `stream-neighbour-${suffix}`, createdAt: at(1) })) });
    await prisma.marketplaceReport.createMany({ data: [
      { listingId: neighbourListing.id, reporterUserId: owner.id, reporterWorkspaceId: workspaceId, reason: "SPAM", details: "Looks copied", createdAt: at(1) },
      { listingId: neighbourListing.id, reporterUserId: memberId, reporterWorkspaceId: workspaceId, reason: "OTHER", createdAt: at(1) },
      { listingId: mixListing.id, reporterUserId: neighbourId, reporterWorkspaceId: neighbourWorkspaceId, reason: "MISLEADING", details: "Claims too much", status: "DISMISSED", reviewNote: "Accurate", createdAt: at(1) },
      { listingId: pipelineListing.id, reporterUserId: neighbourId, reporterWorkspaceId: neighbourWorkspaceId, reason: "OTHER", createdAt: at(1) }
    ] });

    await prisma.mixStop.createMany({ data: [c1, c2].map((contactId) => ({ workspaceId, mixId: estimateMix.id, contactId, stoppedByUserId: owner.id, reason: "Asked to pause", stoppedAt: at(50) })) });
    await prisma.contactSavedView.createMany({ data: [
      { userId: owner.id, workspaceId, name: "Hot leads", query: { priority: "HIGH" }, isDefault: true, createdAt: at(1) },
      { userId: owner.id, workspaceId, name: "Past clients", query: { group: "Clients" }, createdAt: at(1) },
      { userId: memberId, workspaceId, name: "Member view", query: {} }
    ] });
    await prisma.contactMergeRecord.create({ data: { workspaceId, survivorContactId: c1, mergedContactId: c5, actorUserId: owner.id, sourceSnapshot: { displayName: "Emery Stream" }, mergeSummary: { emails: 1 } } });
    await prisma.jumpActionEvent.createMany({ data: [
      { workspaceId, jumpId: j1, actorUserId: owner.id, action: "OPENED", occurredAt: at(60) },
      { workspaceId, jumpId: j1, actorUserId: owner.id, action: "COPIED", channel: "SMS", occurredAt: at(60) },
      { workspaceId, jumpId: j2, action: "CALLED", metadata: { seconds: 40 }, occurredAt: at(61) }
    ] });
    await prisma.mixBroadcastSchedule.create({ data: { workspaceId, mixId: reviewMix.id, localDate: at(70), timeMinutes: 600, timezone: "America/Denver" } });
    await prisma.workspaceMarketingPreference.create({ data: { workspaceId, scenario: "painting", version: 1 } });
    sharedMixId = (await prisma.sharedMix.create({ data: { title: `Stream library ${suffix}`, description: "Library copy", category: "Follow-up", durationDays: 7, steps: [] } })).id;
    await prisma.sharedMixImport.create({ data: { importKey: `stream-${suffix}`, workspaceId, sharedMixId, mixId: thanksMix.id } });

    // Support: one conversation longer than a page; the member's ticket stays out.
    await prisma.supportTicket.create({ data: { reference: `JITM-STREAM-${suffix}-1`, workspaceId, requesterUserId: owner.id, title: "Export question", category: "PRIVACY_SECURITY", createdAt: at(1),
      messages: { create: [0, 1, 2, 3].map((index) => ({ authorUserId: index % 2 ? neighbourId : owner.id, authorType: index % 2 ? "ADMIN" as const : "USER" as const, body: `Message ${index}`, createdAt: at(80) })) } } });
    await prisma.supportTicket.create({ data: { reference: `JITM-STREAM-${suffix}-2`, workspaceId, requesterUserId: owner.id, title: "Billing", category: "ACCOUNT", createdAt: at(1) } });
    await prisma.supportTicket.create({ data: { reference: `JITM-STREAM-${suffix}-3`, workspaceId, requesterUserId: memberId, title: "Member ticket", category: "GENERAL" } });

    // Reminders: two devices, one with more receipts than a page; the member's stay out.
    await prisma.notificationDelivery.createMany({ data: [
      { workspaceId, userId: owner.id, kind: "DAILY_DIGEST", localDate: "2026-01-05", status: "DELIVERED", createdAt: at(1) },
      { workspaceId, userId: owner.id, kind: "DUE_PUSH", localDate: "2026-01-05", createdAt: at(1) },
      { workspaceId, userId: memberId, kind: "WEEKLY_REPORT", localDate: "2026-01-05" }
    ] });
    const phone = await prisma.pushSubscription.create({ data: { workspaceId, userId: owner.id, endpoint: `https://push.invalid/${suffix}/phone`, p256dh: "key", auth: "secret", userAgent: "Phone", createdAt: at(1) } });
    const laptop = await prisma.pushSubscription.create({ data: { workspaceId, userId: owner.id, endpoint: `https://push.invalid/${suffix}/laptop`, p256dh: "key", auth: "secret", userAgent: "Laptop", createdAt: at(1) } });
    await prisma.pushSubscription.create({ data: { workspaceId, userId: memberId, endpoint: `https://push.invalid/${suffix}/member`, p256dh: "key", auth: "secret" } });
    await prisma.followUpPushDelivery.createMany({ data: [
      ...[j1, j2, jumps[2].id, j4].map((jumpId, index) => ({ id: `stream-${suffix}-push-${index}`, workspaceId, subscriptionId: phone.id, jumpId, scheduledAt: at(10), status: index ? "PENDING" as const : "DELIVERED" as const, deliveredAt: index ? null : at(15), createdAt: at(90) })),
      { id: `stream-${suffix}-push-laptop`, workspaceId, subscriptionId: laptop.id, jumpId: j1, scheduledAt: at(10), createdAt: at(90) }
    ] });
    await prisma.referralAccessInvite.createMany({ data: [
      { workspaceId, inviterUserId: owner.id, contactId: c1, recipientEmail: "avery@example.com", tokenHash: `stream-invite-${suffix}-1`, tokenCiphertext: "test-only", createdAt: at(1) },
      { workspaceId, inviterUserId: owner.id, contactId: c2, recipientPhone: "+1 555 010 0102", manualDelivery: true, tokenHash: `stream-invite-${suffix}-2`, tokenCiphertext: "test-only", createdAt: at(1) },
      { workspaceId, inviterUserId: memberId, recipientEmail: "member-invite@example.com", tokenHash: `stream-invite-${suffix}-3`, tokenCiphertext: "test-only" }
    ] });
    const intake = await prisma.intakeConnection.create({ data: { workspaceId, name: "Website form", kind: "WEBSITE", tokenHash: `stream-intake-${suffix}`, tokenEncrypted: "test-only", createdAt: at(1) } });
    await prisma.intakeReceipt.createMany({ data: [0, 1].map((index) => ({ connectionId: intake.id, eventKey: `stream-receipt-${index}`, payloadHash: `hash-${index}`, status: "ACCEPTED", contactId: c1, payload: { name: "Avery", message: `Inquiry ${index}` }, createdAt: at(1) })) });
    await prisma.intakeIdentity.createMany({ data: [c1, c2, c3].map((contactId, index) => ({ connectionId: intake.id, externalId: `external-${index}`, contactId })) });
  });

  afterAll(async () => {
    if (owner) await clearRateLimit("account.export", [owner.id]);
    await prisma.supportTicket.deleteMany({ where: { workspaceId: { in: [workspaceId, neighbourWorkspaceId].filter(Boolean) } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, neighbourWorkspaceId].filter(Boolean) } } });
    if (sharedMixId) await prisma.sharedMix.delete({ where: { id: sharedMixId } });
    await prisma.user.deleteMany({ where: { id: { in: [owner?.id, memberId, neighbourId].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  it("streams the same document the buffered export built, in the same section order", async () => {
    const reference = normalised(await bufferedExport(owner, workspaceId));
    // Every section and every grouped section holds data, so the comparison cannot pass on empty lists.
    const empty: string[] = [];
    for (const [key, value] of Object.entries(reference)) {
      if (value === null || (Array.isArray(value) && !value.length)) empty.push(key);
      else if (typeof value === "object" && !Array.isArray(value)) {
        for (const [inner, item] of Object.entries(value as Document)) if (item === null || (Array.isArray(item) && !item.length)) empty.push(`${key}.${inner}`);
      }
    }
    expect(empty).toEqual([]);

    const response = await exportAccount(new Request("https://local.invalid/api/account/export"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="jump-in-the-mix-personal-data-\d{4}-\d{2}-\d{2}\.json"$/);
    const text = await response.text();
    expect(text).not.toMatch(/\n|": /);
    const streamed = normalised(JSON.parse(text) as Document);
    expect(Object.keys(streamed)).toEqual(Object.keys(reference));
    // Shared definitions are collected while the instances are written, so they now follow them.
    expect(Object.keys(streamed.mixWorkflow as Document)).toEqual(["configuration", "instances", "definitions"]);
    expect(streamed).toStrictEqual(reference);
    expect((streamed.followUpAttempts as Array<{ recipient: string }>).map((attempt) => attempt.recipient)).toEqual(["+1 555 010 0101", "+1 555 010 0101"]);
    expect((streamed.mixWorkflow as { definitions: Array<{ id: string }> }).definitions.map((definition) => definition.id)).toEqual([expect.stringMatching(/^[0-9a-f]{16}$/), expect.stringMatching(/^[0-9a-f]{16}$/)]);
  });

  it("gives the same document when every page holds two rows, and reads nothing without a page limit", async () => {
    const reference = normalised(await bufferedExport(owner, workspaceId));
    const reads: Read[] = [];
    const body = await openAccountExport({ user: owner, workspaceId, exportedAt: new Date(), db: recording(reads), pageSize: 2 });
    const { text, error } = await readAll(body);
    expect(error).toBeNull();
    expect(normalised(JSON.parse(text) as Document)).toStrictEqual(reference);

    const lists = reads.filter((read) => read.operation === "findMany");
    for (const read of lists) expect(typeof read.take === "number" && read.take >= 1 && read.take <= 2, `${read.model} read ${String(read.take)} rows`).toBe(true);
    expect(reads.filter((read) => read.operation !== "findMany").map((read) => `${read.model}.${read.operation}`).sort()).toEqual([
      "AutomationPreference.findUnique", "JourneyPreference.findUnique", "MarketplaceAuthor.findUnique", "MixWorkflow.findUnique", "NotificationPreference.findUnique",
      "UserPreference.findUnique", "WorkspaceMarketingPreference.findUnique", "WorkspacePreference.findUnique", "WorkspaceProfile.findUnique"
    ]);
    const count = (model: string) => lists.filter((read) => read.model === model).length;
    expect(count("Contact")).toBe(3); // 2 + 2 + 1
    expect(count("JumpDraft")).toBe(3); // 2 + 2 + an empty page; the family tie-break crosses the first boundary
    expect(count("ContactGroupMembership")).toBe(4); // Neighbors: 2 + 2 + empty; Clients: 1
    expect(count("MixAssignment")).toBe(5); // Estimate follow-up: 2 + 2 + empty; the other two Mixes: one empty read each
    expect(count("JourneyRule")).toBe(4); // New: 2 + 1; Quoted: 1; Won: one empty read
    expect(count("FollowUpPushDelivery")).toBe(4); // phone: 2 + 2 + empty; laptop: 1
    expect(count("SupportTicketMessage")).toBe(4); // first ticket: 2 + 2 + empty; second: one empty read
    expect(count("StepVersion")).toBe(4); // Estimate check: 2 + 1; the other two templates: 1 each
  });

  it("reads bounded pages by default, with smaller pages for sections that carry documents", async () => {
    const reads: Read[] = [];
    const { error } = await readAll(await openAccountExport({ user: owner, workspaceId, exportedAt: new Date(), db: recording(reads) }));
    expect(error).toBeNull();
    const takes = new Map(reads.filter((read) => read.operation === "findMany").map((read) => [read.model, read.take]));
    for (const [model, take] of takes) expect(typeof take === "number" && take >= 1 && take <= EXPORT_PAGE_ROWS, `${model} read ${String(take)} rows`).toBe(true);
    expect(takes.get("Contact")).toBe(EXPORT_PAGE_ROWS);
    expect(takes.get("Jump")).toBe(200);
    expect(takes.get("MixWorkflowInstance")).toBe(100);
    expect(takes.get("ContactImportBatch")).toBe(10);
  });

  it("errors the stream when a read fails after the first byte, so the download fails instead of saving a partial file", async () => {
    const reads: Read[] = [];
    const body = await openAccountExport({ user: owner, workspaceId, exportedAt: new Date(), db: recording(reads, "Jump") });
    const { text, error } = await readAll(body);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Jump read failed");
    expect(text.startsWith('{"format":"jump-in-the-mix-personal-export"')).toBe(true);
    expect(() => JSON.parse(text)).toThrow();
    // Through a Response, as the route returns it, the body rejects rather than resolving to truncated text.
    const failing = await openAccountExport({ user: owner, workspaceId, exportedAt: new Date(), db: recording([], "Jump") });
    await expect(new Response(failing).text()).rejects.toThrow();
  });

  it("fails before the response starts when the first read fails", async () => {
    await expect(openAccountExport({ user: owner, workspaceId, exportedAt: new Date(), db: recording([], "AuthIdentity") })).rejects.toThrow("AuthIdentity read failed");
  });

  it("stops reading when the download is cancelled", async () => {
    const everything: Read[] = [];
    await readAll(await openAccountExport({ user: owner, workspaceId, exportedAt: new Date(), db: recording(everything), pageSize: 1 }));
    const reads: Read[] = [];
    const reader = (await openAccountExport({ user: owner, workspaceId, exportedAt: new Date(), db: recording(reads), pageSize: 1 })).getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel();
    const readsWhenCancelled = reads.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(reads.length).toBe(readsWhenCancelled);
    expect(readsWhenCancelled).toBeLessThan(everything.length / 2);
  });
});
