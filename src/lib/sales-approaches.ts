export const SALES_APPROACH_REVIEW_DATE = "2026-09-05";

export const SALES_APPROACHES = {
  nepq: {
    label: "NEPQ-inspired discovery",
    author: "Jeremy Miner / 7th Level",
    principle: "Use calm, open questions to understand the customer's situation, desired change, and reasons for considering it before suggesting a solution.",
    sourceTitle: "7th Level: NEPQ methodology",
    sourceUrl: "https://7thlevelhq.com/our-methodology/",
    adaptation: "Use the customer's own words. Ask about impact without inventing pain, urgency, or emotional stakes. Save deeper discovery for a conversation."
  },
  spin: {
    label: "SPIN-informed discovery",
    author: "Neil Rackham / Huthwaite International",
    principle: "Connect a relevant situation and problem to its practical consequences, then let the buyer describe the value of an improvement.",
    sourceTitle: "Huthwaite: SPIN Selling",
    sourceUrl: "https://www.huthwaiteinternational.com/sales-training/spin-selling",
    adaptation: "Research what is already known. Do not turn an email sequence into a questionnaire or ask customers to repeat information they have supplied."
  },
  sandler: {
    label: "Sandler-inspired mutual fit",
    author: "David Sandler / Sandler",
    principle: "Agree on the purpose and next step together, understand the problem, resources, and decision process, and allow an honest no.",
    sourceTitle: "Sandler Selling System",
    sourceUrl: "https://sandler.com/sandler-selling-system/",
    adaptation: "Discuss budget and decision roles respectfully in a conversation. Agree on what happens next instead of treating silence as a commitment."
  },
  jolt: {
    label: "JOLT-informed decision support",
    author: "Matthew Dixon and Ted McKenna",
    principle: "When a buyer wants a solution but hesitates about choosing, clarify the uncertainty, offer a justified recommendation, and make implementation easier to evaluate.",
    sourceTitle: "The JOLT Effect: about the book",
    sourceUrl: "https://www.jolteffect.com/about-the-book",
    adaptation: "Distinguish indecision from a lack of fit. Narrow choices without withholding material information, and explain only safeguards your business actually provides."
  },
  empathy: {
    label: "Tactical-empathy-inspired follow-up",
    author: "Chris Voss / The Black Swan Group",
    principle: "Listen for the buyer's perspective, reflect it tentatively, and use open questions to understand concerns before discussing a way forward.",
    sourceTitle: "The Black Swan Group: tactical empathy",
    sourceUrl: "https://www.blackswanltd.com/newsletter/topic/tactical-empathy",
    adaptation: "Check your interpretation rather than assuming how someone feels. Avoid scripted pressure, guilt, or a question designed to trap the buyer."
  },
  positioning: {
    label: "Sales Pitch-inspired positioning",
    author: "April Dunford",
    principle: "Help the buyer compare realistic alternatives using their priorities, and explain where your offer is a good fit and where it is not.",
    sourceTitle: "April Dunford: positioning and sales pitch",
    sourceUrl: "https://www.aprildunford.com/books",
    adaptation: "Dunford's work centers on B2B technology. These broader adaptations compare options honestly; replace generic examples with verified distinctions in your own market."
  },
  transparency: {
    label: "They Ask, You Answer / Endless Customers",
    author: "Marcus Sheridan / IMPACT",
    principle: "Earn trust by addressing the questions buyers use to evaluate a purchase, including price, alternatives, limitations, and what to expect.",
    sourceTitle: "Endless Customers: the current system",
    sourceUrl: "https://www.endlesscustomers.com/",
    adaptation: "Use current, accurate explanations of pricing and fit. Share a useful answer before asking for a meeting; link only to resources your business actually has."
  }
} as const;

export type SalesApproachId = keyof typeof SALES_APPROACHES;
