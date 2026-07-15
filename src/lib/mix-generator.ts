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
        subject: index === 0 ? "A quick question for {{Company}}" : "Worth a brief conversation?",
        body: isLast
          ? `Hi {{First Name}}, I wanted to close the loop. Would it make sense to have a brief conversation about whether ${product} could support what {{Company}} is trying to accomplish?\n\n{{Email Signature}}`
          : `Hi {{First Name}}, out of curiosity, how is {{Company}} currently handling this? I ask because ${product} may be relevant, but I would first like to understand what is working and what feels difficult.\n\n{{Email Signature}}`
      };
    }

    if (channel === "SMS" || channel === "WHATSAPP") {
      return {
        name: `${channel === "SMS" ? "SMS" : "WhatsApp"} ${stepNumber}`,
        channel,
        dayOffset,
        body: isLast
          ? "Hi {{First Name}}, should I close the loop, or would a quick conversation be useful? {{SMS Signature}}"
          : "Hi {{First Name}}, what would you most like to improve about the way this is handled today? {{SMS Signature}}"
      };
    }

    return {
      name: `Call ${stepNumber}`,
      channel,
      dayOffset,
      script: "Ask how they are handling the situation now, what prompted them to consider a change, and what happens if the problem remains unresolved. Listen before presenting a solution."
    };
  });

  return {
    name: `${input.objective} — ${input.tone}`,
    description: `${stepCount}-touch ${input.tone.toLowerCase()} follow-up plan across ${input.durationDays} days.`,
    steps
  };
}
