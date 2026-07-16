export const SUPPORT_CATEGORIES = [
  { value: "GENERAL", label: "General help" },
  { value: "ACCOUNT", label: "Account and access" },
  { value: "BILLING", label: "Billing and plans" },
  { value: "CONTACTS", label: "Contacts and Groups" },
  { value: "JUMPS", label: "Jump queue and actions" },
  { value: "MIXES", label: "Mixes and scheduling" },
  { value: "JUMP_DATES", label: "Jump Dates and types" },
  { value: "TEMPLATES", label: "Mix Templates and Community" },
  { value: "AI", label: "AI Mix Wizard" },
  { value: "IMPORTS_SYNC", label: "Imports and Google Contacts" },
  { value: "PRIVACY_SECURITY", label: "Privacy and security" },
  { value: "BUG", label: "Something is not working" },
  { value: "FEATURE_REQUEST", label: "Product suggestion" }
] as const;

export const SUPPORT_PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" }
] as const;

export const SUPPORT_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "WAITING_ON_SUPPORT", label: "Waiting on Jump in the Mix" },
  { value: "WAITING_ON_USER", label: "Waiting on you" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" }
] as const;

export const SUPPORT_EMAIL_STATUSES = [
  { value: "NOT_REQUESTED", label: "No email requested" },
  { value: "PENDING", label: "Email pending" },
  { value: "SENT", label: "Email sent" },
  { value: "PREVIEWED", label: "Development preview" },
  { value: "FAILED", label: "Email failed" }
] as const;

export type SupportCategoryValue = (typeof SUPPORT_CATEGORIES)[number]["value"];
export type SupportPriorityValue = (typeof SUPPORT_PRIORITIES)[number]["value"];
export type SupportStatusValue = (typeof SUPPORT_STATUSES)[number]["value"];
export type SupportEmailStatusValue = (typeof SUPPORT_EMAIL_STATUSES)[number]["value"];

export type SupportFaqItem = {
  category: string;
  question: string;
  answer: string;
  keywords: string[];
};

export const SUPPORT_FAQS: SupportFaqItem[] = [
  {
    category: "Getting started",
    question: "What is the difference between a Jump, a reusable Jump, and a Mix?",
    answer: "A reusable Jump is prepared SMS, email, phone-call, voicemail-script, or WhatsApp content. A Mix arranges reusable Jumps into an ordered sequence with timing and an audience. The Jump page shows the individual actions that are ready for you to complete.",
    keywords: ["jump", "mix", "sequence", "message", "call"]
  },
  {
    category: "Jump queue",
    question: "Why is a Jump not appearing on the Jump page?",
    answer: "Confirm that the Contact is active, the Mix is Active, the relevant Jump Date Type matches the Mix trigger, the audience includes the Contact, and the Mix has not been stopped for that Contact. Saving any of those records queues automatic reconciliation; there is no manual Sync button.",
    keywords: ["missing", "not showing", "reconciliation", "queue", "stopped"]
  },
  {
    category: "Jump queue",
    question: "Does opening an SMS, email, WhatsApp message, or phone call mark the Jump Done?",
    answer: "No. Opening or copying a prepared action is recorded separately from completion. Mark the Jump Done only after you have completed the relationship action. You can Undo a mistaken completion or Skip work you intentionally will not perform.",
    keywords: ["done", "copied", "sent", "skip", "undo"]
  },
  {
    category: "Contacts",
    question: "How are duplicate Contacts identified?",
    answer: "Exact normalized email is checked first, followed by exact normalized phone. File and Google imports hold ambiguous and fuzzy matches for review instead of silently merging them. Non-destructive merge keeps existing primary choices and unions unique methods, dates, Groups, and custom values.",
    keywords: ["duplicate", "merge", "email", "phone", "dedupe"]
  },
  {
    category: "Contacts",
    question: "Which email, phone number, or address is used for a Jump?",
    answer: "Each Contact can have multiple labeled emails, phone numbers, and addresses. The value marked Primary is used by placeholders and one-tap actions. You can change the primary choice from the Contact editor.",
    keywords: ["primary", "email", "phone", "address"]
  },
  {
    category: "Jump Dates",
    question: "How do Jump Dates and custom Jump Date Types work?",
    answer: "A Jump Date records an important date for one Contact. Its Jump Date Type lets active Mixes recognize the event. System types are shared globally; custom types belong only to your workspace. Monthly and yearly recurrence use logical calendar dates so browser timezone conversion does not shift the day.",
    keywords: ["birthday", "anniversary", "date type", "recurrence", "timezone"]
  },
  {
    category: "Mixes",
    question: "What is the difference between Manual start, Target Jump Date Type, and Fixed-date broadcast?",
    answer: "Manual start begins from a Contact or Group assignment date. Target Jump Date Type schedules relative to matching Contact dates. Fixed-date broadcast schedules one explicit local date and time for an all-Contact or Group audience. Editing any of these inputs reconciles future pending work without rewriting completed history.",
    keywords: ["manual", "broadcast", "trigger", "schedule", "date type"]
  },
  {
    category: "Mixes",
    question: "Can I stop one Mix for one Contact without deleting anything?",
    answer: "Yes. Stop Mix cancels that Contact's incomplete work for the selected Mix and prevents new work for the pair. Completed history and the assignment are preserved. Resume restores currently valid future Jumps through normal reconciliation.",
    keywords: ["stop", "resume", "contact", "cancel"]
  },
  {
    category: "Templates",
    question: "What happens when I import a Platform or Community Mix Template?",
    answer: "The import creates an independent editable Draft Mix with new reusable Jumps. It never copies the contributor's Contacts, Groups, audience, completed history, or credentials. Importing the same template again creates another independent Draft after confirmation.",
    keywords: ["template", "community", "platform", "import", "draft"]
  },
  {
    category: "AI",
    question: "What information can the AI Mix Wizard send to an AI provider?",
    answer: "The provider request can include strategy choices, My Info business context, and Contact Group names as audience labels. It does not query or transmit Contact rows, contact methods, addresses, Group membership lists, Jump history, or Private Notes. A built-in strategist remains available without an external provider key.",
    keywords: ["ai", "privacy", "provider", "contacts", "private notes"]
  },
  {
    category: "Imports and sync",
    question: "How do CSV, VCF, and Google Contacts imports protect my data?",
    answer: "CSV and VCF files are parsed in the browser before reviewed rows are sent in small authenticated batches. Google Contacts uses one-way read-only OAuth with encrypted credentials. Both flows apply workspace-scoped matching, plan checks, audit records, and automatic Jump reconciliation.",
    keywords: ["csv", "vcf", "google", "oauth", "sync", "import"]
  },
  {
    category: "Billing",
    question: "What happens to my work if I downgrade or cancel?",
    answer: "Your records are preserved. Excess active Mixes are paused, future incomplete Jumps from them are canceled, excess custom Jump Date Types become inactive, and excess Community contributions become unpublished. Contacts and Groups remain stored; creation is blocked only while your active count exceeds the plan limit.",
    keywords: ["billing", "downgrade", "cancel", "plan", "preserved"]
  },
  {
    category: "Billing",
    question: "Where can I update payment details, view invoices, or cancel?",
    answer: "Open My Account and choose Manage billing in Stripe. Stripe's hosted Customer Portal handles payment methods, invoices, supported plan changes, cancellation, and cancellation reversal. Jump in the Mix grants access only after server-side Checkout or signed-webhook verification.",
    keywords: ["invoice", "payment", "stripe", "cancel", "card"]
  },
  {
    category: "Privacy and security",
    question: "Who can see Private Notes and support tickets?",
    answer: "Private Notes are available only to Phone Call Jump content and are excluded from CSV export, imports, AI requests, and other channels. Support tickets are scoped to the requesting user and workspace. Platform administrators can access the support queue for troubleshooting, with their actions audited.",
    keywords: ["private notes", "support", "privacy", "admin", "security"]
  },
  {
    category: "Troubleshooting",
    question: "What should I include when reporting a problem?",
    answer: "Describe what you expected, what happened instead, the page or workflow involved, and the approximate time. Do not include passwords, payment-card details, OAuth tokens, or other secrets. The support thread preserves every message and timestamp so the investigation can continue in one place.",
    keywords: ["bug", "problem", "report", "troubleshooting", "secret"]
  }
];

export const SUPPORT_REPLY_TEMPLATES = [
  {
    name: "Need more information",
    body: "Thank you for the details. To investigate this safely, please tell us what you expected to happen, what happened instead, the page or workflow involved, and the approximate time you noticed it. Please do not send passwords, payment-card details, or provider tokens."
  },
  {
    name: "Steps to try",
    body: "Thank you for reporting this. Please refresh the page, sign out and back in, and retry the action once. If the behavior continues, reply with the page name, the exact message shown, and whether it happens on mobile, desktop, or both."
  },
  {
    name: "Billing follow-up",
    body: "We reviewed the account's billing state. Stripe remains the source of truth for payment methods, invoices, renewals, and cancellations. Please open My Account and choose Manage billing in Stripe, then reply here if the account state still does not match what Stripe shows."
  },
  {
    name: "Resolved",
    body: "We have applied a correction and believe this issue is resolved. Please retry the original workflow. If the problem continues, reply to this ticket and it will return to the support queue."
  }
] as const;

function optionLabel<T extends readonly { value: string; label: string }[]>(options: T, value: string): string {
  return options.find((option) => option.value === value)?.label ?? value.toLowerCase().replaceAll("_", " ");
}

export function supportCategoryLabel(value: string): string {
  return optionLabel(SUPPORT_CATEGORIES, value);
}

export function supportPriorityLabel(value: string): string {
  return optionLabel(SUPPORT_PRIORITIES, value);
}

export function supportStatusLabel(value: string): string {
  return optionLabel(SUPPORT_STATUSES, value);
}

export function supportEmailStatusLabel(value: string): string {
  return optionLabel(SUPPORT_EMAIL_STATUSES, value);
}

export function isSupportCategory(value: string): value is SupportCategoryValue {
  return SUPPORT_CATEGORIES.some((option) => option.value === value);
}

export function isSupportPriority(value: string): value is SupportPriorityValue {
  return SUPPORT_PRIORITIES.some((option) => option.value === value);
}

export function isSupportStatus(value: string): value is SupportStatusValue {
  return SUPPORT_STATUSES.some((option) => option.value === value);
}
