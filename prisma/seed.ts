import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { generateJumps } from "../src/lib/jump-engine";

const demoMode = (process.env.DEMO_MODE ?? "true").toLowerCase() === "true";
const demoEmail = process.env.DEMO_USER_EMAIL ?? "demo@jumpinthemix.local";
const demoPassword = process.env.DEMO_USER_PASSWORD ?? "JumpInTheMix123!";

const systemDateTypes = [
  ["system_birthday", "Birthday", "birthday"],
  ["system_anniversary", "Anniversary", "anniversary"],
  ["system_follow_up", "Follow-up", "follow-up"],
  ["system_renewal", "Renewal", "renewal"],
  ["system_appointment", "Appointment", "appointment"],
  ["system_event", "Event", "event"],
  ["system_referral", "Referral", "referral"],
  ["system_closed_deal", "Closed Deal", "closed-deal"]
] as const;

function atNoon(offsetDays: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

async function seedSystemData() {
  for (const [id, name, slug] of systemDateTypes) {
    await prisma.dateType.upsert({
      where: { scopeKey_slug: { scopeKey: "system", slug } },
      create: { id, scopeKey: "system", name, slug, isSystem: true, isActive: true },
      update: { name, isSystem: true, isActive: true }
    });
  }

  const shared = [
    {
      id: "shared_new_lead",
      title: "New Lead Follow-Up",
      description: "A warm five-touch sequence for responding to a new inquiry without sounding aggressive.",
      category: "Sales",
      industry: null,
      framework: "Question-Led Consultative",
      durationDays: 12,
      steps: [
        { channel: "EMAIL", dayOffset: 0, subject: "A quick question for {{Company}}" },
        { channel: "SMS", dayOffset: 2 },
        { channel: "PHONE_CALL", dayOffset: 4 },
        { channel: "EMAIL", dayOffset: 7 },
        { channel: "SMS", dayOffset: 12 }
      ]
    },
    {
      id: "shared_referral",
      title: "Referral Outreach",
      description: "A simple sequence for acknowledging the introduction and following up with the new prospect.",
      category: "Networking",
      industry: null,
      framework: "Relationship Nurture",
      durationDays: 9,
      steps: [
        { channel: "SMS", dayOffset: 0 },
        { channel: "EMAIL", dayOffset: 2 },
        { channel: "PHONE_CALL", dayOffset: 5 },
        { channel: "SMS", dayOffset: 9 }
      ]
    }
  ];

  for (const item of shared) {
    await prisma.sharedMix.upsert({
      where: { id: item.id },
      create: { ...item, status: "APPROVED" },
      update: { title: item.title, description: item.description, category: item.category, industry: item.industry, framework: item.framework, durationDays: item.durationDays, steps: item.steps, status: "APPROVED" }
    });
  }
}

async function seedDemoWorkspace() {
  const existingUser = await prisma.user.findUnique({ where: { email: demoEmail }, include: { ownedWorkspaces: true } });
  const resetDemo = (process.env.RESET_DEMO_DATA ?? "false").toLowerCase() === "true";
  if (existingUser && !resetDemo) {
    console.log("Demo workspace already exists; preserving local changes.");
    return;
  }
  if (existingUser) {
    for (const workspace of existingUser.ownedWorkspaces) await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: existingUser.id } });
  }

  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const user = await prisma.user.create({ data: { id: "demo_user", email: demoEmail, name: "Demo Owner", passwordHash, emailVerifiedAt: new Date() } });
  const workspace = await prisma.workspace.create({
    data: {
      id: "demo_workspace",
      name: "BrightPath Studio",
      slug: "brightpath-demo",
      ownerId: user.id,
      planTier: "PLUS",
      subscriptionStatus: "ACTIVE",
      members: { create: { id: "demo_member", userId: user.id, role: "OWNER" } },
      profile: {
        create: {
          company: "BrightPath Studio",
          industry: "Professional Services",
          primaryGoal: "Stay connected with clients",
          product1: "Business Growth Consulting",
          smsSignature: "— BrightPath Studio",
          emailSignature: "Demo Owner\nBrightPath Studio",
          timezone: "America/New_York",
          onboardingStep: 5,
          onboardingDone: true
        }
      },
      groups: {
        create: [
          { id: "demo_group_leads", name: "Leads", description: "People considering our services." },
          { id: "demo_group_clients", name: "Clients", description: "Active client relationships." },
          { id: "demo_group_referrals", name: "Referrals", description: "Introductions from our network." }
        ]
      }
    }
  });

  await prisma.contact.create({
    data: {
      id: "demo_contact_sarah",
      workspaceId: workspace.id,
      firstName: "Sarah",
      lastName: "Chen",
      displayName: "Sarah Chen",
      company: "Northstar Design",
      publicNotes: "Introduced by a long-term client.",
      source: "MANUAL",
      emails: { create: { email: "sarah@example.com", normalized: "sarah@example.com", isPrimary: true, label: "Work" } },
      phones: { create: { phone: "+1 555 010 1001", normalized: "15550101001", isPrimary: true, label: "Mobile" } },
      groupMemberships: { create: [{ groupId: "demo_group_referrals" }, { groupId: "demo_group_leads" }] }
    }
  });
  await prisma.contact.create({
    data: {
      id: "demo_contact_marcus",
      workspaceId: workspace.id,
      firstName: "Marcus",
      lastName: "Reed",
      displayName: "Marcus Reed",
      company: "Northline Construction",
      source: "MANUAL",
      emails: { create: { email: "marcus@example.com", normalized: "marcus@example.com", isPrimary: true, label: "Work" } },
      phones: { create: { phone: "+1 555 010 1002", normalized: "15550101002", isPrimary: true, label: "Mobile" } },
      groupMemberships: { create: { groupId: "demo_group_clients" } }
    }
  });
  await prisma.contact.create({
    data: {
      id: "demo_contact_elena",
      workspaceId: workspace.id,
      firstName: "Elena",
      lastName: "Torres",
      displayName: "Elena Torres",
      company: "Torres Events",
      source: "MANUAL",
      emails: { create: { email: "elena@example.com", normalized: "elena@example.com", isPrimary: true, label: "Work" } },
      phones: { create: { phone: "+1 555 010 1003", normalized: "15550101003", isPrimary: true, label: "Mobile" } },
      groupMemberships: { create: { groupId: "demo_group_clients" } }
    }
  });

  const followUp = await prisma.dateType.findUniqueOrThrow({ where: { id: "system_follow_up" } });
  await prisma.jumpDate.createMany({
    data: [
      { id: "demo_date_sarah", workspaceId: workspace.id, contactId: "demo_contact_sarah", dateTypeId: followUp.id, dateValue: atNoon(0), month: atNoon(0).getMonth() + 1, day: atNoon(0).getDate(), recurrence: "NONE", timezone: "America/New_York", label: "Referral follow-up" },
      { id: "demo_date_marcus", workspaceId: workspace.id, contactId: "demo_contact_marcus", dateTypeId: followUp.id, dateValue: atNoon(-2), month: atNoon(-2).getMonth() + 1, day: atNoon(-2).getDate(), recurrence: "NONE", timezone: "America/New_York", label: "Renewal conversation" },
      { id: "demo_date_elena", workspaceId: workspace.id, contactId: "demo_contact_elena", dateTypeId: followUp.id, dateValue: atNoon(1), month: atNoon(1).getMonth() + 1, day: atNoon(1).getDate(), recurrence: "NONE", timezone: "America/New_York", label: "Client check-in" }
    ]
  });

  await prisma.mix.create({
    data: {
      id: "demo_mix_relationship",
      workspaceId: workspace.id,
      name: "Warm Relationship Follow-Up",
      description: "A short, question-led sequence that makes it easy to reconnect without sounding pushy.",
      framework: "Question-Led Consultative",
      category: "Business",
      triggerMode: "DATE_TRIGGERED",
      dateTypeId: followUp.id,
      status: "ACTIVE",
      durationDays: 7,
      source: "DEMO"
    }
  });

  const stepData = [
    { templateId: "demo_step_sms", versionId: "demo_step_sms_v1", mixStepId: "demo_mix_step_1", name: "Warm text opener", channel: "SMS" as const, dayOffset: 0, body: "Hi {{First Name}}, what would be most useful to revisit from our last conversation? {{SMS Signature}}" },
    { templateId: "demo_step_call", versionId: "demo_step_call_v1", mixStepId: "demo_mix_step_2", name: "Discovery call", channel: "PHONE_CALL" as const, dayOffset: 2, script: "Ask what has changed since the last conversation, what outcome matters now, and what is getting in the way." },
    { templateId: "demo_step_email", versionId: "demo_step_email_v1", mixStepId: "demo_mix_step_3", name: "Helpful close-the-loop email", channel: "EMAIL" as const, dayOffset: 5, subject: "Worth revisiting, {{First Name}}?", body: "Hi {{First Name}}, I wanted to close the loop. Would a brief conversation about {{My Product 1}} be useful, or is the timing not right?\n\n{{Email Signature}}" }
  ];

  for (const [index, item] of stepData.entries()) {
    await prisma.stepTemplate.create({ data: { id: item.templateId, workspaceId: workspace.id, name: item.name, channel: item.channel } });
    await prisma.stepVersion.create({ data: { id: item.versionId, stepTemplateId: item.templateId, version: 1, subject: item.subject ?? null, body: item.body ?? null, script: item.script ?? null } });
    await prisma.mixStep.create({ data: { id: item.mixStepId, mixId: "demo_mix_relationship", stepVersionId: item.versionId, dayOffset: item.dayOffset, sortOrder: index + 1 } });
  }

  for (const contactId of ["demo_contact_sarah", "demo_contact_marcus", "demo_contact_elena"]) {
    await prisma.mixAssignment.create({ data: { assignmentKey: `${workspace.id}:demo_mix_relationship:${contactId}`, workspaceId: workspace.id, mixId: "demo_mix_relationship", contactId } });
  }

  await generateJumps({ workspaceId: workspace.id });
}

async function main() {
  await seedSystemData();
  if (demoMode) await seedDemoWorkspace();
  console.log("Seed complete.");
  if (demoMode) console.log(`Demo login: ${demoEmail} / ${demoPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
