import type { DraftContent, PreparationFamily } from "@/lib/preparation-family";

/**
 * Template wording for a Beat's other channel families, written from the Beat's own wording so every
 * follow-up can switch between text, email and a call. Deterministic and local: the same Beat always
 * yields the same template, merge fields are kept as fields, and an owner-written alternative always
 * replaces the generated one. A call version is bulleted talking points for the owner, never sent.
 */
const SIGNATURE = /\{\{\s*(?:SMS|Email) Signature\s*\}\}/g;
const GREETING = /^\s*(?:hi|hello|hey|good (?:morning|afternoon|evening))\b[^,.!?\n]*[,!.]?\s*/i;
const PRIVATE_NOTE = /\{\{\s*(?:Private Notes?|contact\.private_notes?)\s*\}\}/gi;

const blank = (value: string | null | undefined): value is null | undefined | "" => !value || !value.trim();
const withoutSignature = (text: string) => text.replace(SIGNATURE, "").replace(/[ \t]+\n/g, "\n").trim();

/** Sentence case for a fragment left after removing the greeting ("just checking…" → "Just checking…"). */
const capitalized = (part: string) => part.replace(/^[a-z]/, (letter) => letter.toUpperCase());

/** The message's sentences without its greeting or signature, merge fields intact. */
function sentences(text: string): string[] {
  return withoutSignature(text).replace(GREETING, "").replace(/\s+/g, " ").trim()
    .split(/(?<=[.!?])\s+(?=\S)/).map((part) => capitalized(part.trim())).filter(Boolean);
}

/** A short subject from the message's first sentence, cut at a word boundary. */
function subjectFrom(text: string): string {
  const first = sentences(text)[0]?.replace(/[.!]+$/, "") ?? "";
  if (!first) return "Quick follow-up";
  if (first.length <= 70) return first;
  const cut = first.slice(0, 70);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 30 ? cut.lastIndexOf(" ") : 70).trim()}…`;
}

/** Bulleted notes for a call: open, cover each point of the message, then agree the next step. */
export function talkingPoints(text: string): string {
  const points = sentences(text).map((sentence) => `• ${sentence}`);
  return ["• Say hello and check it’s a good time to talk", ...points, "• Agree the next step before you hang up"].join("\n");
}

/** An email laid out as one: greeting, a blank line, the message, a blank line, the email signature. */
function emailFrom(text: string): DraftContent {
  const clean = withoutSignature(text);
  const greeting = clean.match(GREETING)?.[0].trim() ?? "";
  const message = capitalized(clean.slice(clean.match(GREETING)?.[0].length ?? 0).trim());
  const body = [greeting, message, "{{Email Signature}}"].filter(Boolean).join("\n\n");
  return { subject: subjectFrom(text), body, script: null };
}

function textFrom(email: DraftContent): DraftContent {
  const source = (email.body ?? "").replace(/\n{2,}/g, "\n").replace(SIGNATURE, "{{SMS Signature}}").trim();
  return { subject: null, body: /\{\{\s*SMS Signature\s*\}\}/.test(source) ? source : `${source} {{SMS Signature}}`, script: null };
}

/** A call's notes are private preparation, so written versions invite a call instead of quoting them. */
const CALL_INVITE_TEXT = "Hi {{First Name}}, do you have a few minutes for a quick call this week? {{SMS Signature}}";
const CALL_INVITE_EMAIL: DraftContent = { subject: "Time for a quick call?", body: "Hi {{First Name}},\n\nDo you have a few minutes for a quick call this week? Let me know a time that suits you.\n\n{{Email Signature}}", script: null };

/**
 * The generated template for `target`, from the primary family's content; null when the primary has
 * no wording to work from or already is the target family.
 */
export function generateVariant(primary: PreparationFamily, content: DraftContent, target: PreparationFamily): DraftContent | null {
  if (primary === target) return null;
  if (primary === "CALL") {
    if (blank(content.script)) return null;
    return target === "TEXT" ? { subject: null, body: CALL_INVITE_TEXT, script: null } : CALL_INVITE_EMAIL;
  }
  if (blank(content.body)) return null;
  const body = content.body.replace(PRIVATE_NOTE, "").trim();
  if (target === "CALL") return { subject: null, body: null, script: talkingPoints(body) };
  if (target === "EMAIL") return emailFrom(body);
  return textFrom({ ...content, body });
}
