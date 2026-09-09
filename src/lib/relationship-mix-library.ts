import type { ReadyMadePlan, ReadyMadePlanStep } from "@/lib/plan-library-types";

function relationshipMix(id: string, title: string, description: string, steps: ReadyMadePlanStep[]): ReadyMadePlan {
  return {
    id: `mix_relationship_${id}`, title, description,
    category: "Relationships", industry: "Any business", framework: "Relationships",
    triggerMode: "MANUAL_START", dateTypeName: null, dateTypeSlug: null,
    durationDays: Math.max(...steps.map(beat => beat.dayOffset)), featured: true, steps
  };
}

// Finite, editable starting points. Starting a mix never implies a recurring loop.
// Messages use one person's voice; call notes stay short and private to the caller.
export const RELATIONSHIP_MIXES: ReadyMadePlan[] = [
  relationshipMix("first_note", "The First Note", "Follow up after an introduction with a warm hello and room for a real conversation.", [
    { name: "A warm hello", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}, I’m glad we connected. I’d love to hear more about what you’re working on. {{SMS Signature}}" },
    { name: "Continue the conversation", channel: "EMAIL", dayOffset: 3, sendTimeMinutes: 600, subject: "Glad we connected", body: "Hi {{First Name}},\n\nI enjoyed connecting and would like to get to know you better. What’s something you’re looking forward to right now? If a quick catch-up would be useful, I’d be happy to find a time.\n\n{{Email Signature}}" }
  ]),
  relationshipMix("afterparty", "The Afterparty", "Keep a conversation going after an event, meetup, or social gathering.", [
    { name: "The next-day hello", channel: "SMS", dayOffset: 1, sendTimeMinutes: 600, body: "Hi {{First Name}}, it was good meeting you. I’d like to keep in touch—how did the rest of the event go? {{SMS Signature}}" },
    { name: "Make time to catch up", channel: "EMAIL", dayOffset: 7, sendTimeMinutes: 600, subject: "Keep the conversation going?", body: "Hi {{First Name}},\n\nI’m glad we had a chance to meet. If you’re up for it, I’d enjoy a quick coffee or call to continue our conversation. What would work for you?\n\n{{Email Signature}}" }
  ]),
  relationshipMix("stay_in_the_mix", "Stay in the Mix", "Make space for three thoughtful check-ins over three months, at your own pace.", [
    { name: "A little hello", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}, you crossed my mind today. How have you been? {{SMS Signature}}" },
    { name: "A personal catch-up", channel: "PHONE_CALL", dayOffset: 30, sendTimeMinutes: 660, script: "• Ask what’s new.\n• Listen for what matters right now.\n• Agree on a good time to check in again." },
    { name: "Keep the door open", channel: "EMAIL", dayOffset: 90, sendTimeMinutes: 600, subject: "A quick hello", body: "Hi {{First Name}},\n\nI wanted to check in and see how things are going. Anything new you’re excited about, or anything I can help with? I’d love to hear from you whenever you have a moment.\n\n{{Email Signature}}" }
  ]),
  relationshipMix("back_in_rhythm", "Back in Rhythm", "Reconnect after a quiet stretch without an awkward pitch or pressure to reply.", [
    { name: "Pick up where you left off", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}, it’s been a while. I’d love to catch up—how are things with you? {{SMS Signature}}" },
    { name: "Leave a little space", channel: "EMAIL", dayOffset: 14, sendTimeMinutes: 600, subject: "Whenever the timing is right", body: "Hi {{First Name}},\n\nJust leaving the door open after my note. I know life gets full. If you feel like catching up, I’d be glad to hear what’s new with you.\n\n{{Email Signature}}" }
  ]),
  relationshipMix("hand_off", "The Hand-Off", "Ask before making an introduction, then check that the connection was useful.", [
    { name: "Ask before introducing", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}, I have someone in mind you might enjoy meeting. Would you be open to an introduction? {{SMS Signature}}" },
    { name: "Follow through on the introduction", channel: "PHONE_CALL", dayOffset: 3, sendTimeMinutes: 660, script: "• Confirm both people want the introduction.\n• Share why the connection might help.\n• Agree on the best way to connect." },
    { name: "Check how it went", channel: "SMS", dayOffset: 10, sendTimeMinutes: 600, body: "Hi {{First Name}}, did you get a chance to connect after the introduction? Happy to help if you need anything. {{SMS Signature}}" }
  ]),
  relationshipMix("worth_sharing", "Something Worth Sharing", "Offer a useful resource without making an ask. Add your resource before sending.", [
    { name: "Share something useful", channel: "EMAIL", dayOffset: 0, sendTimeMinutes: 600, subject: "Thought this might be useful", body: "Hi {{First Name}},\n\nI came across something that made me think of you.\n\n[Add the resource and a sentence about why it may help.]\n\nNo need to reply—I just wanted to pass it along.\n\n{{Email Signature}}" }
  ]),
  relationshipMix("next_verse", "The Next Verse", "Recognize a milestone and stay interested in what comes next.", [
    { name: "Celebrate the milestone", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}, congratulations on your milestone! How are you feeling about what comes next? {{SMS Signature}}" },
    { name: "See how things are settling in", channel: "PHONE_CALL", dayOffset: 14, sendTimeMinutes: 660, script: "• Ask how the next chapter is going.\n• Listen for a win or a challenge.\n• Offer one useful way to help." }
  ])
];
