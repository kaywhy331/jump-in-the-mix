# Homepage and profession-page parity

The owner requested the same page structure on every “Mixes for” destination as the homepage, and removal of “All” so Recruiters fits alongside the other professions.

`PublicLanding` now renders all six pages with the same header, hero and three-Beat demo, workflow explanation, own-voice section, profession directory, waitlist band and footer. Existing profession headlines, supporting copy, demo choices, product boundaries, template links, metadata and waitlist preferences remain specific to the selected profession. Shared composition prevents these pages from drifting apart again.

The navigation has five profession links, without an “All” chip. The logo still returns home. All five links fit on one row at desktop widths from 1280px; at 390px, Recruiters shares the second row with Photographers and Contractors. Narrower layouts wrap naturally, and all links have a 44px touch target.

The supplied landing export, design guidelines, homepage roadmap and indexed copy/ICP references informed the change. The original export is preserved. Existing verified copy is reused; no new pricing, feature, sending or customer-outcome claims are introduced.

Validation and deployment evidence is recorded in `.artifacts/landing-parity-20260919/`:

- TypeScript and schema/syntax/import validation passed.
- All 15 applicable browser tests passed: profession routing, matching section order and colors, navigation row fit, selected-situation continuity into the waitlist, return-home state, homepage metadata, analytics privacy, all 19 demo situations, editor/preview/outcome behavior, keyboard use and no-JavaScript reading.
- Local browser acceptance passed 96 page/layout combinations: six routes, eight widths (320, 390, 834, 1194, 1280, 1440, 1920 and 3840), and both themes. Twelve full-page accessibility scans passed, with 72 channel previews, zero write requests and zero browser errors. Screenshots were checked against the supplied landing composition.

The five runtime files are isolated on `fix/landing-parity-20260919`, commit `0ae2250094b25a0d570974f040641d78fbddff65`, based on the published three-Beat demo. There are no schema, dependency, worker or authenticated-app changes. The production build passed during the integrated Netlify publish. Test-site deploy `6aaf6ca8762d7b3350d714eb` is published at its stable URL, and all 15 fetched assets match the built package. Its 96 layout checks, 12 full-page accessibility scans and 72 channel previews passed, with no write requests. The existing database readiness failure and React 418 hydration warnings remain; staging is not reported as fully healthy.

The customer site is live at https://jumpinthemix.com/ with Render deploy `dep-danms2mgekts739g2qn0`. Postflight matched all 666 manifest source files and 19 public assets against the running build; all 11 public/health probes returned 200. Production acceptance passed the same 96 layout checks, 12 accessibility scans and 72 channel previews with zero browser errors or write requests. The updated public visual-fitment regression also passed against the live site (16 applicable browser tests total).

These are engineering checks, not measured customer outcomes. Rollback, if needed, is a web-only redeploy to `2c2fc68eacb6d6065d9037a612d3fea3ad72068c`; no database or worker rollback is required. The worker remains on `72c2be51b5991f3cba7f3a8c0b28c58471f917d5`; only public presentation changed.
