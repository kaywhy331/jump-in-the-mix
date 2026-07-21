const DEFAULT_COOKIE = "jitm_session";
const DEFAULT_IMPERSONATION_COOKIE = "jitm_impersonation";
const DEFAULT_RATE_LIMIT_SECRET = "local-development-rate-limit-secret";
const isProduction = process.env.NODE_ENV === "production";
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

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
  sessionDays: positiveNumber(process.env.AUTH_SESSION_DAYS, 30),
  sessionTouchMinutes: positiveNumber(process.env.AUTH_SESSION_TOUCH_MINUTES, 5),
  maxSessionsPerUser: positiveNumber(process.env.AUTH_MAX_SESSIONS_PER_USER, 10),
  impersonationMinutes: positiveNumber(process.env.AUTH_IMPERSONATION_MINUTES, 30),
  impersonationTouchMinutes: positiveNumber(process.env.AUTH_IMPERSONATION_TOUCH_MINUTES, 5),
  requireEmailVerification: (process.env.AUTH_REQUIRE_EMAIL_VERIFICATION ?? "false").toLowerCase() === "true",
  requireAdminMfa: (process.env.AUTH_REQUIRE_ADMIN_MFA ?? (isProduction ? "true" : "false")).toLowerCase() === "true",
  adminMfaMaxAgeMinutes: positiveNumber(process.env.AUTH_ADMIN_MFA_MAX_AGE_MINUTES, 12 * 60),
  emailVerificationHours: positiveNumber(process.env.AUTH_EMAIL_VERIFICATION_HOURS, 24),
  passwordResetMinutes: positiveNumber(process.env.AUTH_PASSWORD_RESET_MINUTES, 60),
  authRateLimitSecret:
    process.env.AUTH_RATE_LIMIT_SECRET ??
    process.env.DATA_ENCRYPTION_KEY ??
    DEFAULT_RATE_LIMIT_SECRET,
  dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY ?? "",
  allowedOrigins: commaSeparated(process.env.AUTH_ALLOWED_ORIGINS),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  emailReplyTo: process.env.EMAIL_REPLY_TO ?? "",
  aiProvider: (process.env.AI_PROVIDER ?? "openai").trim().toLowerCase(),
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiModel: process.env.AI_MODEL ?? "gpt-5.6-luna",
  aiBaseUrl: (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripeApiVersion: process.env.STRIPE_API_VERSION ?? "2026-02-25.clover",
  stripeWebhookToleranceSeconds: positiveNumber(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS, 300),
  stripePlusMonthlyPriceId: process.env.STRIPE_PLUS_MONTHLY_PRICE_ID ?? "",
  stripePlusAnnualPriceId: process.env.STRIPE_PLUS_ANNUAL_PRICE_ID ?? "",
  stripeProMonthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
  stripeProAnnualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ?? `${appUrl.replace(/\/$/, "")}/api/integrations/google/callback`,
  googleSyncHours: positiveNumber(process.env.GOOGLE_SYNC_HOURS, 24),
  demoMode: (process.env.DEMO_MODE ?? (isProduction ? "false" : "true")).toLowerCase() === "true",
  demoEmail: process.env.DEMO_USER_EMAIL ?? "demo@jumpinthemix.local",
  demoPassword: process.env.DEMO_USER_PASSWORD ?? "JumpInTheMix123!"
};

export function productionConfigurationIssues(source: NodeJS.ProcessEnv = process.env): string[] {
  if ((source.NODE_ENV ?? "development") !== "production" || source.CI === "true") return [];
  const issues: string[] = [];
  const databaseUrl = source.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) issues.push("DATABASE_URL is required");

  const rateLimitSecret = source.AUTH_RATE_LIMIT_SECRET?.trim() || source.DATA_ENCRYPTION_KEY?.trim() || "";
  if (!rateLimitSecret || rateLimitSecret === DEFAULT_RATE_LIMIT_SECRET || rateLimitSecret.length < 32) {
    issues.push("AUTH_RATE_LIMIT_SECRET must be a unique secret of at least 32 characters");
  }

  const encryptionKey = source.DATA_ENCRYPTION_KEY?.trim() ?? "";
  if (encryptionKey.length < 32) issues.push("DATA_ENCRYPTION_KEY must contain at least 32 characters");

  try {
    const publicUrl = new URL(source.APP_URL ?? "");
    if (publicUrl.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(publicUrl.hostname)) {
      issues.push("APP_URL must be a public https origin");
    }
  } catch {
    issues.push("APP_URL must be a valid absolute URL");
  }

  if ((source.DEMO_MODE ?? "false").toLowerCase() === "true") issues.push("DEMO_MODE must be false");
  return issues;
}
