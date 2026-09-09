export const PUBLIC_POLICY_DATE = "2026-09-09";

export type PublicTrust = { operatorName: string; supportEmail: string; backupRetentionNotice: string };
type PublicTrustEnvironment = Readonly<Record<string, string | undefined>>;

export function publicTrustConfigurationIssues(source: PublicTrustEnvironment = process.env): string[] {
  const issues: string[] = [];
  const name = source.PUBLIC_OPERATOR_NAME?.trim() ?? "";
  const email = source.PUBLIC_SUPPORT_EMAIL?.trim() ?? "";
  const retention = source.PUBLIC_BACKUP_RETENTION_NOTICE?.trim() ?? "";
  if (name.length < 2 || name.length > 160 || /[\r\n\x00-\x1f]/.test(name)) issues.push("PUBLIC_OPERATOR_NAME must identify the service operator");
  if (email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email)) issues.push("PUBLIC_SUPPORT_EMAIL must be a monitored support email address");
  if (retention.length < 30 || retention.length > 1200 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(retention)) issues.push("PUBLIC_BACKUP_RETENTION_NOTICE must describe the actual backup retention and deletion procedure");
  return issues;
}

export function publicTrust(source: PublicTrustEnvironment = process.env): PublicTrust | null {
  if (publicTrustConfigurationIssues(source).length) return null;
  return { operatorName: source.PUBLIC_OPERATOR_NAME!.trim(), supportEmail: source.PUBLIC_SUPPORT_EMAIL!.trim(), backupRetentionNotice: source.PUBLIC_BACKUP_RETENTION_NOTICE!.trim() };
}

export function publicIndexOrigin(source: PublicTrustEnvironment = process.env): string | null {
  if (source.NODE_ENV !== "production" || [source.PRIVATE_TEST_MODE, source.PILOT_MODE, source.DEMO_MODE].some(value => value?.toLowerCase() === "true") || !publicTrust(source)) return null;
  try {
    const url = new URL(source.APP_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}

export const PUBLIC_DOCUMENT_PATHS = ["/", "/privacy", "/terms", "/contact"] as const;
