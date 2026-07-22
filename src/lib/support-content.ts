export const SUPPORT_CATEGORIES = [
  { value: "GENERAL", label: "General help" },
  { value: "ACCOUNT", label: "Account and access" },
  { value: "CONTACTS", label: "Contacts and Groups" },
  { value: "JUMPS", label: "Today and actions" },
  { value: "MIXES", label: "Mixes and scheduling" },
  { value: "JUMP_DATES", label: "Important Dates and types" },
  { value: "TEMPLATES", label: "Mix Templates" },
  { value: "IMPORTS_SYNC", label: "Contact imports" },
  { value: "PRIVACY_SECURITY", label: "Privacy and security" },
  { value: "BUG", label: "Something is not working" },
  { value: "FEATURE_REQUEST", label: "Product suggestion" }
] as const;

export const SUPPORT_PRIORITIES = [
  { value: "LOW", label: "Low" }, { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" }, { value: "URGENT", label: "Urgent" }
] as const;
export const SUPPORT_STATUSES = [
  { value: "OPEN", label: "Open" }, { value: "WAITING_ON_SUPPORT", label: "Waiting on Jump in the Mix" },
  { value: "WAITING_ON_USER", label: "Waiting on you" }, { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" }
] as const;
export const SUPPORT_EMAIL_STATUSES = [
  { value: "NOT_REQUESTED", label: "No email requested" }, { value: "PENDING", label: "Email pending" },
  { value: "SENT", label: "Email sent" }, { value: "PREVIEWED", label: "Development preview" },
  { value: "FAILED", label: "Email failed" }
] as const;

export type SupportCategoryValue = (typeof SUPPORT_CATEGORIES)[number]["value"];
export type SupportPriorityValue = (typeof SUPPORT_PRIORITIES)[number]["value"];
export type SupportStatusValue = (typeof SUPPORT_STATUSES)[number]["value"];
export type SupportEmailStatusValue = (typeof SUPPORT_EMAIL_STATUSES)[number]["value"];
export type SupportFaqItem = { category: string; question: string; answer: string; keywords: string[] };

export const SUPPORT_FAQS: SupportFaqItem[] = [
  { category: "Getting started", question: "What is the difference between an Action Template, a Mix, and a Jump?", answer: "An Action Template is reusable message or call content. A Mix arranges actions into an ordered follow-up sequence with timing and an audience. Today shows the individual Jumps ready for you to complete.", keywords: ["jump", "mix", "sequence", "message", "call"] },
  { category: "Today", question: "Why is a Jump not appearing on Today?", answer: "Confirm that the Contact is active, the Mix is active, the Important Date Type matches the Mix trigger, the audience includes the Contact, and the Mix has not been stopped for that Contact. Saving those records queues automatic reconciliation.", keywords: ["missing", "reconciliation", "queue", "stopped"] },
  { category: "Today", question: "Does opening a message or phone call mark the Jump done?", answer: "No. Opening or copying a prepared action is recorded separately from completion. Mark it done after the relationship action is complete. You can undo a mistaken completion or skip work you will not perform.", keywords: ["done", "copied", "skip", "undo"] },
  { category: "Contacts", question: "How are duplicate Contacts identified?", answer: "Exact normalized email is checked first, followed by exact normalized phone. File imports hold ambiguous and fuzzy matches for review instead of silently merging them. A reviewed merge preserves primary choices and combines unique relationship data.", keywords: ["duplicate", "merge", "email", "phone"] },
  { category: "Contacts", question: "Which email, phone number, or address is used for a Jump?", answer: "Each Contact can have multiple labeled values. The value marked Primary is used by placeholders and one-tap actions. You can change the primary choice from the Contact editor.", keywords: ["primary", "email", "phone", "address"] },
  { category: "Important Dates", question: "How do Important Dates and custom types work?", answer: "An Important Date records a meaningful date for one Contact. Its type lets active Mixes recognize the event. Monthly and yearly recurrence use logical calendar dates so timezone conversion does not shift the day.", keywords: ["birthday", "anniversary", "date type", "recurrence", "timezone"] },
  { category: "Mixes", question: "Can I build a Mix without a template?", answer: "Yes. Write each action directly, choose its channel and timing, reorder the sequence, select an audience, and save it as a draft or activate it. Reusable Action Templates are optional.", keywords: ["manual", "action", "template", "audience"] },
  { category: "Templates", question: "What happens when I use a Mix Template?", answer: "The template creates an independent editable Mix. Choose its name, audience, schedule, and draft or active state in one setup screen. Your Contacts and completed history are never copied into the template.", keywords: ["template", "import", "draft", "activate"] },
  { category: "Imports", question: "How do CSV and VCF imports protect my data?", answer: "Files are parsed in the browser before reviewed rows are sent in small authenticated batches. Exact and possible duplicates are shown for review, while a background worker can continue an approved import after the browser closes.", keywords: ["csv", "vcf", "duplicate", "import", "worker"] },
  { category: "Privacy and security", question: "How can I control my personal data?", answer: "My Account lets you export your data, review active sessions, change your password, and permanently delete your account. Private Relationship Updates remain distinct from Customer Notes throughout Contact workflows.", keywords: ["privacy", "export", "delete", "sessions", "private"] },
  { category: "Troubleshooting", question: "What should I include when reporting a problem?", answer: "Describe what you expected, what happened instead, the page or workflow involved, and the approximate time. Do not include passwords, private keys, or other secrets.", keywords: ["bug", "problem", "report", "troubleshooting"] }
];

export const SUPPORT_REPLY_TEMPLATES = [
  { name: "Need more information", body: "Thank you for the details. Please tell us what you expected, what happened instead, the page involved, and the approximate time. Do not send passwords or private keys." },
  { name: "Steps to try", body: "Please refresh the page, sign out and back in, and retry once. If the behavior continues, reply with the page name, exact message, and whether it happens on mobile, desktop, or both." },
  { name: "Resolved", body: "We applied a correction and believe this issue is resolved. Please retry the original workflow. If it continues, reply to this ticket and it will return to the support queue." }
] as const;

function optionLabel<T extends readonly { value: string; label: string }[]>(options: T, value: string): string { return options.find((option) => option.value === value)?.label ?? value.toLowerCase().replaceAll("_", " "); }
export function supportCategoryLabel(value: string): string { return optionLabel(SUPPORT_CATEGORIES, value); }
export function supportPriorityLabel(value: string): string { return optionLabel(SUPPORT_PRIORITIES, value); }
export function supportStatusLabel(value: string): string { return optionLabel(SUPPORT_STATUSES, value); }
export function supportEmailStatusLabel(value: string): string { return optionLabel(SUPPORT_EMAIL_STATUSES, value); }
export function isSupportCategory(value: string): value is SupportCategoryValue { return SUPPORT_CATEGORIES.some((option) => option.value === value); }
export function isSupportPriority(value: string): value is SupportPriorityValue { return SUPPORT_PRIORITIES.some((option) => option.value === value); }
export function isSupportStatus(value: string): value is SupportStatusValue { return SUPPORT_STATUSES.some((option) => option.value === value); }
