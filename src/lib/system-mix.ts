export const REFERRAL_INVITE_LIMIT = 5;
export const SYSTEM_MIX_NAME = "Jump in the Mix System Mix";
export type SystemMixContent = { subject: string; body: string };
export const DEFAULT_SYSTEM_MIX: SystemMixContent = {
  subject: "{{Sender Name}} invited you to Jump in the Mix",
  body: "Hi {{Contact Name}},\n\nI’m using Jump in the Mix to stay in touch with the people in my circle. It’s free and invitation-only, and I’d like to share one of my five personal invitations with you.\n\n{{Sender Name}}"
};
export class SystemMixError extends Error {
  constructor(message: string, readonly needsMfa = false) { super(message); }
}
export function validateSystemMixContent(value: SystemMixContent): SystemMixContent {
  if (!value || typeof value.subject !== "string" || typeof value.body !== "string") throw new SystemMixError("Enter an invitation subject and introduction.");
  const content = { subject: value.subject.trim(), body: value.body.trim() };
  if (content.subject.length < 10 || content.subject.length > 180 || content.body.length < 40 || content.body.length > 2000) throw new SystemMixError("Use a subject of 10–180 characters and an introduction of 40–2,000 characters.");
  if (/[\u0000-\u001f\u007f]/.test(content.subject) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content.body)) throw new SystemMixError("Remove control characters and keep the subject on one line.");
  for (const text of [content.subject, content.body]) {
    const remaining = text.replaceAll("{{Sender Name}}", "").replaceAll("{{Contact Name}}", "");
    if (/[{}<>]/.test(remaining) || /(?:\w+:\/\/|www\.|mailto:|javascript:|data:|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b)/i.test(remaining)) throw new SystemMixError("Use plain text with only {{Sender Name}} and {{Contact Name}}. Jump adds the account link and recipient notice.");
  }
  if (!content.subject.includes("{{Sender Name}}") || !content.body.includes("{{Sender Name}}") || !content.body.includes("{{Contact Name}}")) throw new SystemMixError("Include {{Sender Name}} in the subject and introduction, and {{Contact Name}} in the introduction.");
  return content;
}
function displayName(value: string, fallback: string) { return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 160) || fallback; }
export function renderSystemMix(content: SystemMixContent, sender: string, contact: string) {
  const names: Record<string, string> = { "Sender Name": displayName(sender, "Someone in your network"), "Contact Name": displayName(contact, "there") };
  const render = (text: string) => text.replace(/{{(Sender Name|Contact Name)}}/g, (_, key: string) => names[key]);
  return { subject: render(content.subject), body: render(content.body) };
}
export function systemInviteMessage(sender: string, contact: string): string {
  return renderSystemMix(DEFAULT_SYSTEM_MIX, sender, contact).body;
}
