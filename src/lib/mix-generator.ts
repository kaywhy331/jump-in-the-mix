import type { Channel } from "@/generated/prisma/client";

export type WizardInput = {
  objective: string;
  tone: string;
  durationDays: number;
  touches: number;
  channels: Channel[];
  productPlaceholder?: string;
};

export type GeneratedStep = {
  name: string;
  channel: Channel;
  dayOffset: number;
  subject?: string;
  body?: string;
  script?: string;
};

const channelOrder: Channel[] = ["EMAIL", "SMS", "PHONE_CALL", "EMAIL", "SMS", "WHATSAPP", "PHONE_CALL"];

export function generateMixDraft(input: WizardInput): { name: string; description: string; steps: GeneratedStep[] } {
  const enabled: Channel[] = input.channels.length ? input.channels : ["EMAIL", "SMS", "PHONE_CALL"];
  const product = input.productPlaceholder || "{{My Product 1}}";
  const stepCount = Math.max(3, Math.min(7, input.touches));
  const span = Math.max(stepCount - 1, input.durationDays);

  const selectedChannels = Array.from({ length: stepCount }, (_, index) => {
    const preferred = channelOrder[index % channelOrder.length];
    return enabled.includes(preferred) ? preferred : enabled[index % enabled.length];
  });

  const steps = selectedChannels.map((channel, index): GeneratedStep => {
    const dayOffset = Math.round((index * span) / Math.max(1, stepCount - 1));
    const stepNumber = index + 1;
    const isLast = index === stepCount - 1;

    if (channel === "EMAIL") {
      return {
        name: `Email ${stepNumber}`,
        channel,
        dayOffset,
        subject: index === 0 ? "A quick follow-up" : "Still need a hand?",
        body: isLast
          ? `Hi {{First Name}},\n\nI don’t want to fill your inbox, so I’ll close the loop for now. If you still need help with ${product}, reply whenever the timing is right and I’ll be glad to pick it up from there.\n\n{{Email Signature}}`
          : `Hi {{First Name}},\n\nThanks for getting in touch. I wanted to check what would be most helpful right now and whether you have any questions about ${product}. Just reply here and I’ll make the next step easy.\n\n{{Email Signature}}`
      };
    }

    if (channel === "SMS" || channel === "WHATSAPP") {
      return {
        name: `${channel === "SMS" ? "SMS" : "WhatsApp"} ${stepNumber}`,
        channel,
        dayOffset,
        body: isLast
          ? "Hi {{First Name}}, should I close this out for now, or do you still need a hand? Either answer is fine. {{SMS Signature}}"
          : "Hi {{First Name}}, just checking in. Is there a question I can answer or a next step I can make easier? {{SMS Signature}}"
      };
    }

    return {
      name: `Call ${stepNumber}`,
      channel,
      dayOffset,
      script: "Ask whether they still need help, what has changed, and what one next step would be most useful. Listen, answer plainly, and agree on when to follow up."
    };
  });

  return {
    name: `${input.objective} — ${input.tone}`,
    description: `${stepCount}-touch ${input.tone.toLowerCase()} follow-up plan across ${input.durationDays} days.`,
    steps
  };
}
