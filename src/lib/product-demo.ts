// Deliberately obvious placeholder number and non-resolving domain.
// Visitors can replace these defaults for a temporary, browser-only demo.
// https://www.iana.org/assignments/special-use-domain-names
export const DEMO_CONTACT = {
  name: "Alex Example",
  phone: "+15555555555",
  phoneLabel: "1 (555) 555-5555",
  email: "alex@example.invalid"
} as const;

export type DemoContactDetails = { name: string; phone: string; email: string; notes: string; senderName: string };

export const DEMO_CONTACT_DEFAULTS: DemoContactDetails = {
  name: DEMO_CONTACT.name,
  phone: DEMO_CONTACT.phoneLabel,
  email: DEMO_CONTACT.email,
  notes: "Interested in a service visit. Prefers a text before calling.",
  senderName: "Jamie"
};

export function resolveDemoContact(values: DemoContactDetails): DemoContactDetails {
  return {
    name: values.name.trim() || DEMO_CONTACT_DEFAULTS.name,
    phone: values.phone.trim() || DEMO_CONTACT_DEFAULTS.phone,
    email: values.email.trim() || DEMO_CONTACT_DEFAULTS.email,
    notes: values.notes.trim() || DEMO_CONTACT_DEFAULTS.notes,
    senderName: values.senderName.trim() || DEMO_CONTACT_DEFAULTS.senderName
  };
}

export function personalizeDemoText(template: string, contact: DemoContactDetails): string {
  // One pass: visitor text is literal, even if it contains a token or dollar sign.
  return template.replace(/\{\{(First Name|Your Name)\}\}/g, (_, key: string) =>
    key === "First Name" ? contact.name.split(/\s+/)[0] : contact.senderName);
}

function demoPhone(value: string): string | null {
  if (!/^\+?[\d\s().-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  if (value.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits.length === 11 && digits.startsWith("1") ? `+${digits}` : digits;
}

export const DEMO_MARKER = "[DEMO — preview]";

export type DemoStep = {
  title: string;
  timing: string;
  channel: "text" | "email" | "phone";
  subject?: string;
  message: string;
  // A planned beat goes out on a specific date rather than a day offset.
  planned?: boolean;
};

export const DEMO_SCENARIOS: { id: string; label: string; description: string; steps: DemoStep[] }[] = [
  {
    id: "inquiry", label: "Lead", description: "Inquiry · Make a good first impression.",
    steps: [
      { title: "Confirm & set expectations", timing: "Immediate", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. Thanks for getting in touch! I've got your message and I'll get back to you within one business day. What's the main thing you'd like a hand with?" },
      { title: "Follow up & discover", timing: "Day 2", channel: "text", message: "Hi {{First Name}}, {{Your Name}} here. Just checking in. What are you hoping to get done, and when would you like it finished? That'll help me work out how I can help." }
    ]
  },
  {
    id: "quote", label: "Quote", description: "Follow-up · Turn a quote into a conversation.",
    steps: [
      { title: "Send the quote", timing: "Immediate", channel: "email", subject: "Your quote from {{Your Name}}", message: "Hi {{First Name}},\n\nThanks for telling me a bit about your project. I've put together a sample quote for the work:\n\nService visit and agreed work: $250\nIncludes my time, materials, and cleanup.\n\nHave a look when you get a chance. If anything needs explaining or adjusting, just reply and I'll talk it through with you.\n\nThanks,\n{{Your Name}}" },
      { title: "Quote sent reminder", timing: "Immediate", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. I've just emailed your quote over. Have a look when you get a chance, and let me know if you'd like me to explain anything." },
      { title: "Talk through objections", timing: "Day 2", channel: "text", message: "Hi {{First Name}}, {{Your Name}} here. Any questions about the quote? If the price, timing, or work involved isn't quite what you had in mind, let me know. I'm happy to talk it through." },
      { title: "Nudge to schedule", timing: "Day 3", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. Would you like me to stop by for an inspection? Let me know a day that works for you and I'll check my schedule. No rush if you're still thinking it over." },
      { title: "Inspection day call", timing: "Scheduled date", planned: true, channel: "phone", message: "• Confirm {{First Name}}'s visit time\n• Check address and access\n• Ask about priorities\n• Explain the next step" }
    ]
  },
  {
    id: "retention", label: "Completion", description: "Retention · Stay useful long after the job.",
    steps: [
      { title: "Confirm completion", timing: "Immediate", channel: "phone", message: "• Check {{First Name}} is happy\n• Ask about any fixes\n• Share care tips\n• Thank {{First Name}}" },
      { title: "Send the completed invoice", timing: "Day 1", channel: "email", subject: "Your invoice from {{Your Name}}", message: "Hi {{First Name}},\n\nThanks for trusting me with the job. I've finished the work, and here's the sample invoice:\n\nService visit and agreed work: $250\nTotal: $250\n\nThis is just a demo invoice, so there's nothing to pay.\n\nIf something doesn't look right or you have a question, just reply and I'll sort it out.\n\nThanks again,\n{{Your Name}}" },
      { title: "Check in, thank & ask for a review", timing: "Day 3", channel: "text", message: "Hi {{First Name}}, {{Your Name}} here. How's everything working out? Thanks again for trusting me with the job. I'd love your honest feedback, and if I earned five stars, a review would mean a lot to me." },
      { title: "Share a helpful tip", timing: "Day 30", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. A quick tip: keep the care notes I left handy and watch for any changes since my visit. If something doesn't seem right, send me a message. I'm happy to help." },
      { title: "Maintenance check-in", timing: "3 months", channel: "email", subject: "How's everything holding up?", message: "Hi {{First Name}},\n\nIt's been a few months since I stopped by. How's everything holding up? It might be a good time to look over the care notes I left and check whether anything needs attention.\n\nIf you're unsure about something or would like a hand with maintenance, just reply. I'll help you work out the next step.\n\nTake care,\n{{Your Name}}" },
      { title: "Seasonal nudge & referrals", timing: "1 year / seasonal", channel: "email", subject: "A quick hello before the new season", message: "Hi {{First Name}},\n\nHow have you been? With the new season coming up, I thought I'd check whether you need a hand with anything. I'm happy to arrange another visit if that would help.\n\nAnd if a friend or neighbor is looking for someone they can count on, I'd really appreciate you passing my name along. Thanks for keeping me in mind.\n\nAll the best,\n{{Your Name}}" }
    ]
  }
];

export function demoActionUrl(channel: DemoStep["channel"], subject: string, message: string, appleMobile = false, contact: Pick<DemoContactDetails, "phone" | "email"> = DEMO_CONTACT_DEFAULTS): string | null {
  // Keep the demo marker even when a visitor edits the draft.
  const body = encodeURIComponent(`${DEMO_MARKER}\n\n${message}`);
  if (channel === "email") {
    if (!/^[^\s@,;<>]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+$/i.test(contact.email)) return null;
    const recipient = contact.email.split("@").map(encodeURIComponent).join("@");
    return `mailto:${recipient}?subject=${encodeURIComponent(`[DEMO] ${subject}`)}&body=${body}`;
  }
  const phone = demoPhone(contact.phone);
  if (!phone) return null;
  if (channel === "phone") return `tel:${phone}`;
  // Apple Messages uses &body; other SMS handlers use RFC 5724's ?body.
  // A copy action remains available for handlers that ignore message bodies.
  return `sms:${phone}${appleMobile ? "&" : "?"}body=${body}`;
}
