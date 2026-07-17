# Browser-driven end-to-end coverage

Jump in the Mix uses Playwright to exercise authenticated workflows in a real Chromium browser after the production build, database migrations, TypeScript validation, and the unit/PostgreSQL integration suite pass.

## Projects

The checked-in configuration runs:

- **desktop-chromium** using a desktop Chrome profile.
- **mobile-chromium** using a Pixel 7 viewport, touch input, and mobile user agent.

CI uses one worker so the seeded workspace and administrator MFA lifecycle remain deterministic. A failed test retains its trace, screenshot, and video; CI uploads those files as the `browser-e2e-diagnostics` artifact.

## Covered workflows

### Workspace user

The same primary journey runs on desktop and mobile:

1. Password sign-in.
2. Open the Jump queue and confirm a rendered Jump task and the Due filter.
3. Open Contacts and the four acquisition lanes.
4. Confirm the progressive Quick Add control, CSV/VCF import, and Google Contacts paths.
5. Open the platform Mix Template library and confirm a seeded human-readable Mix.
6. Open the AI Mix Wizard and confirm either the built-in strategist or configured provider state.
7. Open Help, submit a real private support ticket, follow the redirect, and confirm the threaded ticket page.

### Device Contact Picker / Quick Add

Normal Chromium does not expose the Contact Picker API, so the primary journey confirms the compact manual fallback. A separate mobile test injects the standards-shaped `navigator.contacts` interface, selects a Contact containing a name, email, phone, and address, calls the real `/api/contacts/quick-add` endpoint, and confirms the created/merged result.

This proves both branches of the progressive enhancement without pretending that CI has access to a physical address book permission dialog. Physical Android qualification remains a device test.

### Platform administration

The desktop administrator journey:

1. Signs in as a seeded platform administrator.
2. Confirms that opening Admin redirects to required MFA enrollment.
3. Reads the generated TOTP secret, submits the current password and current TOTP code, and confirms ten one-time recovery codes.
4. Opens the Admin overview.
5. Clears the browser session, signs in again, and confirms that Admin requires a fresh second factor.
6. Uses one recovery code and opens Admin Support.
7. Starts an audited, time-limited view-only support session for the demo workspace.
8. Attempts a real Quick Add POST while impersonating and confirms the central browser boundary returns HTTP 403.
9. Ends the support view and confirms the administrator returns to the User directory.

## Local execution

Start PostgreSQL and configure `.env`, then run:

```bash
npm install --no-audit --no-fund
npm run db:generate
npm run db:deploy
RESET_DEMO_DATA=true DEMO_MODE=true npm run db:seed
npm run db:seed:e2e-admin
npx playwright install chromium
AUTH_REQUIRE_ADMIN_MFA=true npm run build
PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start" npm run test:e2e
```

The default test identities are local-only and may be overridden with:

```text
E2E_USER_EMAIL
E2E_USER_PASSWORD
E2E_ADMIN_EMAIL
E2E_ADMIN_PASSWORD
```

Never create these deterministic credentials in a production database.

## CI order

The GitHub Actions quality gate runs:

1. Dependency installation.
2. Legacy baseline drift verification.
3. Prisma generation and static validation.
4. Populated, rollback/reapply, clean, administrator-control-plane, and administrator-MFA migration rehearsals.
5. PostgreSQL provisioning.
6. TypeScript validation.
7. Unit and PostgreSQL integration tests.
8. Production build.
9. Deterministic browser-test seed.
10. Chromium installation.
11. Desktop and mobile Playwright projects.

A browser failure cannot be hidden by a successful build or unit test, and diagnostics are retained for review.

## Deliberate boundaries

Checked-in browser coverage does not claim external-provider production qualification. The following still require controlled staging or provider test environments:

- Real Android Contact Picker permissions and OEM behavior.
- Google OAuth consent, token refresh, revoked credentials, label selection, and incremental People API responses.
- Stripe test-mode Checkout, Customer Portal, signed webhook delivery, duplicate events, failed payment, cancellation, downgrade, and referral-bank handoff.
- Production email delivery and inbox placement.
- A real encrypted-backup restoration followed by the web and worker smoke matrix.

Those tests should reuse the same Playwright conventions but must run against isolated provider accounts and disposable staging data.
