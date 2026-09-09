# Public notices and operator configuration

The application now implements `/privacy`, `/terms` and `/contact`, linked from the homepage, registration, waitlist and sign-in pages. The copy describes the current free invitation release, account controls, messaging choices, provider processing, browser voice features, support access and retention. It does not invent an operator, address, response deadline, governing law or legal-compliance claim.

Publication needs three actual operating values, supplied to both web and worker through the hosting environment:

| Variable | Content |
| --- | --- |
| `PUBLIC_OPERATOR_NAME` | The business or individual responsible for operating the service |
| `PUBLIC_SUPPORT_EMAIL` | A monitored public mailbox for account, privacy and support requests |
| `PUBLIC_BACKUP_RETENTION_NOTICE` | A plain-language description of the actual backup window, handling of deleted records in retained backups, and backup/provider deletion procedure |

The third value must describe the configured system. Choose and verify independent backup storage and expiry before writing it; the synthetic 30-day notice used in tests is not a production decision. See [External data retention](EXTERNAL_DATA_RETENTION.md) for the provider inventory, published retention references and required operational evidence. Provider settings, launch markets and operator obligations must agree with the public copy.

The effective date is September 9, 2026, defined in `src/lib/public-trust.ts`. Update it when the information practices or terms change. The maintained copy lives in [Privacy](../src/app/privacy/page.tsx), [Terms](../src/app/terms/page.tsx) and [Contact](../src/app/contact/page.tsx); this document does not duplicate it.

When any required value is missing or malformed, the policy routes return 404, their navigation links are omitted, and public production readiness returns 503. Private test and loopback pilot environments can still run without asserting a fictitious public operator. Configured public production sites publish only the homepage and these three pages in their sitemap and crawler allowlist. Private, pilot, demo or unconfigured environments disallow crawling. Robots rules do not replace authentication.

Local packaged-app verification passed five browser cases covering anonymous navigation, configured values, support email links, 320/1440-pixel layouts and WCAG checks in light and dark mode. A separate unconfigured production process returned 404 for privacy and 503 for readiness. This is implementation evidence; the real operator values, hosting and mailbox remain unqualified.
