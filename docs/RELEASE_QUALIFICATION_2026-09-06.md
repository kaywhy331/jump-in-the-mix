# Release qualification — September 6, 2026

This continuation starts from `89a4bcd`. Final local verification, publication to the dedicated test site, and local cleanup are complete. The verified release is **`6a9df82f5e20059eddb45226`** at https://jump-in-the-mix-test.netlify.app. This record does not certify an external launch.

## Changes

- The account-confirmation dialog no longer contains a second `main` landmark. The original accessibility, route-continuity, and layout checks exposed the duplicate even when the dialog was closed.
- Contact forms keep pointer-focused buttons and disclosures stationary until activation. Previously, a disclosure partly behind the sticky Save bar moved 44 pixels between pointerdown and pointerup and failed to open. Keyboard-visible focus retains the existing scrolling behavior. The regression positions the disclosure at that boundary and checks both pointer reachability and successful opening; it fails against the preceding build.
- Docker source contexts exclude Netlify state, Wrangler state, development secrets, environment files, and private artifacts at every directory depth.
- `PLAYWRIGHT_CAPTURE=off npm run test:e2e` disables screenshots, videos, and traces in the standard browser configuration. The screenshot-comparison case is explicitly skipped in this mode; DOM, keyboard, geometry, and accessibility checks remain enabled. Mutating browser tests still require an isolated loopback fixture database and synthetic accounts.
- Browser fixtures account for existing support conversations and restore completed Today history between cases. The previous history case canceled records required by the subsequent native-zoom case. The landing-page assertion now uses the approved current copy.

## Verification record

Production dependency audit, Prisma generation, schema/syntax/import checks, TypeScript, all four populated migration/rollback rehearsals, deployment of all 24 migrations to an isolated loopback database, a standalone production build, and a seeded encrypted backup/restore rehearsal passed.

The final unit/integration run passed **382 cases across 82 files, with no skips**, using `npm test -- --maxWorkers=1` against the freshly migrated loopback database. Assertions and test time limits are unchanged. The earlier run failed three recovery cases because the local PostgreSQL 17 client loaded a PostgreSQL 16 library; matching version 16 binaries and libraries resolved that error. A later four-worker run hit existing 5–10 second test/setup limits under shared-machine load, including setup continuing after cleanup. The serial run avoids that local contention; it does not claim the four-worker GitHub job was run successfully.

The broad browser run after the landmark fix passed 138 cases and failed four. It intentionally skipped 36 project entries: 30 scenarios run in their designated project, two legacy-worker cases require the separate HTTPS fixture, two staging-smoke entries require their explicit staging configuration, and two visual comparisons require screenshot capture. The subsequent disclosure diagnostics and failing regression remain recorded rather than being replaced by a passing retry.

The final complete text-only browser run passed **142 cases, with zero failures and the 36 intentional skips above**, in 18.5 minutes. It used the fixed production build, freshly migrated and seeded loopback database, standard desktop/mobile Chromium projects, one browser worker, and zero retries. The deterministic disclosure regression passes in both projects. Native Chromium zoom passes immediately after the completed-history case at 100%, 200%, and 400%, covering 12 pending/history/theme states and verified widths of 1280, 640, and 320 CSS pixels. No image, video, or browser-trace artifact was generated.

The Netlify adapter build passed. All 11 rendered CSS and JavaScript assets matched the local build hashes on the uploaded preview and again after its promotion to the dedicated test URL. The final read-only hosted sweep passed **30 states**: journey settings, journey, contact detail, contact edit, and Today, each in both themes at widths of 320, 390, and 1440 CSS pixels. Contact edit used a height of 720 pixels to check the disclosure against the sticky Save bar; other views used 900 pixels. Every state had one main landmark, zero axe violations, zero page errors, and no horizontal overflow. There were no account retries or platform challenges. Contact/journey mutation routes were blocked defensively; zero mutation requests occurred.

The hosted report also retains 131 network events: 31 Content Security Policy blocks for the Netlify toolbar script and 100 aborted requests to browser-context or application routes. These diagnostics are separate from the passing page and accessibility assertions; this report does not claim zero network events.

Lighthouse performance remains unqualified under the no-trace instruction. This machine has no container runtime, so no container-build result is claimed. These local checks are not a complete GitHub Actions run or field Core Web Vitals qualification. The final full browser run used Chromium desktop/mobile; prior Firefox and WebKit evidence remains historical.

## Data and release boundaries

Hosted checks before and after publication preserve **13 contacts, five plans**, and plan fingerprint `ecb00c8309d0d7054e1a92c6a6a0a353d97309fa2c12371da9865e612f4f0c39`. Automatic-sending workspaces and push subscriptions remain zero. Resend/Twilio customer-delivery configuration and the operations-alert webhook remain absent. Existing Web Push keys remain configured, with no subscriptions or opt-in. No hosted fixtures or customer-delivery settings were changed.

Web and database health returned 200 before and after the hosted sweep. Worker health returned 503 before browsing and 200 afterward. This supports activity-triggered recovery, not unattended recurrence.

Publication targeted only test site `8fd20ccd-5c35-47e5-99ce-98e5670d52fe`; the separate production-site link `43280ec7-18ff-46f1-a583-17e2a52f66c5` remains preserved. The preview was promoted once, and the published deployment receipt records state `ready`.

The optional Cloudflare timer remains inactive pending explicit service/secret-storage approval and confirmation of Workers Free. Physical devices, assistive technology, owner usability, provider-specific connections, unattended scheduling, and the other [product quality gates](PRODUCT_QUALITY_GATES.md) remain separate requirements.

Raw logs, text-only browser reports, private environment files, and diagnostics are under ignored `.artifacts/release-qualification-2026-09-06/`, with directory permissions `0700`. That directory must not be published. Final source hashes match the seven application/configuration/test files recorded before deployment.

Cleanup removed only the owned release-rehearsal database, `jitm_design_ci_release_bd2ca9f47964`; its receipt confirms that database is absent and the original `jitm_design_20260905` database remains present. The original PostgreSQL listener remains on `127.0.0.1:55441`. The owned application server has stopped, and port 3102 has no listener. Unrelated services remain running.
