// Only coarse, explicitly allowed values may enter an attached diagnostic summary.
export const SUPPORT_SECTIONS = ["Today", "Contacts", "Mixes", "Calendar", "Journey", "Settings", "Account", "Help"] as const;
const layouts = ["phone", "desktop/tablet"] as const;
const browsers = ["Chrome", "Edge", "Firefox", "Safari", "Other"] as const;
const themes = ["light", "dark", "system"] as const;
const connections = ["online", "offline"] as const;

export type SupportDiagnostics = {
  section: typeof SUPPORT_SECTIONS[number];
  layout: typeof layouts[number];
  browser: typeof browsers[number];
  theme: typeof themes[number];
  connection: typeof connections[number];
};

export function supportBrowserFamily(userAgent: string): SupportDiagnostics["browser"] {
  if (/Edg(?:e|A|iOS)?\//.test(userAgent)) return "Edge";
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Other";
}

export function supportDiagnosticsSummary(raw: string): string {
  if (raw.length > 512) return "";
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    const data = value as Record<string, unknown>;
    const allowed = { section: SUPPORT_SECTIONS, layout: layouts, browser: browsers, theme: themes, connection: connections };
    for (const [key, values] of Object.entries(allowed)) {
      if (typeof data[key] !== "string" || !(values as readonly string[]).includes(data[key] as string)) return "";
    }
    // Construct from allowlisted fields, never serialize or spread the submitted object.
    return `${data.section}; ${data.layout} layout; ${data.browser}; ${data.theme} theme; ${data.connection}`;
  } catch { return ""; }
}

// This is a best-effort aid for a new support report, not a general PII detector.
// Names, addresses and sensitive business details still need the person's review.
// Do not apply this to contacts, saved messages, or custom-field tokens.
export function redactSupportReportText(text: string): string {
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, "[private key removed]")
    .replace(/\b(?:authorization|cookie|set-cookie)\s*:[^\r\n]*/gi, "[credential removed]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "[credential removed]")
    .replace(/\b(?:password|passwd|secret|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|session[_ -]?token)\s*[=:]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi, "[credential removed]")
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]+|\bgh[pousr]_[A-Za-z0-9_]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[credential removed]")
    .replace(/(?:https?:\/\/|postgres(?:ql)?:\/\/|mailto:|sms:|tel:)[^\s<>"']+/gi, "[link removed]")
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+?\d[\d ().-]{5,}\d)/g, match => {
      const digits = match.replace(/\D/g, "").length;
      return digits >= 7 ? "[number removed]" : match;
    });
}

// Match multipart form line endings for the client preview. The server formats
// the received body directly; do not normalize or alter its accepted contract.
export function supportReportBodyForSubmission(body: string): string {
  return body.replace(/\r\n|\r|\n/g, "\r\n");
}

export const SUPPORT_TITLE_LIMIT = 160;
export const SUPPORT_BODY_LIMIT = 5000;

// Single source of truth for the saved report, shared by the server action and the UI preview.
// Inputs are raw strings; trimming and slicing happen here, before redaction, as the server did.
export function formatSupportReport(input: { title: string; body: string; diagnostics?: string; context?: string }) {
  const clip = (text: string, max: number) => text.trim().slice(0, max);
  const rawTitle = clip(input.title, SUPPORT_TITLE_LIMIT);
  const redactedTitle = redactSupportReportText(rawTitle);
  const title = redactedTitle.slice(0, SUPPORT_TITLE_LIMIT);
  const rawBody = clip(input.body, SUPPORT_BODY_LIMIT);
  const report = redactSupportReportText(rawBody);
  const context = clip(input.context ?? "", 100);
  const safeContext = /^(Today|Contacts|Mixes|Calendar|Journey|Settings|Account|Help); (phone|desktop\/tablet) layout$/.test(context) ? context : "";
  const diagnostics = supportDiagnosticsSummary(clip(input.diagnostics ?? "", 513)) || safeContext;
  const attachment = diagnostics ? `\n\nIncluded context: ${diagnostics}` : "";
  const room = SUPPORT_BODY_LIMIT - attachment.length;
  const body = report.slice(0, room) + attachment;
  return {
    title,
    report,
    body,
    titleShortened: input.title.trim().length > SUPPORT_TITLE_LIMIT || redactedTitle.length > SUPPORT_TITLE_LIMIT,
    bodyShortened: input.body.trim().length > SUPPORT_BODY_LIMIT || report.length > room
  };
}
