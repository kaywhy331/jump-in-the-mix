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
