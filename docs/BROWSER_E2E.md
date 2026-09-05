# Browser end-to-end coverage

Playwright runs the production application in desktop Chromium and a Pixel 7 profile. Tests are serial because seeded accounts and MFA state are shared. Failures retain trace, screenshot, and video artifacts.

The suite covers:

- password sign-in, onboarding, and a first prepared message with resolved placeholders;
- Today actions, native-composer return flow, outcomes, undo, and contact history;
- live contact search, compact add/edit, archive/restore, duplicate review, and queued import status;
- device Contact Picker fallback plus an injected supported-browser API path;
- simple plan authoring and one-screen use of a ready-made plan;
- fixed responsive contact layout, readable controls, overflow protection, dialogs, and visual primitives;
- unavailable retired routes;
- export/account-deletion and stale-session behavior;
- administrator MFA enrollment, recovery-code step-up, support view, and mutation rejection;
- staging web/database/worker health and authenticated route smoke.

## Local execution

After applying migrations and building:

```bash
RESET_DEMO_DATA=true DEMO_MODE=true npm run db:seed
npm run db:seed:e2e-admin
npx playwright install chromium
PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start" npm run test:e2e
```

The normal seeded identities are local-only and can be overridden with `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `E2E_ADMIN_EMAIL`, and `E2E_ADMIN_PASSWORD`. Never create deterministic browser-test credentials in production.

The CI order is schema/static validation → migration rehearsal → database deployment → typecheck → unit/integration tests → production build → seed → encrypted backup/restore rehearsal → browser tests. Accessibility scans and Lighthouse budgets run against the same built application.

External checks remain explicit: real Android Contact Picker permission, iPhone/Android native SMS/email/call handoffs, Apple and Google provider consent, email inbox placement, push permission and delivery, and Twilio carrier behavior require controlled staging or physical devices. Record physical results in [Manual device qualification](MANUAL_DEVICE_QUALIFICATION.md).
