import { MARKETING_SCENARIOS, type MarketingScenarioId } from "./marketing-scenarios";

// Browser-only illustration; these dates do not change real starter Mix schedules.
export const DEMO_BEATS = [
  { channel: "text", label: "Text", icon: "message", day: 0, due: "Today", action: "Open text" },
  { channel: "email", label: "Email", icon: "email", day: 1, due: "Tomorrow", action: "Open email" },
  { channel: "phone", label: "Call", icon: "phone", day: 7, due: "In 1 week", action: "Call" }
] as const;
export type DemoSituation = { id: string; label: string; person: string; context: string; topic: string; text: string };
export const HOME_DEMO_SITUATIONS: readonly DemoSituation[] = [
  { id: "client", label: "A client check-in", person: "Alex Morgan", context: "Alex asked you to check back this week.", topic: "our next check-in", text: "Hi Alex, you asked me to check back this week. Is now a good time to pick up our conversation?" },
  { id: "personal", label: "A personal hello", person: "Sam Taylor", context: "It has been a while since you caught up.", topic: "finding a time to catch up", text: "Hi Sam, you crossed my mind today. How have you been? It would be lovely to catch up when you have a moment." },
  { id: "networking", label: "After meeting someone", person: "Jordan Lee", context: "You met Jordan at an event yesterday.", topic: "meeting for coffee", text: "Hi Jordan, it was great meeting you yesterday. I enjoyed hearing about your work. Would you like to grab a coffee next week?" }
];
// IDs preserve the existing allowlisted waitlist preference.
const professionSituations: Record<MarketingScenarioId, readonly [string, string, string, string][]> = {
  "real-estate": [
    ["not-ready", "Not ready yet", "Asked you to check back about a possible move.", "your plans for a possible move"],
    ["open-house", "After the open house", "You met at an open house and discussed what matters in a home.", "what you are looking for in a home"],
    ["after-closing", "After closing", "Recently moved in and is getting settled.", "how you are settling into your home"]
  ],
  consulting: [
    ["proposal-sent", "Proposal sent", "Is reviewing your proposal for improving the onboarding process.", "the onboarding proposal"],
    ["milestone", "Revisit a milestone", "Wanted to revisit onboarding after the new managers were hired.", "onboarding your new managers"],
    ["handover", "After the handover", "Your project has wrapped up and the team is using the new process.", "how the new process is working"],
    ["went-quiet", "Went quiet", "You discussed a project but have not caught up recently.", "the project we discussed"]
  ],
  photography: [
    ["pricing-sent", "Pricing sent", "Was comparing shorter coverage with the full-day package.", "the photography packages"],
    ["after-gallery", "After the gallery", "Has received the photo gallery and is choosing favorites.", "your photo gallery"],
    ["vendor-thanks", "Vendor thank-you", "You worked together at a recent event.", "the event we worked on together"]
  ],
  painting: [
    ["estimate-sent", "Estimate sent", "Was comparing painting the bedrooms with the full interior.", "the two options in your painting estimate"],
    ["deferred", "Waiting on the flooring", "Asked you to check back when the flooring work was finished.", "the timing of your painting project"],
    ["job-done", "Job done", "The painting is finished and you want to check how it looks.", "how the finished painting looks"]
  ],
  recruiting: [
    ["candidate-timing", "Candidate’s timing", "Asked you to reconnect after annual planning.", "your plans after annual planning"],
    ["client-plans", "Client’s hiring plans", "Wanted to revisit hiring once the budget was clearer.", "your hiring plans"],
    ["honest-update", "Honest update", "Is waiting for an update on the next stage of an interview.", "the next stage of your interview"]
  ]
};
export function demoSituations(scenarioId?: string): readonly DemoSituation[] {
  const persona = MARKETING_SCENARIOS.find(item => item.id === scenarioId);
  if (!persona) return HOME_DEMO_SITUATIONS;
  return professionSituations[persona.id].map(([id, label, context, topic]) => ({
    id, label, person: persona.person, context, topic,
    text: `Hi ${persona.person.split(" ")[0]}, I wanted to follow up on ${topic}. Is now a good time to pick up our conversation?`
  }));
}
export function demoDrafts(situation: DemoSituation) {
  const firstName = situation.person.split(" ")[0];
  return [
    { message: situation.text, subject: "" },
    { subject: `Following up on ${situation.topic}`, message: `Hi ${firstName},\n\nFollowing up on ${situation.topic}. Let me know if there is anything I can clarify, or if another time would work better for you.\n\nHappy to talk it through.\nJamie` },
    { subject: "", message: `• Ask ${firstName} if this is a good time to talk.\n• Catch up on ${situation.topic}.\n• Listen, answer questions, and agree on the next step.` }
  ];
}
export function demoContact(situation: DemoSituation) {
  return { initials: situation.person.split(" ").map(part => part[0]).join(""), phone: "(202) 555-0142", email: `${situation.person.toLowerCase().replaceAll(" ", ".")}@example.invalid` };
}
