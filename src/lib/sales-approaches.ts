// Descriptive, clean-room approach labels (JITM-04 §2.34). The ids are stored keys and never shown.
export const SALES_APPROACHES = {
  nepq: {
    label: "Question-led discovery",
    principle: "Use calm, open questions to understand the customer's situation, desired change, and reasons for considering it before suggesting a solution.",
    adaptation: "Use the customer's own words. Ask about impact without inventing pain, urgency, or emotional stakes. Save deeper discovery for a conversation."
  },
  spin: {
    label: "Problem-to-value discovery",
    principle: "Connect a relevant situation and problem to its practical consequences, then let the buyer describe the value of an improvement.",
    adaptation: "Research what is already known. Do not turn an email sequence into a questionnaire or ask customers to repeat information they have supplied."
  },
  sandler: {
    label: "Mutual-fit conversation",
    principle: "Agree on the purpose and next step together, understand the problem, resources, and decision process, and allow an honest no.",
    adaptation: "Discuss budget and decision roles respectfully in a conversation. Agree on what happens next instead of treating silence as a commitment."
  },
  jolt: {
    label: "Decision support for a hesitant buyer",
    principle: "When a buyer wants a solution but hesitates about choosing, clarify the uncertainty, offer a justified recommendation, and make implementation easier to evaluate.",
    adaptation: "Distinguish indecision from a lack of fit. Narrow choices without withholding material information, and explain only safeguards your business actually provides."
  },
  empathy: {
    label: "Listening-first follow-up",
    principle: "Listen for the buyer's perspective, reflect it tentatively, and use open questions to understand concerns before discussing a way forward.",
    adaptation: "Check your interpretation rather than assuming how someone feels. Avoid scripted pressure, guilt, or a question designed to trap the buyer."
  },
  positioning: {
    label: "Honest comparison of options",
    principle: "Help the buyer compare realistic alternatives using their priorities, and explain where your offer is a good fit and where it is not.",
    adaptation: "Compare options honestly, and replace generic examples with verified distinctions in your own market."
  },
  transparency: {
    label: "Answer-first education",
    principle: "Earn trust by addressing the questions buyers use to evaluate a purchase, including price, alternatives, limitations, and what to expect.",
    adaptation: "Use current, accurate explanations of pricing and fit. Share a useful answer before asking for a meeting; link only to resources your business actually has."
  }
} as const;

export type SalesApproachId = keyof typeof SALES_APPROACHES;

// Ready-made Mixes installed before 2026-09-28 store the retired labels, which named third-party
// methods. Show the descriptive label in their place; stored records and owners' copies stay as they are.
const RETIRED_LABELS: Record<string, string> = {
  "NEPQ-inspired discovery": SALES_APPROACHES.nepq.label,
  "SPIN-informed discovery": SALES_APPROACHES.spin.label,
  "Sandler-inspired mutual fit": SALES_APPROACHES.sandler.label,
  "JOLT-informed decision support": SALES_APPROACHES.jolt.label,
  "Tactical-empathy-inspired follow-up": SALES_APPROACHES.empathy.label,
  "Sales Pitch-inspired positioning": SALES_APPROACHES.positioning.label,
  "They Ask, You Answer / Endless Customers": SALES_APPROACHES.transparency.label
};

export function approachLabel(framework: string): string {
  return RETIRED_LABELS[framework] ?? framework;
}
