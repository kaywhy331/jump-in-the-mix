import { privateTestConfigurationIssues, privateTestEnabled } from "@/lib/private-test";

const DEFAULT_COOKIE = "jitm_session";
const DEFAULT_IMPERSONATION_COOKIE = "jitm_impersonation";
const DEFAULT_RATE_LIMIT_SECRET = "local-development-rate-limit-secret";
const isProduction = process.env.NODE_ENV === "production";
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

function enabled(value: string | undefined, fallback = false): boolean {
  return (value ?? String(fallback)).toLowerCase() === "true";
}

type AuthRateLimitEnvironment = Partial<Pick<NodeJS.ProcessEnv, "AUTH_RATE_LIMIT_SECRET" | "DATA_ENCRYPTION_KEY">>;

export function resolveAuthRateLimitSecret(source: AuthRateLimitEnvironment = process.env as AuthRateLimitEnvironment): string {
  return source.AUTH_RATE_LIMIT_SECRET?.trim()
    || source.DATA_ENCRYPTION_KEY?.trim()
    || DEFAULT_RATE_LIMIT_SECRET;
}

export function sessionCookieSecure(source: NodeJS.ProcessEnv = process.env): boolean {
  if ((source.NODE_ENV ?? "development") !== "production") return false;
  try {
    const url = new URL(source.APP_URL ?? "");
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (enabled(source.PILOT_MODE) && loopback && url.protocol === "http:") return false;
  } catch {
    // Invalid production URLs are rejected by productionConfigurationIssues.
  }
  return true;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function commaSeparated(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  appUrl,
  cookieName: process.env.AUTH_COOKIE_NAME ?? DEFAULT_COOKIE,
  impersonationCookieName: process.env.AUTH_IMPERSONATION_COOKIE_NAME ?? DEFAULT_IMPERSONATION_COOKIE,
  sessionDays: positiveNumber(process.env.AUTH_SESSION_DAYS, 14),
  sessionTouchMinutes: positiveNumber(process.env.AUTH_SESSION_TOUCH_MINUTES, 5),
  maxSessionsPerUser: positiveNumber(process.env.AUTH_MAX_SESSIONS_PER_USER, 10),
  impersonationMinutes: positiveNumber(process.env.AUTH_IMPERSONATION_MINUTES, 30),
  impersonationTouchMinutes: positiveNumber(process.env.AUTH_IMPERSONATION_TOUCH_MINUTES, 5),
  requireEmailVerification: (process.env.AUTH_REQUIRE_EMAIL_VERIFICATION ?? "false").toLowerCase() === "true",
  requireAdminMfa: (process.env.AUTH_REQUIRE_ADMIN_MFA ?? (isProduction ? "true" : "false")).toLowerCase() === "true",
  adminMfaMaxAgeMinutes: positiveNumber(process.env.AUTH_ADMIN_MFA_MAX_AGE_MINUTES, 12 * 60),
  emailVerificationHours: positiveNumber(process.env.AUTH_EMAIL_VERIFICATION_HOURS, 24),
  passwordResetMinutes: positiveNumber(process.env.AUTH_PASSWORD_RESET_MINUTES, 60),
  oauthStateMinutes: positiveNumber(process.env.AUTH_OAUTH_STATE_MINUTES, 10),
  authRateLimitSecret: resolveAuthRateLimitSecret(),
  secureSessionCookie: sessionCookieSecure(),
  dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY ?? "",
  allowedOrigins: commaSeparated(process.env.AUTH_ALLOWED_ORIGINS),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  emailReplyTo: process.env.EMAIL_REPLY_TO ?? "",
  authGoogleClientId: process.env.AUTH_GOOGLE_CLIENT_ID ?? "",
  authGoogleClientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET ?? "",
  authAppleClientId: process.env.AUTH_APPLE_CLIENT_ID ?? "",
  authAppleTeamId: process.env.AUTH_APPLE_TEAM_ID ?? "",
  authAppleKeyId: process.env.AUTH_APPLE_KEY_ID ?? "",
  authApplePrivateKey: (process.env.AUTH_APPLE_PRIVATE_KEY ?? "").replaceAll("\\n", "\n"),
  vapidPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.WEB_PUSH_VAPID_SUBJECT ?? process.env.EMAIL_FROM ?? "mailto:hello@jumpinthemix.app",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
  pilotMode: enabled(process.env.PILOT_MODE),
  privateTestMode: privateTestEnabled(),
  demoMode: enabled(process.env.DEMO_MODE),
  demoEmail: process.env.DEMO_USER_EMAIL ?? "",
  demoPassword: process.env.DEMO_USER_PASSWORD ?? ""
};

export function productionConfigurationIssues(source: NodeJS.ProcessEnv = process.env): string[] {
  if ((source.NODE_ENV ?? "development") !== "production" || source.CI === "true") return [];
  const issues: string[] = [];
  const privateTest = privateTestEnabled(source);
  issues.push(...privateTestConfigurationIssues(source));
  const databaseUrl = source.DATABASE_URL?.trim() || source.NETLIFY_DB_URL?.trim() || "";
  if (!databaseUrl) issues.push("DATABASE_URL is required");

  const rateLimitSecret = source.AUTH_RATE_LIMIT_SECRET?.trim() || source.DATA_ENCRYPTION_KEY?.trim() || "";
  if (!rateLimitSecret || rateLimitSecret === DEFAULT_RATE_LIMIT_SECRET || rateLimitSecret.length < 32) {
    issues.push("AUTH_RATE_LIMIT_SECRET must be a unique secret of at least 32 characters");
  }

  const encryptionKey = source.DATA_ENCRYPTION_KEY?.trim() ?? "";
  if (encryptionKey.length < 32) issues.push("DATA_ENCRYPTION_KEY must contain at least 32 characters");

  try {
    const publicUrl = new URL(source.APP_URL ?? "");
    const pilotMode = enabled(source.PILOT_MODE);
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(publicUrl.hostname);
    const validPilotOrigin = pilotMode && loopback && publicUrl.protocol === "http:";
    const validHostedOrigin = !pilotMode && publicUrl.protocol === "https:" && !loopback;
    if (!validPilotOrigin && !validHostedOrigin) {
      issues.push("APP_URL must be a public https origin");
    }
  } catch {
    issues.push("APP_URL must be a valid absolute URL");
  }

  if ((source.DEMO_MODE ?? "false").toLowerCase() === "true") issues.push("DEMO_MODE must be false");
  if (!enabled(source.PILOT_MODE)) {
    if (!privateTest && !enabled(source.AUTH_REQUIRE_EMAIL_VERIFICATION)) issues.push("AUTH_REQUIRE_EMAIL_VERIFICATION must be true for hosted production");
    if (!privateTest || enabled(source.AUTH_REQUIRE_EMAIL_VERIFICATION) || source.RESEND_API_KEY || source.EMAIL_FROM) {
      if (!source.RESEND_API_KEY?.trim()) issues.push("RESEND_API_KEY is required for hosted production");
      if (!source.EMAIL_FROM?.trim()) issues.push("EMAIL_FROM is required for hosted production");
    }
    if (!privateTest || source.AUTH_GOOGLE_CLIENT_ID || source.AUTH_GOOGLE_CLIENT_SECRET) {
      if (!source.AUTH_GOOGLE_CLIENT_ID?.trim() || !source.AUTH_GOOGLE_CLIENT_SECRET?.trim()) issues.push("Google sign-in credentials are required for hosted production");
    }
    if (!privateTest || source.AUTH_APPLE_CLIENT_ID || source.AUTH_APPLE_TEAM_ID || source.AUTH_APPLE_KEY_ID || source.AUTH_APPLE_PRIVATE_KEY) {
      if (!source.AUTH_APPLE_CLIENT_ID?.trim() || !source.AUTH_APPLE_TEAM_ID?.trim() || !source.AUTH_APPLE_KEY_ID?.trim() || !source.AUTH_APPLE_PRIVATE_KEY?.trim()) issues.push("Apple sign-in credentials are required for hosted production");
    }
  }
  return issues;
}
