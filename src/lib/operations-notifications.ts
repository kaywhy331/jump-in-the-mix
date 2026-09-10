import { OPERATIONS_CHECKS, validateOperationsObservation, type OperationsCode, type OperationsState } from "@/lib/operations-policy";
import { publishOperationsSns, type OperationsSnsDestination } from "@/lib/operations-sns";

export function operationsWebhook(source: Readonly<Record<string, string | undefined>> = process.env): URL | null {
  if (!source.OPS_ALERT_WEBHOOK_URL?.trim()) return null;
  try {
    const url = new URL(source.OPS_ALERT_WEBHOOK_URL);
    if (url.username || url.password || url.hash || url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return null;
    return url;
  } catch { return null; }
}
export function operationsDestination(source: Readonly<Record<string, string | undefined>> = process.env): URL | OperationsSnsDestination | null {
  const arn = source.OPS_ALERT_SNS_TOPIC_ARN?.trim();
  if (!arn) return operationsWebhook(source);
  // Ambiguous or malformed configuration must remain visibly unconfigured.
  if (source.OPS_ALERT_WEBHOOK_URL?.trim()) return null;
  const match = /^arn:aws:sns:([a-z]{2}-[a-z]+-\d):\d{12}:([a-zA-Z0-9_-]{1,256})$/.exec(arn);
  if (!match || match[1] !== source.AWS_REGION?.trim()) return null;
  return { kind: "sns", arn, region: match[1] };
}
export async function postOperationsNotice(destination: URL | OperationsSnsDestination, notice: { id: string; code: OperationsCode | "monitor"; kind: string; state: string; observedAt: string; evidence: Record<string, number | null> }) {
  try {
    if (notice.code === "monitor") { if (Object.keys(notice.evidence).length !== 1 || ![0, 1].includes(notice.evidence.unavailable!)) return { accepted: false }; }
    else validateOperationsObservation({ code: notice.code, state: notice.state as OperationsState, evidence: notice.evidence }, true);
    if (!Number.isFinite(new Date(notice.observedAt).getTime()) || !["OPENED", "CHANGED", "REMINDER", "RESOLVED"].includes(notice.kind)) return { accepted: false };
  } catch { return { accepted: false }; }
  const title = notice.code === "monitor" ? "Independent monitor unavailable" : OPERATIONS_CHECKS[notice.code].title;
  const text = `${notice.kind === "RESOLVED" ? "Resolved" : notice.state}: ${title}. Observation: ${notice.observedAt}. Review Admin → Operations → Alerts.`;
  const payload = { service: "jump-in-the-mix", eventId: notice.id, check: notice.code, kind: notice.kind, state: notice.state, observedAt: notice.observedAt, evidence: notice.evidence, text };
  try {
    if (!(destination instanceof URL)) return await publishOperationsSns(destination, payload);
    const response = await fetch(destination, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json", "Idempotency-Key": notice.id }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
    await response.body?.cancel();
    return { accepted: response.ok };
  } catch { return { accepted: false }; }
}
