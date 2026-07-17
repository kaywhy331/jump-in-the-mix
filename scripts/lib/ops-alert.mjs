function safeDetails(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.slice(0, 2000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeDetails(item, depth + 1));
  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      if (/secret|token|password|credential|key/i.test(key)) {
        output[key] = "[redacted]";
      } else {
        output[key] = safeDetails(item, depth + 1);
      }
    }
    return output;
  }
  return String(value).slice(0, 2000);
}

export async function sendOpsAlert({ title, severity = "error", summary, details = {} }) {
  const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return { delivered: false, reason: "not-configured" };

  const payload = {
    service: "jump-in-the-mix",
    environment: process.env.NODE_ENV ?? "unknown",
    severity,
    title,
    summary,
    timestamp: new Date().toISOString(),
    details: safeDetails(details),
    text: `[${severity.toUpperCase()}] ${title}: ${summary}`
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      return { delivered: false, reason: `http-${response.status}` };
    }
    return { delivered: true };
  } catch (error) {
    return {
      delivered: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}
