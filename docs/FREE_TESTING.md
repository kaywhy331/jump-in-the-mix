# Free private testing

The test topology is Netlify Free plus Neon Free PostgreSQL. It uses the same Next.js app, migrations, and scheduled background worker as the hosted release. No paid upgrade is required for this test setup. Free-plan usage limits still apply.

The dedicated test URL is `https://jump-in-the-mix-test.netlify.app`. The production project at `jump-in-the-mix.netlify.app` remains separate.

The test site's fallback worker timer is `.github/workflows/private-test-worker.yml`, running every five minutes on GitHub Actions. Standard hosted runners are free for this public repository. Netlify accepted its minute schedule but did not execute it during deployment qualification, so testing does not rely on that timer. Both timers use the same idempotent job claims if Netlify starts running later. GitHub schedules can be delayed; this is testing infrastructure, not a notification delivery guarantee. Set `WORKER_HEARTBEAT_STALE_SECONDS=1200` on the test site.

The workflow uses the repository secret `JITM_TEST_WORKER_SECRET` and an optional expiry variable `JITM_TEST_EXPIRES_AT`. With no expiry variable, the worker continues running. A configured expiry must be a valid future date; expired or invalid values prevent invocation. The claimed database's original deadline has been removed from both the site and this workflow. Disable the **Private test worker** workflow when testing ends.

## Private access

Set `PRIVATE_TEST_MODE=true`, `PRIVATE_TEST_USERNAME`, and a random `PRIVATE_TEST_PASSWORD` of at least 32 characters. Every dynamic page and API request requires HTTP Basic authentication before normal application authentication. Authentication actions also enforce the private access credentials at their request boundary. Only the exact background-worker endpoint accepts its separately authenticated worker handoff. Missing access credentials make the test site unavailable rather than opening access.

Use `NODE_ENV=production`, HTTPS, strong independent encryption and authentication secrets, `DEMO_MODE=false`, and `PILOT_MODE=false`. The site displays a private-testing banner and sends no-index and no-store headers. Create a normal account after entering the site password. Use sample contacts only.

For private password testing, set `AUTH_REQUIRE_EMAIL_VERIFICATION=false`. Unconfigured Google and Apple options stay hidden. If a provider is partially configured, readiness still fails. Public hosted deployments retain their existing mandatory verification, email, and social-provider checks.

Email sending, verification, magic links, and email password recovery cannot be tested without a configured email provider. For a forgotten test-account password, the operator can run `npx tsx scripts/issue-password-reset-link.ts user@example.com` with the test site's `DATABASE_URL` and `APP_URL`. Give the one-time link directly to that tester; never log or commit it.

## Claimed database

The owner claimed the Neon database, and the claim API confirms its status is `CLAIMED`. The original three-day test deadline has been removed. Its connection is stored only in ignored local deployment artifacts and the hosting secret manager. The test site continues to use the same database and existing data. Keep the project on the Free plan and do not enable paid features.

`PRIVATE_TEST_EXPIRES_AT` remains available as an optional testing deadline but is unset for this deployment. Setting a deadline later closes private access at that time; set `JITM_TEST_EXPIRES_AT` to the same deadline to stop worker invocations too. Test data has no production backup guarantee.

## Google sign-in

Google OAuth configuration requires the owner's Google Cloud login. Create/select a dedicated project and configure Google Auth Platform branding and audience. Use basic `openid`, `email`, and `profile` scopes only; this application does not need Gmail or Google Contacts access. Use a Web application OAuth client:

- Name: `Jump in the Mix testing`
- JavaScript origin: `https://jump-in-the-mix-test.netlify.app`
- Redirect URI: `https://jump-in-the-mix-test.netlify.app/api/auth/oauth/google/callback`

Save the client ID and secret as `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET` in the **test** Netlify project's environment settings, then rebuild/redeploy. Add the intended tester accounts to the audience if the chosen consent-screen configuration requires test users. A separate production client should use the production callback. Never paste the secret into Git or a public issue.

## Apple sign-in

Apple's web setup requires an Apple Developer Program membership (normally USD 99/year; regional pricing and eligible fee waivers vary), a primary app ID enabled for Sign in with Apple, a Services ID associated with that app, and a Sign in with Apple private key. It cannot be provisioned as a new zero-cost service without an existing membership or an applicable waiver.

For an existing membership, register the web domain `jump-in-the-mix-test.netlify.app` and return URL `https://jump-in-the-mix-test.netlify.app/api/auth/oauth/apple/callback`. Store the Services ID in `AUTH_APPLE_CLIENT_ID`, and configure `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, and the `.p8` contents in `AUTH_APPLE_PRIVATE_KEY`. Keep the private key in the hosting secret manager. The app creates short-lived Apple client secrets from this key automatically.

## Sources

- [Netlify pricing](https://www.netlify.com/pricing/)
- [Neon plans](https://neon.com/docs/introduction/plans)
- [Neon claimable databases](https://neon.new)
- [Google web-server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Apple web sign-in requirements](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)
- [Apple Developer enrollment and pricing](https://developer.apple.com/programs/enroll/)
