# Design detail deployment — September 20, 2026

The [pane and interaction refinements](DESIGN_DETAIL_REVIEW_2026-09-20.md) are published at [the stable test site](https://jump-in-the-mix-test.netlify.app/).

- Site: `8fd20ccd-5c35-47e5-99ce-98e5670d52fe` (`jump-in-the-mix-test`).
- Deploy: `6ab03690b7561cda45f6c156`, published at `2026-09-20T19:42:43.923Z`.
- [Netlify deployment record](https://app.netlify.com/projects/jump-in-the-mix-test/deploys/6ab03690b7561cda45f6c156).
- Previous published deploy: `6aaf6ca8762d7b3350d714eb` on the same test site.

The isolated release was built with the test site's configuration and an explicit site ID. The checkout's separate Netlify link was preserved. The preview passed public-route checks, and all 17 rendered static assets matched the local adapter output before promotion. The application files in the package match the reviewed working tree. The web handler, recovery probe, background worker and minute schedule were included together.

No schema migration was needed. The package's schema and migration files match the previous staging package, including the [documented historical trailing newline](../HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md) restored only in the isolated copy. Database history was not changed.

## Published verification

- The homepage, FAQ, two profession pages and liveness endpoint return 200. All 17 rendered assets match the release output on both the preview and stable URLs.
- Twelve public-page combinations (homepage, contractors and FAQ; 390/1440px; light/dark) pass overflow and axe WCAG A/AA checks on the stable domain. The homepage demo renders and the phone menu opens, closes with Escape and remains usable.
- The stable domain still emits the React 418 hydration warning already recorded in the [Contacts implementation](CONTACTS_IMPLEMENTATION_2026-09-19.md) and [landing parity release](LANDING_PARITY_2026-09-19.md). Stable-domain browser acceptance therefore remains incomplete. The same twelve checks on this deployment's direct URL pass with no browser exceptions or failed static assets, confirming that the known domain-specific warning persists separately from the uploaded application. Both failed and accepted logs are retained.
- Readiness, worker health and login return 503. The recovery probe returns HTTP 200 with body `status: unavailable`; this is not a passing recovery check. No authenticated hosted workflow or unattended worker success is claimed.

The initial browser harness waited for network idleness and timed out. The rerun waits for document readiness, fonts and the interactive demo instead, and keeps the layout, accessibility and runtime-error assertions. Phone/light and desktop/dark screenshots were also visually inspected.

## Existing database outage

Before the deployment, the test database refused connections with PostgreSQL code `53000`: the account or project quota was exceeded. Readiness and worker endpoints already returned 503. The design release does not restore database capacity; authenticated pages and background processing cannot be qualified while this condition persists. Private access and recovery checks remain enabled. No billing, database or customer-site configuration was changed.

Evidence, source hashes, private build configuration, publication receipt and verification results are retained under the ignored `.artifacts/design-deploy-20260920/`. Private configuration files must not be shared. Post-publication browser verification is recorded separately from the successful local workflow tests in the detail review.
