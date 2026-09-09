export const INTAKE_KINDS = [
  { value: "HOSTED_FORM", label: "Shareable lead form", hint: "Share a form link on your website, social profile, messages, or a QR code." },
  { value: "WEBSITE", label: "Website forms", hint: "Send new form submissions from your form tool or website backend." },
  { value: "EMAIL", label: "Email", hint: "Use your email provider’s automation or an email parser to map new inquiries." },
  { value: "SMS", label: "Text and WhatsApp messages", hint: "Map an incoming-message event from your messaging provider." },
  { value: "VOICE", label: "Calls and voicemail", hint: "Map a completed call, caller details, or a voicemail transcript from your phone provider." },
  { value: "SOCIAL", label: "Social DMs and comments", hint: "Use a platform-approved connector with access to the messages or comments you choose." },
  { value: "CRM", label: "Another CRM", hint: "Map new or updated people and confirmed business milestones from your CRM." },
  { value: "DEVICE", label: "RFID, QR, and shared contacts", hint: "Send a stable card or device identifier through a scanner’s automation; upload vCards from contact-sharing tools." },
  { value: "OTHER", label: "Another source", hint: "Any service that can send an authenticated JSON HTTP request can use this connection." }
] as const;
export function intakeKindLabel(kind: string) { return INTAKE_KINDS.find(item => item.value === kind)?.label ?? "Connected source"; }
