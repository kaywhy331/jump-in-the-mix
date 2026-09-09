const privateKey = /password|secret|token|cipher|credential|authorization|cookie|body|script|notes|email|phone|address|message/i;
export function redactedAuditData(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[omitted]";
  if (Array.isArray(value)) return value.slice(0, 50).map(v => redactedAuditData(v, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, privateKey.test(key) ? "[redacted]" : redactedAuditData(item, depth + 1)]));
  if (typeof value === "string") return value.replace(/(?:https?:\/\/|postgres(?:ql)?:\/\/)[^\s]+/gi, "[url redacted]").slice(0, 2000);
  return value;
}
