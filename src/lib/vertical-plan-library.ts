import type { ReadyMadePlan } from "@/lib/plan-library-types";
import { SALES_PLANS } from "@/lib/sales-plan-library";
import { RELATIONSHIP_MIXES } from "@/lib/relationship-mix-library";
export type { ReadyMadePlan, ReadyMadePlanStep } from "@/lib/plan-library-types";

const VERTICAL_PLANS: ReadyMadePlan[] = [
  {
    id: "plan_home_job_done",
    title: "Job done: thank-you, review, and referral",
    description: "Thanks the customer, checks the work, then asks for a review and referral without feeling pushy.",
    category: "Past customers",
    industry: "Home services",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Follow-up",
    dateTypeSlug: "follow-up",
    durationDays: 7,
    featured: true,
    steps: [
      { name: "Thank-you text", channel: "SMS", dayOffset: 0, sendTimeMinutes: 1020, body: "Hi {{First Name}}, thanks for trusting {{My Company}} today. Is everything working the way you expected? If anything needs attention, just reply here. {{SMS Signature}}" },
      { name: "Review request", channel: "SMS", dayOffset: 2, sendTimeMinutes: 600, body: "Hi {{First Name}}, glad we could help. If you have a minute, would you leave a quick review? It really helps a local business like ours. {{SMS Signature}}" },
      { name: "Referral check-in", channel: "PHONE_CALL", dayOffset: 7, sendTimeMinutes: 660, script: "Make sure the work is still going well. If they are happy, thank them and ask them to keep you in mind when a friend or neighbor needs help." }
    ]
  },
  {
    id: "plan_home_estimate",
    title: "Estimate sent: gentle follow-up",
    description: "A two-day and seven-day nudge that makes it easy for a homeowner to ask questions.",
    category: "New customers",
    industry: "Home services",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Follow-up",
    dateTypeSlug: "follow-up",
    durationDays: 7,
    featured: false,
    steps: [
      { name: "Two-day text", channel: "SMS", dayOffset: 2, sendTimeMinutes: 600, body: "Hi {{First Name}}, just checking that you received the estimate from {{My Company}}. Any questions I can clear up for you? {{SMS Signature}}" },
      { name: "One-week call", channel: "PHONE_CALL", dayOffset: 7, sendTimeMinutes: 660, script: "Ask whether they received the estimate and whether the timing or scope has changed. Answer questions plainly; offer the next available appointment only if useful." }
    ]
  },
  {
    id: "plan_home_seasonal",
    title: "Seasonal maintenance reminder",
    description: "A helpful reminder before weather changes create an urgent service call.",
    category: "Past customers",
    industry: "Home services",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Follow-up",
    dateTypeSlug: "follow-up",
    durationDays: 5,
    featured: false,
    steps: [
      { name: "Maintenance reminder", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}, a quick seasonal reminder from {{My Company}}: now is a good time to check your system before the weather changes. Want help scheduling it? {{SMS Signature}}" },
      { name: "Helpful follow-up", channel: "EMAIL", dayOffset: 5, sendTimeMinutes: 540, subject: "A quick seasonal check for your home", body: "Hi {{First Name}},\n\nJust a friendly reminder to take care of seasonal maintenance before small issues turn into urgent ones. If you would like us to check it, reply with a day that works and we’ll make scheduling easy.\n\n{{Email Signature}}" }
    ]
  },
  {
    id: "plan_home_anniversary",
    title: "One-year service check-in",
    description: "Checks that last year’s work is holding up and keeps your business easy to remember.",
    category: "Past customers",
    industry: "Home services",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Anniversary",
    dateTypeSlug: "anniversary",
    durationDays: 0,
    featured: false,
    steps: [
      { name: "Anniversary text", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}, it’s been about a year since we helped at your home. Is everything still working well? We’re here if you need us. {{SMS Signature}}" }
    ]
  },
  {
    id: "plan_real_estate_new_lead",
    title: "New real-estate lead: five helpful touches",
    description: "Responds quickly, learns what matters, and stays available without crowding a new lead.",
    category: "New clients",
    industry: "Real estate",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Follow-up",
    dateTypeSlug: "follow-up",
    durationDays: 10,
    featured: true,
    steps: [
      { name: "Quick hello", channel: "SMS", dayOffset: 0, sendTimeMinutes: 540, body: "Hi {{First Name}}, thanks for reaching out. Are you hoping to buy, sell, or simply understand your options right now? {{SMS Signature}}" },
      { name: "Personal call", channel: "PHONE_CALL", dayOffset: 1, sendTimeMinutes: 660, script: "Ask about their timing, area, budget or home, and the one thing they most want help making simpler. Agree on one useful next step." },
      { name: "Useful recap", channel: "EMAIL", dayOffset: 3, sendTimeMinutes: 540, subject: "Your next step", body: "Hi {{First Name}},\n\nThanks for sharing what you’re looking for. I’ll keep the next step focused on your timing and priorities, and I’ll be direct when something is or isn’t a fit. Reply anytime if your plans change or a question comes up.\n\n{{Email Signature}}" },
      { name: "Open question", channel: "SMS", dayOffset: 6, sendTimeMinutes: 600, body: "Hi {{First Name}}, has anything changed in your plans, or is there one question I can research for you this week? {{SMS Signature}}" },
      { name: "Keep the door open", channel: "SMS", dayOffset: 10, sendTimeMinutes: 600, body: "Hi {{First Name}}, I don’t want to crowd you. I’m here when the timing is right—should I check back later, or can I help with something now? {{SMS Signature}}" }
    ]
  },
  {
    id: "plan_real_estate_contract",
    title: "Under-contract weekly update",
    description: "Keeps clients calm with a clear weekly update until closing.",
    category: "Active clients",
    industry: "Real estate",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Follow-up",
    dateTypeSlug: "follow-up",
    durationDays: 7,
    featured: false,
    steps: [
      { name: "Weekly update email", channel: "EMAIL", dayOffset: 0, sendTimeMinutes: 540, subject: "This week on your home", body: "Hi {{First Name}},\n\nHere is your weekly update: [what is complete], [what happens next], and [anything I need from you]. We are still working toward [closing date]. Reply or call if you want to walk through any detail.\n\n{{Email Signature}}" },
      { name: "Friday check-in", channel: "SMS", dayOffset: 4, sendTimeMinutes: 900, body: "Hi {{First Name}}, before the weekend, is there anything about the transaction you want me to explain or double-check? {{SMS Signature}}" }
    ]
  },
  {
    id: "plan_real_estate_closing",
    title: "Closing anniversary",
    description: "Celebrates the closing date and creates a natural moment to reconnect.",
    category: "Past clients",
    industry: "Real estate",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Closed Deal",
    dateTypeSlug: "closed-deal",
    durationDays: 3,
    featured: false,
    steps: [
      { name: "Anniversary note", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Happy closing anniversary, {{First Name}}! I hope the home has treated you well. How are things going? {{SMS Signature}}" },
      { name: "Offer a home update", channel: "EMAIL", dayOffset: 3, sendTimeMinutes: 540, subject: "Curious what your home may be worth?", body: "Hi {{First Name}},\n\nYour closing anniversary made me think of you. If you’re curious, I’d be happy to put together a simple update on nearby sales and what your home may be worth—no sales pitch and no obligation.\n\n{{Email Signature}}" }
    ]
  },
  {
    id: "plan_real_estate_neighbor",
    title: "Just listed or sold: neighbor note",
    description: "Lets nearby homeowners know what happened and offers useful local context.",
    category: "Neighborhood",
    industry: "Real estate",
    framework: "Ready-made",
    triggerMode: "MANUAL_START",
    dateTypeName: null,
    dateTypeSlug: null,
    durationDays: 4,
    featured: false,
    steps: [
      { name: "Neighbor email", channel: "EMAIL", dayOffset: 0, sendTimeMinutes: 540, subject: "A quick neighborhood update", body: "Hi {{First Name}},\n\nA nearby home was just [listed/sold], and I thought you might appreciate the local update. If you’re curious what it means for your own home or the neighborhood, I’m happy to share the details.\n\n{{Email Signature}}" },
      { name: "Short check-in", channel: "SMS", dayOffset: 4, sendTimeMinutes: 600, body: "Hi {{First Name}}, want the quick details on the nearby home that just [listed/sold]? Happy to send them over. {{SMS Signature}}" }
    ]
  },
  {
    id: "plan_real_estate_birthday",
    title: "Past-client birthday",
    description: "A warm birthday note with no business ask attached.",
    category: "Past clients",
    industry: "Real estate",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Birthday",
    dateTypeSlug: "birthday",
    durationDays: 0,
    featured: false,
    steps: [{ name: "Birthday text", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Happy birthday, {{First Name}}! Hope you have a wonderful day and a great year ahead. {{SMS Signature}}" }]
  },
  {
    id: "plan_insurance_quote",
    title: "Quote sent: clear next steps",
    description: "Confirms the quote arrived and makes questions easy before following up once more.",
    category: "New clients",
    industry: "Insurance & finance",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Follow-up",
    dateTypeSlug: "follow-up",
    durationDays: 7,
    featured: true,
    steps: [
      { name: "Quote received", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}, I sent your quote. Did it come through, and is there anything you’d like me to explain in plain language? {{SMS Signature}}" },
      { name: "Questions call", channel: "PHONE_CALL", dayOffset: 3, sendTimeMinutes: 660, script: "Ask what questions came up, explain the main protection and cost tradeoffs plainly, and confirm whether their needs or timing changed." },
      { name: "Leave the door open", channel: "EMAIL", dayOffset: 7, sendTimeMinutes: 540, subject: "Any questions about your quote?", body: "Hi {{First Name}},\n\nI wanted to make sure you have what you need to make a comfortable decision. I’m happy to adjust the quote or explain any part of it. If the timing isn’t right, that’s completely fine too—just let me know.\n\n{{Email Signature}}" }
    ]
  },
  {
    id: "plan_insurance_review",
    title: "Annual coverage review",
    description: "Checks for life changes before renewal so coverage stays useful and current.",
    category: "Current clients",
    industry: "Insurance & finance",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Renewal",
    dateTypeSlug: "renewal",
    durationDays: 10,
    featured: false,
    steps: [
      { name: "Review invitation", channel: "EMAIL", dayOffset: -10, sendTimeMinutes: 540, subject: "A quick coverage check before renewal", body: "Hi {{First Name}},\n\nBefore your renewal, let’s make sure your coverage still fits. Have there been changes to your home, vehicles, family, work, or plans this year? Reply with anything new and I’ll flag what is worth reviewing.\n\n{{Email Signature}}" },
      { name: "Renewal reminder", channel: "SMS", dayOffset: -3, sendTimeMinutes: 600, body: "Hi {{First Name}}, your renewal is coming up. Any life changes or questions we should review first? {{SMS Signature}}" }
    ]
  },
  {
    id: "plan_insurance_claim",
    title: "Claim follow-through",
    description: "Checks on a client after a claim and makes sure they know the next step.",
    category: "Current clients",
    industry: "Insurance & finance",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Follow-up",
    dateTypeSlug: "follow-up",
    durationDays: 7,
    featured: false,
    steps: [
      { name: "Next-day check", channel: "SMS", dayOffset: 1, sendTimeMinutes: 600, body: "Hi {{First Name}}, checking in after your claim. Do you know the next step, or is there something I can help untangle? {{SMS Signature}}" },
      { name: "One-week call", channel: "PHONE_CALL", dayOffset: 7, sendTimeMinutes: 660, script: "Ask how the claim is progressing, whether they are waiting on anyone, and whether any part of the process is unclear. Record the agreed next step." }
    ]
  },
  {
    id: "plan_generic_reconnect",
    title: "Went quiet: gentle reconnect",
    description: "A respectful two-touch check-in for any customer or lead who went quiet.",
    category: "Reconnect",
    industry: "Other",
    framework: "Ready-made",
    triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Follow-up",
    dateTypeSlug: "follow-up",
    durationDays: 7,
    featured: true,
    steps: [
      { name: "Friendly check-in", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}, just checking in. Is this still something you’d like help with, or has the timing changed? Either answer is completely fine. {{SMS Signature}}" },
      { name: "Close the loop", channel: "EMAIL", dayOffset: 7, sendTimeMinutes: 540, subject: "Should I keep this open?", body: "Hi {{First Name}},\n\nI don’t want to fill your inbox, so this will be my last note for now. If you still want help, reply whenever the timing is right and I’ll pick it up from there.\n\n{{Email Signature}}" }
    ]
  }
];

export const READY_MADE_PLANS: ReadyMadePlan[] = [...VERTICAL_PLANS, ...SALES_PLANS, ...RELATIONSHIP_MIXES];

export function starterPlanForBusinessType(businessType: string | null | undefined): ReadyMadePlan {
  const normalized = businessType?.toLowerCase() ?? "";
  const industry = normalized.includes("home") || /plumb|hvac|electric|trade/.test(normalized)
    ? "Home services"
    : normalized.includes("real estate")
      ? "Real estate"
      : /insurance|finance/.test(normalized)
        ? "Insurance & finance"
        : "Other";
  return READY_MADE_PLANS.find((plan) => plan.industry === industry && plan.featured) ?? READY_MADE_PLANS.find((plan) => plan.id === "plan_generic_reconnect")!;
}

export function starterPlanForMarketingScenario(scenarioId: string): ReadyMadePlan | null {
  const plans: Record<string, ReadyMadePlan> = {
    "real-estate": { id: "marketing_real_estate_later", title: "Reconnect at the agreed time", description: "Return to a possible move at the timing the person requested.", category: "New clients", industry: "Real estate", framework: "Ready-made", triggerMode: "DATE_TRIGGERED", dateTypeName: "Follow-up", dateTypeSlug: "follow-up", durationDays: 0, featured: false, steps: [{ name: "Review the later check-in", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}—you asked me to check back about a possible move. Is that still on your mind, or has the timing changed? {{SMS Signature}}" }] },
    consulting: { id: "marketing_consulting_milestone", title: "Revisit a business milestone", description: "Reconnect around the milestone discussed with a prospective client.", category: "New customers", industry: "Other", framework: "Ready-made", triggerMode: "DATE_TRIGGERED", dateTypeName: "Follow-up", dateTypeSlug: "follow-up", durationDays: 0, featured: false, steps: [{ name: "Review the milestone follow-up", channel: "EMAIL", dayOffset: 0, sendTimeMinutes: 540, subject: "Picking up our conversation", body: "Hi {{First Name}},\n\nWhen we spoke, you wanted to revisit this after your team milestone. Has that timing changed, or would it be useful to pick up the conversation?\n\n{{Email Signature}}" }] },
    photography: { id: "marketing_photography_inquiry", title: "Clarify an open inquiry", description: "Offer a useful clarification after sharing pricing.", category: "New customers", industry: "Other", framework: "Ready-made", triggerMode: "DATE_TRIGGERED", dateTypeName: "Follow-up", dateTypeSlug: "follow-up", durationDays: 0, featured: false, steps: [{ name: "Review the pricing follow-up", channel: "EMAIL", dayOffset: 0, sendTimeMinutes: 540, subject: "Any questions about the options?", body: "Hi {{First Name}},\n\nWhen we spoke, you were comparing the coverage options. Is there anything I can clarify to help you compare them?\n\n{{Email Signature}}" }] },
    painting: { id: "marketing_painting_estimate", title: "Follow up on an estimate", description: "Clarify the scope while the estimate is still under consideration.", category: "New customers", industry: "Home services", framework: "Ready-made", triggerMode: "DATE_TRIGGERED", dateTypeName: "Follow-up", dateTypeSlug: "follow-up", durationDays: 0, featured: false, steps: [{ name: "Review the estimate follow-up", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}—you mentioned comparing the smaller scope with the full project. Is there anything I can clarify about the two options? {{SMS Signature}}" }] },
    recruiting: { id: "marketing_recruiting_timing", title: "Reconnect at the candidate’s timing", description: "Respect a candidate's timing and preferred way to reconnect.", category: "Networking", industry: "Other", framework: "Ready-made", triggerMode: "DATE_TRIGGERED", dateTypeName: "Follow-up", dateTypeSlug: "follow-up", durationDays: 0, featured: false, steps: [{ name: "Review the candidate check-in", channel: "EMAIL", dayOffset: 0, sendTimeMinutes: 540, subject: "Is this still a useful time?", body: "Hi {{First Name}},\n\nYou asked me to reconnect after your planning cycle. Is this still a useful time for a conversation, or would you prefer to leave it for later?\n\n{{Email Signature}}" }] }
  };
  return plans[scenarioId] ?? null;
}

export function starterPlanForOnboarding(businessType: string | null | undefined, reason: string): ReadyMadePlan {
  const relationshipStarters: Record<string, { id: string; category: string; body: string }> = {
    "Check in with a friend": { id: "personal_check_in", category: "Personal connections", body: "Hi {{First Name}}, you crossed my mind and I wanted to check in. How have you been? {{SMS Signature}}" },
    "Reconnect personally": { id: "personal_reconnect", category: "Personal connections", body: "Hi {{First Name}}, it’s been a while! I’d love to catch up when you have a moment. How are things? {{SMS Signature}}" },
    "Follow up after an introduction": { id: "network_introduction", category: "Networking", body: "Hi {{First Name}}, I’m glad we connected. I’d love to continue our conversation when you have a moment. {{SMS Signature}}" },
    "Explore a partnership": { id: "network_partnership", category: "Networking", body: "Hi {{First Name}}, I’d love to compare notes and explore ways we could work together. Are you open to a conversation? {{SMS Signature}}" }
  };
  if (Object.hasOwn(relationshipStarters, reason)) {
    const starter = relationshipStarters[reason];
    return {
      id: starter.id, title: reason, description: "One thoughtful message to review and send on your chosen date.",
      category: starter.category, industry: "Other", framework: "Ready-made", triggerMode: "DATE_TRIGGERED",
      dateTypeName: "Follow-up", dateTypeSlug: "follow-up", durationDays: 1, featured: false,
      steps: [{ name: reason, channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: starter.body }]
    };
  }
  const plansByReason: Record<string, string> = {
    "Follow up about an estimate": "plan_home_estimate",
    "Follow up on a quote": "plan_home_estimate",
    "Follow up on an inquiry": "plan_generic_reconnect",
    "Reconnect with a lead": "plan_generic_reconnect",
    "Reconnect with someone": "plan_generic_reconnect",
    "Check in after the job": "plan_home_job_done",
    "Ask for a review": "plan_home_job_done",
    "Reconnect": "plan_generic_reconnect",
    "General follow-up": "plan_generic_reconnect"
  };
  const planId = plansByReason[reason];
  const businessPlan = starterPlanForBusinessType(businessType);
  const plan = READY_MADE_PLANS.find((item) => item.id === planId) ?? businessPlan;
  const reviewOnly = reason === "Ask for a review";
  const steps = reviewOnly ? plan.steps.slice(1) : plan.steps;
  // Onboarding asks when to follow up, not when the estimate or job happened.
  const firstOffset = steps[0].dayOffset;
  return {
    ...plan,
    industry: businessPlan.industry,
    ...(["Follow up about an estimate", "Follow up on a quote"].includes(reason) ? { description: "Check that the estimate arrived, then call five days later to answer questions." } : {}),
    ...(reviewOnly ? { title: "Review and referral follow-up", description: "Ask for a review, then follow up about referrals." } : {}),
    durationDays: plan.durationDays - firstOffset,
    steps: steps.map((step, index) => ({
      ...step,
      name: index === 0 && firstOffset > 0 ? "First follow-up" : step.name,
      dayOffset: step.dayOffset - firstOffset
    }))
  };
}
