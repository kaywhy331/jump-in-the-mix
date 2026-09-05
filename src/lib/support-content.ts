export const SUPPORT_CATEGORIES = [
  { value: "GENERAL", label: "General help" },
  { value: "ACCOUNT", label: "Account and access" },
  { value: "CONTACTS", label: "Customers and tags" },
  { value: "JUMPS", label: "Today and follow-ups" },
  { value: "MIXES", label: "Plans and scheduling" },
  { value: "JUMP_DATES", label: "Saved dates" },
  { value: "TEMPLATES", label: "Ready-made plans" },
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
  { value: "OPEN", label: "Open" }, { value: "WAITING_ON_SUPPORT", label: "Waiting on support" },
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
  { category: "Getting started", question: "What are Today, plans, and follow-ups?", answer: "Today is your short work list. A plan is a reusable series of texts, calls, or emails. Each item that becomes due is a follow-up you can review, edit, and complete.", keywords: ["today", "plan", "sequence", "message", "call"] },
  { category: "Today", question: "Why is a follow-up not on Today?", answer: "Check that the person is active, the plan is on, its saved date matches the plan, and the person or their tag is included. A stopped plan will not create more follow-ups for that person.", keywords: ["missing", "schedule", "stopped", "tag"] },
  { category: "Today", question: "Does opening a text, email, or call mark it done?", answer: "No. Opening or copying records what you started, but you mark the follow-up done after you finish. You can undo a mistaken completion or skip something you no longer need.", keywords: ["done", "copied", "skip", "undo"] },
  { category: "Contacts", question: "How are possible duplicate contacts found?", answer: "The app checks exact email first and exact phone second. Imports hold uncertain matches for your review instead of silently combining people. A confirmed merge keeps primary contact details and unique history.", keywords: ["duplicate", "merge", "email", "phone"] },
  { category: "Contacts", question: "Which email or phone number does a follow-up use?", answer: "A person can have several labeled contact methods. The primary value is used for prepared messages and one-tap actions. Change it from Edit contact.", keywords: ["primary", "email", "phone", "address"] },
  { category: "Saved dates", question: "How do birthdays, job dates, and renewals work?", answer: "Save a meaningful date on a person and choose what it represents. A plan can start from that date. Repeating dates stay on the correct calendar day in your timezone.", keywords: ["birthday", "anniversary", "renewal", "timezone"] },
  { category: "Plans", question: "Can I build a plan from scratch?", answer: "Yes. Choose when it starts, who it applies to, and add each text, call, or email with the number of days to wait. Extra timing controls stay under Advanced.", keywords: ["custom", "message", "timing", "tag"] },
  { category: "Plans", question: "What happens when I choose a ready-made plan?", answer: "The app makes your own editable copy. You choose who gets it and whether to turn it on now. Your contacts, notes, and completed history are never added to the shared starting plan.", keywords: ["ready-made", "copy", "draft", "turn on"] },
  { category: "Imports", question: "How do CSV and VCF imports protect my data?", answer: "Files are read in your browser, then reviewed rows are sent in small signed-in batches. Exact and possible duplicates are shown before changes are made, and an approved import can finish after you close the browser.", keywords: ["csv", "vcf", "duplicate", "import"] },
  { category: "Privacy and security", question: "How can I control my data?", answer: "My Account lets you download a spreadsheet or complete JSON copy, review active sessions, change your password, and permanently delete the account. Private notes are never inserted into prepared messages.", keywords: ["privacy", "export", "delete", "sessions", "private"] },
  { category: "Troubleshooting", question: "What should I include when reporting a problem?", answer: "Say what you expected, what happened instead, the page you were using, and the approximate time. Never include passwords, private keys, customer information, or provider tokens.", keywords: ["bug", "problem", "report", "troubleshooting"] }
];

export const SUPPORT_REPLY_TEMPLATES = [
  { name: "Need more information", body: "Thank you for the details. Please tell us what you expected, what happened instead, the page involved, and the approximate time. Do not send passwords, customer information, or private keys." },
  { name: "Steps to try", body: "Please refresh the page, sign out and back in, and retry once. If it continues, reply with the page name, exact message, and whether it happens on mobile, desktop, or both." },
  { name: "Resolved", body: "We applied a correction and believe this is resolved. Please retry the original task. If it continues, reply here and the conversation will reopen." }
] as const;

function optionLabel<T extends readonly { value: string; label: string }[]>(options: T, value: string): string { return options.find((option) => option.value === value)?.label ?? value.toLowerCase().replaceAll("_", " "); }
export function supportCategoryLabel(value: string): string { return optionLabel(SUPPORT_CATEGORIES, value); }
export function supportPriorityLabel(value: string): string { return optionLabel(SUPPORT_PRIORITIES, value); }
export function supportStatusLabel(value: string): string { return optionLabel(SUPPORT_STATUSES, value); }
export function supportEmailStatusLabel(value: string): string { return optionLabel(SUPPORT_EMAIL_STATUSES, value); }
export function isSupportCategory(value: string): value is SupportCategoryValue { return SUPPORT_CATEGORIES.some((option) => option.value === value); }
export function isSupportPriority(value: string): value is SupportPriorityValue { return SUPPORT_PRIORITIES.some((option) => option.value === value); }
export function isSupportStatus(value: string): value is SupportStatusValue { return SUPPORT_STATUSES.some((option) => option.value === value); }
