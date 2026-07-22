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
      description: "A warm, question-led five-Jump sequence for responding to a new inquiry without sounding aggressive.",
      category: "Sales & Prospecting",
      industry: "General / Other",
      framework: "Question-Led Consultative",
      triggerMode: "MANUAL_START" as const,
      dateTypeName: null,
      dateTypeSlug: null,
      durationDays: 12,
      featured: true,
      steps: [
        {
          name: "Helpful first response",
          channel: "EMAIL",
          dayOffset: 0,
          sendTimeMinutes: 540,
          subject: "A quick question for {{Company}}",
          body: "Hi {{First Name}},\n\nThanks for reaching out. Before I make assumptions, what would be most useful for you to improve or solve right now?\n\n{{Email Signature}}"
        },
        {
          name: "Permission-based text",
          channel: "SMS",
          dayOffset: 2,
          sendTimeMinutes: 600,
          body: "Hi {{First Name}}, I wanted to make sure my note reached you. Would it be helpful to compare a few options, or is the timing not right? {{SMS Signature}}"
        },
        {
          name: "Discovery call",
          channel: "PHONE_CALL",
          dayOffset: 4,
          sendTimeMinutes: 660,
          script: "Ask what prompted the inquiry, what outcome matters most, what they have already tried, and what would make a next conversation worthwhile."
        },
        {
          name: "Useful perspective",
          channel: "EMAIL",
          dayOffset: 7,
          sendTimeMinutes: 540,
          subject: "One useful thought, {{First Name}}",
          body: "Hi {{First Name}},\n\nOne pattern I often see is that the real constraint is not a lack of options—it is deciding which tradeoff matters most. What would you need to feel confident about a next step?\n\n{{Email Signature}}"
        },
        {
          name: "Close the loop",
          channel: "SMS",
          dayOffset: 12,
          sendTimeMinutes: 600,
          body: "Hi {{First Name}}, should I keep this conversation open, or would it be better for me to close the loop for now? {{SMS Signature}}"
        }
      ]
    },
    {
      id: "shared_referral",
      title: "Referral Introduction Follow-Up",
      description: "A relationship-first sequence for acknowledging an introduction and creating a comfortable next step with the referred Contact.",
      category: "Events & Networking",
      industry: "General / Other",
      framework: "Relationship Nurture",
      triggerMode: "DATE_TRIGGERED" as const,
      dateTypeName: "Referral",
      dateTypeSlug: "referral",
      durationDays: 9,
      featured: false,
      steps: [
        {
          name: "Warm introduction text",
          channel: "SMS",
          dayOffset: 0,
          sendTimeMinutes: 600,
          body: "Hi {{First Name}}, I appreciated the introduction and wanted to say hello directly. What would make our conversation most useful for you? {{SMS Signature}}"
        },
        {
          name: "Context email",
          channel: "EMAIL",
          dayOffset: 2,
          sendTimeMinutes: 540,
          subject: "Following up on our introduction",
          body: "Hi {{First Name}},\n\nI am glad we were introduced. I would rather understand your priorities than send a generic overview. What are you hoping to improve, protect, or plan for next?\n\n{{Email Signature}}"
        },
        {
          name: "Introduction call",
          channel: "PHONE_CALL",
          dayOffset: 5,
          sendTimeMinutes: 660,
          script: "Thank the Contact for taking the call. Ask what made the introduction timely, what they would like to be different, and whether a second conversation would be useful."
        },
        {
          name: "Respectful follow-through",
          channel: "SMS",
          dayOffset: 9,
          sendTimeMinutes: 600,
          body: "Hi {{First Name}}, I wanted to respect your timing. Would a brief conversation still be useful, or should we reconnect another time? {{SMS Signature}}"
        }
      ]
    },
    {
      id: "shared_client_onboarding",
      title: "New Client Onboarding",
      description: "A clear, reassuring onboarding Mix that confirms expectations, reduces uncertainty, and creates an early success moment.",
      category: "Client Success / Retention",
      industry: "Coaching / Consulting",
      framework: "Expectation Alignment",
      triggerMode: "MANUAL_START" as const,
      dateTypeName: null,
      dateTypeSlug: null,
      durationDays: 7,
      featured: true,
      steps: [
        {
          name: "Welcome email",
          channel: "EMAIL",
          dayOffset: 0,
          sendTimeMinutes: 540,
          subject: "Welcome, {{First Name}} — here is what happens next",
          body: "Hi {{First Name}},\n\nWelcome. I am excited to support you. Our first priority is {{My Product 1}}. What would make the first week feel like meaningful progress for you?\n\n{{Email Signature}}"
        },
        {
          name: "First-day check-in",
          channel: "SMS",
          dayOffset: 1,
          sendTimeMinutes: 600,
          body: "Hi {{First Name}}, how is the first step feeling so far? Is anything unclear or harder than expected? {{SMS Signature}}"
        },
        {
          name: "Expectation alignment call",
          channel: "PHONE_CALL",
          dayOffset: 3,
          sendTimeMinutes: 660,
          script: "Confirm the desired outcome, define what success looks like, identify likely obstacles, and agree on the next measurable action."
        },
        {
          name: "Week-one recap",
          channel: "EMAIL",
          dayOffset: 7,
          sendTimeMinutes: 540,
          subject: "Your first-week recap",
          body: "Hi {{First Name}},\n\nYou have completed the first week. What feels clearer now, and where would a little more support create the biggest improvement?\n\n{{Email Signature}}"
        }
      ]
    },
    {
      id: "shared_renewal_checkin",
      title: "Renewal Value Check-In",
      description: "A calm renewal sequence that surfaces value, concerns, and next priorities before asking for a decision.",
      category: "Client Success / Retention",
      industry: "General / Other",
      framework: "Value Review",
      triggerMode: "DATE_TRIGGERED" as const,
      dateTypeName: "Renewal",
      dateTypeSlug: "renewal",
      durationDays: 21,
      featured: false,
      steps: [
        {
          name: "Early value review",
          channel: "EMAIL",
          dayOffset: -21,
          sendTimeMinutes: 540,
          subject: "Before your renewal, {{First Name}}",
          body: "Hi {{First Name}},\n\nBefore your renewal, I would like to make sure our work is still aligned with what matters most. What has created the most value, and what would you want improved next?\n\n{{Email Signature}}"
        },
        {
          name: "Renewal conversation",
          channel: "PHONE_CALL",
          dayOffset: -14,
          sendTimeMinutes: 660,
          script: "Review outcomes achieved, ask what still feels unresolved, confirm next priorities, and discuss whether the current relationship remains the right fit."
        },
        {
          name: "Decision support text",
          channel: "SMS",
          dayOffset: -7,
          sendTimeMinutes: 600,
          body: "Hi {{First Name}}, as you consider the renewal, is there any question or concern I can help clarify? {{SMS Signature}}"
        },
        {
          name: "Renewal day note",
          channel: "EMAIL",
          dayOffset: 0,
          sendTimeMinutes: 540,
          subject: "Your renewal is ready",
          body: "Hi {{First Name}},\n\nYour renewal date is here. Based on our conversation, does continuing feel like the right next step? I am available if one final question would help.\n\n{{Email Signature}}"
        }
      ]
    }
  ];

  for (const item of shared) {
    await prisma.sharedMix.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        industry: item.industry,
        framework: item.framework,
        durationDays: item.durationDays,
        steps: item.steps,
        status: "APPROVED"
      },
      update: {
        title: item.title,
        description: item.description,
        category: item.category,
        industry: item.industry,
        framework: item.framework,
        durationDays: item.durationDays,
        steps: item.steps,
        status: "APPROVED"
      }
    });
    await prisma.sharedMixMetadata.upsert({
      where: { sharedMixId: item.id },
      create: {
        sharedMixId: item.id,
        isPlatform: true,
        triggerMode: item.triggerMode,
        dateTypeName: item.dateTypeName,
        dateTypeSlug: item.dateTypeSlug,
        reviewState: "APPROVED",
        featuredAt: item.featured ? new Date() : null,
        publishedAt: new Date()
      },
      update: {
        isPlatform: true,
        triggerMode: item.triggerMode,
        dateTypeName: item.dateTypeName,
        dateTypeSlug: item.dateTypeSlug,
        reviewState: "APPROVED",
        featuredAt: item.featured ? new Date() : null,
        publishedAt: new Date()
      }
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
    for (const workspace of existingUser.ownedWorkspaces) {
      // SharedMixContributorProfile intentionally has no Workspace relation,
      // so it cannot participate in the Workspace cascade.
      await prisma.sharedMixContributorProfile.deleteMany({ where: { workspaceId: workspace.id } });
      await prisma.workspace.delete({ where: { id: workspace.id } });
    }
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

  await prisma.sharedMixContributorProfile.create({
    data: {
      workspaceId: workspace.id,
      enabled: true,
      displayName: "BrightPath Studio",
      title: "Business Growth Consulting",
      bio: "A demonstration contributor profile showing how approved Community Mixes credit their creator."
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
