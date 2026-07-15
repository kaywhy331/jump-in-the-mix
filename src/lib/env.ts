const DEFAULT_COOKIE = "jitm_session";

export const env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  cookieName: process.env.AUTH_COOKIE_NAME ?? DEFAULT_COOKIE,
  sessionDays: Number(process.env.AUTH_SESSION_DAYS ?? 30),
  demoMode: (process.env.DEMO_MODE ?? "true").toLowerCase() === "true",
  demoEmail: process.env.DEMO_USER_EMAIL ?? "demo@jumpinthemix.local",
  demoPassword: process.env.DEMO_USER_PASSWORD ?? "JumpInTheMix123!"
};
