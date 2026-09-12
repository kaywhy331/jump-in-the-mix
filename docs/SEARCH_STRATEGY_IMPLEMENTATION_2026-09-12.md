# Search and conversion strategy: implementation record (September 12, 2026)

Source: [Jump in the Mix — Brand, Search & Conversion Strategy, v1.0](../assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md). The strategy is a proposal; this record says what was applied to the site, what was adapted, and what remains a gate. Nothing here is a ranking, traffic or conversion claim.

Constraint from the owner: keep the site's existing styling, structure and flow (hero with the interactive demo, "Mixes for" strip, profession marks, waitlist close, questions on `/faq`) while making it searchable. The strategy was not applied verbatim.

## What was applied

| Area | Change | Files |
| --- | --- | --- |
| Homepage intent | Title "Client Follow-Up App", the strategy's meta description, canonical, sharing metadata; H1 "You meant to follow up. Then work happened."; opening copy names the category ("a client follow-up app for independent professionals") in visible text instead of an eyebrow. | `src/app/page.tsx`, `src/lib/public-seo.ts` |
| Mechanism | One compact `#how-it-works` section: "Put client follow-up into a rhythm." with the Mix and Beat definitions and three steps, beside a card with "Keep the rhythm. Keep your own voice." and the plain product definition used for AI-search discoverability. | `src/app/page.tsx`, `src/styles/homepage.css` |
| Routes | The profession marks section is headed "Find a follow-up Mix for your work."; the five marks with pages are ordinary links. Slugs are unchanged (`/for/independent-recruiters` stays; the strategy's `/for/recruiters` was not adopted, per its own "preserve an existing URL" rule). | `src/components/ProfessionMarks.tsx` |
| Profession pages | Per-route title, description, H1, supporting copy, demo call to value ("Try an estimate follow-up", "Try a proposal follow-up", "Try a buyer check-in", "Try an inquiry follow-up", "Try a candidate check-in"), one brand-support line, an honest boundary, and links to the matching template page, the reminders page and the hub. A "Proposal sent" demo mix was added for consultants so the proposal call to value shows a proposal plan. | `src/lib/persona-mixes.ts`, `src/app/for/[profession]/page.tsx` |
| Templates | `/follow-up-templates` hub, `/follow-up-templates/estimate-follow-up` (three texts, one email, copy actions, the sample plan, when to stop) and `/follow-up-templates/proposal-follow-up` (three emails, what to customize, when to stop). All wording is original and labelled illustrative. | `src/app/follow-up-templates/**`, `src/components/CopyText.tsx`, `src/components/PublicArticle.tsx` |
| Reminders | `/features/follow-up-reminders` describes shipped behaviour only: the Today list, the opt-in daily email digest, due push notifications with grouping and quiet hours, the weekly summary, and the outcomes a person records. | `src/app/features/follow-up-reminders/page.tsx` |
| Questions | `/faq` adds "What is a Mix?", "Does it know when someone replies?" and "Do I need a new phone number?" beside the existing four; title "Client follow-up questions". | `src/app/faq/page.tsx` |
| Crawlability | The four new pages join `PUBLIC_DOCUMENT_PATHS` (sitemap and robots allowlist) and the proxy's recovery-hold public list. Footer links reach every public page. Organization, WebSite and SoftwareApplication JSON-LD carry visible facts only: no offers, ratings, reviews or operating systems beyond the browser. | `src/lib/public-trust.ts`, `src/proxy.ts`, `src/components/PublicFooter.tsx`, `src/components/StructuredData.tsx` |
| Default metadata | Layout and manifest descriptions say "client follow-up app" instead of "phone-first CRM". | `src/app/layout.tsx`, `src/app/manifest.ts` |
| Tests | End-to-end specs updated for the new headline, title, routes heading, mechanism section and the two-rows-of-six grid; a new spec covers the four pages, the copy actions and the structured data. | `e2e/public-pages.spec.ts`, `e2e/profession-pages.spec.ts`, `e2e/homepage-conversion.spec.ts`, `e2e/visual-fitment.spec.ts` |

## What was adapted, and why

- **Template paths.** The strategy proposes `/templates/`; the signed-in app already owns `/templates`, so the public hub and its pages live under `/follow-up-templates/`.
- **No eyebrows.** The strategy proposes "CLIENT FOLLOW-UP APP" eyebrows; the owner removed eyebrows from every header on September 11 and 12. The category is stated in the hero copy, the title and the definition card instead.
- **CTA hierarchy kept.** The hero keeps "Join the waitlist" primary and "Try the demo" secondary, as the site had it. The access wording stays "Join the waitlist" because access is a free waitlist with invitations; the strategy's "Create my first Mix" and "Request access" were not used.
- **Navigation kept.** The header adds a "Templates" link beside "Questions" rather than renaming the menu to the strategy's five items; section links hide on phones and the footer repeats them.
- **"Nothing is sent" is qualified.** The public demo opens real text and email links to a fictional or user-entered contact, so the helper says nothing goes out unless the visitor opens their own app and sends it.
- **Phone-number answer.** Written from shipped behaviour (text follow-ups open the person's own messaging app; on a computer the draft is copied), not from a device-compatibility study, which the strategy asks for before publishing that answer.
- **Real-estate, photography and recruiter template pages** are not published; those routes link to the hub. The strategy asks that only complete pages be linked.
- **No A/B claims.** Test 1 and Test 2 wording exists on the pages (the hook headline; the contractor route's "Try an estimate follow-up") but nothing is described as a winner.
- **Measurement.** The existing conversion event adapter already separates demo engagement (`sample_engaged`), handoff requests and signup starts; the strategy's event names were not renamed. `template_copied` is not emitted yet.

## Verified facts the copy relies on

Access is a free waitlist with emailed invitations and no card (`/faq`). Sending is a handoff to the person's own app by default; automatic sending needs an optional connected provider. Replies are never read. Due Beats appear on the Today list; the daily digest, due push notifications and weekly summary are opt-in and off by default (`src/app/(app)/settings/notifications/page.tsx`, `src/lib/notification-delivery.ts`, `src/lib/follow-up-push.ts`). Outcomes are recorded by the person. Personas and demo contacts are fictional.

## Remaining gates

1. Practitioner review of the estimate and proposal examples, with permission and a review date, before any "reviewed by" attribution.
2. Device and messaging-app compatibility validation before making universal handoff claims.
3. Indexing checks on the production origin only: sitemap and robots are emitted only for a configured public production site, never for the private test site.
4. A `template_copied` event and the measurement window in the strategy's section 13, once analytics exist.
5. Customer research (the strategy's section 12) before revising headlines on evidence.
