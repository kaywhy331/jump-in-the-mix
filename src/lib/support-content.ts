export const SUPPORT_CATEGORIES = [
  { value: "GENERAL", label: "General help" },
  { value: "ACCOUNT", label: "Account and access" },
  { value: "CONTACTS", label: "Customers and tags" },
  { value: "JUMPS", label: "Today and follow-ups" },
  { value: "MIXES", label: "Mixes and scheduling" },
  { value: "JUMP_DATES", label: "Saved dates" },
  { value: "TEMPLATES", label: "Ready-made Mixes" },
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
  { value: "SENT", label: "Accepted by email provider" }, { value: "PREVIEWED", label: "Email not sent (development)" },
  { value: "FAILED", label: "Email needs review" }
] as const;

export type SupportCategoryValue = (typeof SUPPORT_CATEGORIES)[number]["value"];
export type SupportPriorityValue = (typeof SUPPORT_PRIORITIES)[number]["value"];
export type SupportStatusValue = (typeof SUPPORT_STATUSES)[number]["value"];
export type SupportEmailStatusValue = (typeof SUPPORT_EMAIL_STATUSES)[number]["value"];
export type SupportFaqItem = { category: string; question: string; answer: string; keywords: string[] };

export const SUPPORT_FAQS: SupportFaqItem[] = [
  { category: "Journey", question: "A customer replied before the Mix finished. What do I do?", answer: "Open their work in Journey or their contact page. Expand Record an update or choose a callback date, select the work and its saved outcome, then review the effect. Saving ends that run’s remaining follow-ups and continues its saved path. Completed actions and separate work stay in history. If the saved Mix has no suitable outcome, choose a check-back date or pause the work while you review its next step.", keywords: ["early reply", "accepted", "estimate", "outcome", "journey"] },
  { category: "Journey", question: "How do I keep a callback date someone requested?", answer: "In that person’s work, choose Customer asked me to get back to them, enter the date, time and timezone, and review the update. The remaining follow-ups in that Mix end. One check-back action appears in Today at the saved time; future dates are under Upcoming. I want to choose when to check again records your own timing separately. Neither choice assumes the customer accepted anything.", keywords: ["callback", "wait", "later", "date", "timezone"] },
  { category: "Today", question: "Why does Today need my input when there are no messages due?", answer: "A completed follow-up may still need a customer outcome, or a piece of work may need a missing date or connection repaired. Use Needs your input to open the exact work. A deliberately paused job stays paused. If the app cannot check your next steps, retry the check instead of treating the list as complete.", keywords: ["quiet day", "decision", "needs input", "empty", "waiting"] },
  { category: "Journey", question: "How do I correct an update?", answer: "Open the work and find its last recorded update. Undo is available while that result has not moved on. If later work or a message has already occurred, record a new update and review its effect. Completed actions and previous updates remain in history. The app cannot recall a sent message.", keywords: ["undo", "correction", "mistake", "history"] },
  { category: "Journey", question: "Why is this work held or stopped?", answer: "Open its progress to read the reason. For a missing appointment, choose or create the appointment in Calendar, return to the same work, and link it. A stopped Mix for one person is managed from More on that contact’s profile. A do-not-contact restriction must be reviewed there before outreach can resume. Starting again does not clear these restrictions.", keywords: ["held", "stop", "appointment", "resume", "do not contact"] },
  { category: "Mixes", question: "Will editing a Mix change a running Journey?", answer: "New work uses the saved Mix. An already-running Journey keeps the wording, Beats and connections saved when it began. Open the person’s progress to record a change, pause or stop that work. Saving a reusable Mix is not a migration of existing work.", keywords: ["saved version", "edit", "wording", "running"] },
  { category: "Getting started", question: "Can I finish setup later or set up more at once?", answer: "Setup starts with one person and their first follow-up. To set up more at once, choose Set up a whole pipeline instead for a complete Mega-Mix or individual Mixes; there, Save answers and finish later keeps your answers without installing a Mix. Skip for now finishes setup without adding a person. Return through the setup link in Today or Getting started in Help. Owner reminders are optional in Settings; they are separate from automatic messages to customers.", keywords: ["later", "skip", "onboarding", "reminders", "one person", "pipeline", "mega-mix"] },
  { category: "Getting started", question: "What are Mixes and Beats?", answer: "A Mix is a reusable follow-up plan for one kind of situation, such as an estimate that’s out. Each Beat in it is one planned text, email or call that comes due at a set time. Today brings everything that needs you together, including due Beats, one-time follow-ups and invitations to send, so you can edit a message and record what happened.", keywords: ["today", "mix", "mixes", "plan", "campaign", "beat", "step", "tempo", "timing"] },
  { category: "Mixes", question: "What happens when I copy a ready-made Mix?", answer: "You get your own editable copy of the ready-made Mix. Edit its Beats and timing to fit the relationship. The original stays the same. Save a draft to review everything before starting.", keywords: ["remix", "duplicate", "copy", "template", "personalize"] },
  { category: "Saved dates", question: "What starts a Mix, and what repeats?", answer: "A Mix starts from a saved date, when you start it for someone, or on one fixed date. A saved date can repeat monthly or yearly. It only brings new follow-ups when an active Mix starts from that date; a finished Mix does not restart itself.", keywords: ["cue", "trigger", "start", "loop", "repeat", "recurring"] },
  { category: "Today", question: "Why is a follow-up not on Today?", answer: "Check that the person is active, the Mix is on, its saved date matches the Mix, and the person or their tag is included. A stopped Mix will not create more follow-ups for that person.", keywords: ["missing", "schedule", "stopped", "tag"] },
  { category: "Today", question: "Does opening a text, email, or call mark it done?", answer: "No. Opening or copying records what you started, but you mark the follow-up done after you finish. You can undo a mistaken completion or skip something you no longer need.", keywords: ["done", "copied", "skip", "undo"] },
  { category: "Contacts", question: "How are possible duplicate contacts found?", answer: "The app checks exact email first and exact phone second. Imports hold uncertain matches for your review instead of silently combining people. A confirmed merge keeps primary contact details and unique history.", keywords: ["duplicate", "merge", "email", "phone"] },
  { category: "Contacts", question: "Which email or phone number does a follow-up use?", answer: "A person can have several labeled contact methods. The primary value is used for prepared messages and one-tap actions. Change it from Edit contact.", keywords: ["primary", "email", "phone", "address"] },
  { category: "Saved dates", question: "How do birthdays, job dates, and renewals work?", answer: "Save a meaningful date on a person and choose what it represents. A Mix can start from that date. Repeating dates stay on the correct calendar day in your timezone.", keywords: ["birthday", "anniversary", "renewal", "timezone"] },
  { category: "Mixes", question: "Can I build a Mix from scratch?", answer: "Yes. Choose Create a Mix, choose what starts it, and add a Beat for each text, call, or email. Set each Beat’s timing in days before or after the start, or choose a specific time. Give the conversation room to breathe.", keywords: ["custom", "message", "timing", "tag"] },
  { category: "Mixes", question: "What happens when I choose a ready-made Mix?", answer: "The app makes your own editable copy. You choose who gets it and whether to turn it on now. Your contacts, notes, and completed history are never added to the shared ready-made Mix.", keywords: ["ready-made", "copy", "draft", "turn on"] },
  { category: "Imports", question: "How do CSV and VCF imports protect my data?", answer: "Files are read in your browser, then reviewed rows are sent in small signed-in batches. Exact and possible duplicates are shown before changes are made, and an approved import can finish after you close the browser.", keywords: ["csv", "vcf", "duplicate", "import"] },
  { category: "Privacy and security", question: "How can I control my data?", answer: "My account lets you download a spreadsheet or complete JSON copy, review active sessions, change your password, and permanently delete the account. Private notes stay out of text messages and emails.", keywords: ["privacy", "export", "delete", "sessions", "private"] },
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

export function adminSupportStatusLabel(value: string) { return value === "WAITING_ON_USER" ? "Waiting on customer" : supportStatusLabel(value); }
