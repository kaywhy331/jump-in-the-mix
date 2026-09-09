**Relationship homepage refinement — September 7, 2026**

Published test deployment: `6a9efeaea8f140cb3cb3b06d` at https://jump-in-the-mix-test.netlify.app/.

The homepage now has deliberately spaced navigation, a smaller top-aligned hero, a direct link to the sample, and a signup invitation immediately after the demo. The relationship headline and Jamie's solo-professional campaign voice are preserved. All 13 Lead, Quote, and Completion steps remain available, including the two calls with four short reminder bullets each.

The first sample shows its message and action immediately. Editing and full-plan exploration are optional disclosures. The phone/email/text links still use the obvious fictional contact, and clipboard denial opens the editor and selects its contents for manual copying.

Business, personal, and networking examples now carry the hero's audience promise through the page. An explicitly illustrative Today list shows the daily workflow, and a short FAQ explains sending control, imports, data export, and getting started. Signup language is consistent in the header, hero, and closing section. Metadata includes a relationship-focused title/description, canonical URL, and a 1200 × 630 branded sharing image.

Representative measurements, including the existing private-test banner:

| Measure | Before | After |
| --- | ---: | ---: |
| Phone header height, 390px width | 154px | 72px |
| Phone hero signup top | 646px | 400px |
| Phone sample height | 1,062px | 777px |
| Phone native-app action top | 1,639px | 1,074px |
| Desktop hero signup top, 1440px width | 896px | 488px |
| Desktop sample height | 982px | 693px |

The full page is longer because it now includes audience examples, the illustrated workflow, and practical questions. The signup and first demo action are substantially earlier in the reading flow. This is a design improvement with measurable layout effects; it is not evidence of a measured conversion uplift.

The production build and TypeScript checks passed. The preview passed all 16 applicable browser tests, with six duplicate viewport/project cases skipped. Coverage includes eight homepage widths, 30 demo layout/accessibility states, four full-page light/dark accessibility states, every native handoff, editing/copy fallbacks, keyboard behavior, registration links, sharing metadata, and privacy signals. Three existing message-rendering unit tests also passed. After publication, all four applicable live checks passed, with two duplicate matrix cases skipped; these repeated homepage geometry, full-page accessibility and signup navigation, and all 13 handoffs on desktop and mobile. All 11 served JavaScript/CSS assets matched the compiled build, and live measurements matched the table above. Native OS applications were not launched, registration forms were not submitted, and no customer records were created by these checks.

Six preview performance runs used fresh browser contexts and disabled HTTP cache. The median LCP was 0.716s on desktop and 1.352s with the same simulated mobile conditions used in the audit: 4× CPU slowdown, 150ms configured latency, and approximately 1.6Mbps download. The first desktop run had a 2.556s LCP with 2.126s time to first byte; this variation warrants real-user monitoring. Observed mobile load layout shift was zero. These lab observations do not establish field Core Web Vitals or conversion rates.

Vendor-neutral `jitm:conversion` hooks are ready for a chosen collector. They contain only event names, placement, channel, version, and coarse viewport category; no drafts, contact information, cookies, or visitor IDs are added. Do Not Track and Global Privacy Control suppress the hooks. Reporting and successful account/contact/follow-up attribution still require a collector and integration at the actual success boundaries. See [the event contract](HOMEPAGE_CONVERSION_EVENTS.md).

The Next.js adapter's compiled output must be used for a manual upload after `netlify build`: `netlify deploy --site 8fd20ccd-5c35-47e5-99ce-98e5670d52fe --dir .netlify/static --no-build`. An initial unpublished preview using the default directory failed asset checks and was removed. The corrected preview's 11 rendered JavaScript/CSS assets matched the compiled build before promotion. The repository's original Netlify site link was preserved.

Release evidence, build/deploy helpers, measurements, and test logs are in `.artifacts/homepage-implementation-2026-09-07/`. The earlier [audit](HOMEPAGE_CONVERSION_AUDIT_2026-09-07.md) records the baseline and remaining research questions, including physical-device/zoom verification and actual conversion performance.
