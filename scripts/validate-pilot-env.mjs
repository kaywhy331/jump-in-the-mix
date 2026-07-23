import "dotenv/config";

const issues = [];
const placeholder = /^(?:change[-_ ]?me|generate[-_ ]?me|jitm|password|secret|example)$/iu;

function requireSecret(name, minimum = 32) {
  const value = process.env[name]?.trim() ?? "";
  if (value.length < minimum || placeholder.test(value)) {
    issues.push(`${name} must be a unique value with at least ${minimum} characters`);
  }
}

if (process.env.NODE_ENV !== "production") issues.push("NODE_ENV must be production");
if (process.env.PILOT_MODE?.toLowerCase() !== "true") issues.push("PILOT_MODE must be true");
if (process.env.DEMO_MODE?.toLowerCase() !== "false") issues.push("DEMO_MODE must be false");

requireSecret("AUTH_RATE_LIMIT_SECRET");
requireSecret("DATA_ENCRYPTION_KEY");

try {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  if (databaseUrl.protocol !== "postgresql:" && databaseUrl.protocol !== "postgres:") {
    issues.push("DATABASE_URL must use PostgreSQL");
  }
  if (!databaseUrl.password || databaseUrl.password.length < 16 || placeholder.test(databaseUrl.password)) {
    issues.push("DATABASE_URL must contain a unique database password with at least 16 characters");
  }
} catch {
  issues.push("DATABASE_URL must be a valid PostgreSQL URL");
}

try {
  const appUrl = new URL(process.env.APP_URL ?? "");
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(appUrl.hostname);
  if ((!loopback || appUrl.protocol !== "http:") && appUrl.protocol !== "https:") {
    issues.push("APP_URL must be loopback HTTP or an HTTPS origin");
  }
} catch {
  issues.push("APP_URL must be a valid absolute URL");
}

if (issues.length) {
  console.error("Pilot configuration is unsafe or incomplete:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Pilot configuration validated.");
