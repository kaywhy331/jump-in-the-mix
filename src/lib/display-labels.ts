/** Customer-facing channel names ("Text", "Phone call"), never raw enum values. */
export function channelName(channel: string): string {
  const names: Record<string, string> = { SMS: "Text", EMAIL: "Email", PHONE_CALL: "Phone call", VOICEMAIL: "Voicemail", WHATSAPP: "WhatsApp" };
  if (names[channel]) return names[channel];
  const words = channel.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A send time stored as minutes after midnight, in the reader's clock style (e.g. "10:00 AM"). */
export function timeOfDayLabel(minutes: number, locale = "en-US"): string {
  const safe = Math.min(Math.max(Math.trunc(minutes), 0), 24 * 60 - 1);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, Math.floor(safe / 60), safe % 60)));
}
