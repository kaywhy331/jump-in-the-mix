# Jump in the Mix — UI/UX audit, September 5, 2026

**Verdict: a useful product foundation with uneven execution. It is not ready for an award-caliber design claim.** The ordinary contact list and settings hub are reasonably simple, but the plan library, plan setup, tablet layouts, and several important interaction states need work. There are verified accessibility and action-placement defects, not just subjective styling preferences.

This audit resumes the previous session's request to examine every page and section. Per the latest instruction, **no images or screenshots were opened, generated, or visually reviewed in this resumed audit**. Conclusions use the live DOM, computed CSS, element geometry, keyboard interaction, accessibility analysis, and source review. Visual originality, image quality, optical balance, and animation quality remain ungraded. No numerical “design score” is assigned.

| Question | Assessment |
| --- | --- |
| Is the design award winning? | The current experience does not support that claim. Core actions have interaction defects, dark mode has major readability failures, and important workflows require excessive scanning. A visual craft assessment would still be needed after those are addressed. |
| Is it simple and free of clutter? | Partly. Contacts, More, and the settings hub are restrained. The library and plan setup expose too much repeated information, while contact editing is much heavier than contact creation. |
| Is alignment consistent? | Some shared components align correctly. Settings cards share their row's top edge at tablet and desktop widths. The mobile library link collapses, and the plan activation control overlaps bottom navigation. Those exceptions prevent a blanket pass. |
| Does it work equally well on phone, tablet, and PC? | No. Desktop is generally more usable. Phone has a broken library entry point and obscured activation control. Tablet also has the obscured control and unnecessarily tall stacked layouts. Physical devices and non-Chromium browsers were not qualified. |

**Scope and evidence**

Target: `https://jump-in-the-mix-test.netlify.app`, using the existing sample account. Source: the current working tree, including the earlier notification and sales-plan changes. This audit changes documentation only; those implementation changes remain intact.

- Inventory: 43 `page.tsx` files, with public, customer, administrative, token-dependent, and error states distinguished below.
- Main browser sweep: 45 route/state entries at **390 × 844**, **768 × 1024**, and **1440 × 1000**, plus expanded sections and Quick Add states. It produced **162 successful DOM/text records**, of which **138** received automated WCAG A/AA checks through WCAG 2.2. Redirects and repeated states are included in those counts; they are not 162 unique pages.
- Additional checks: expanded address forms, message review, follow-up options, plan management, activation review, keyboard focus, dark mode, and selected layouts at **320 × 740**, **1024 × 768**, and **1920 × 1080**.
- The main sweep found **21 records with violations**: contrast in 16, missing labels in 3, and target size in 2. Repeated pages and redirects mean these are not 21 independent defects. Dark-mode and expanded-state findings are additional.
- None of the 162 main records had document-level horizontal overflow. This did **not** detect the collapsed link or obscured button. Clipped text bounds, small native checkbox boxes, and controls behind a modal were not automatically classified as accessibility failures.
- The private testing banner adds approximately 37 pixels to many pages. Page heights include it, the app shell, and sample content. First-screen counts are not used as hard findings because autofocus and scrolling can change them.
- `npm test -- tests/design-system-accessibility.test.ts`: **3 tests passed**. These source-level checks do not validate rendered colors, all expanded forms, or keyboard behavior. The live audit still found the defects below.

Raw evidence is private and ignored by Git under `.artifacts/design-audit-2026-09-05/text-only/`. The files include account data; do not publish the directory or its session file. The report intentionally omits credentials, session identifiers, contact identifiers, and account activity details.

**What to retain**

The design already has shared color, spacing, radius, and typography tokens; reduced-motion and high-contrast CSS; a compact phone contact list; useful empty states; message previews; a prominent next follow-up; progressive disclosure in several forms; and native dialogs for ordinary sheets and destructive confirmations. Settings-card geometry is consistent within each row. Ordinary Today filter sheets close with Escape and return focus to the trigger in the tested phone and desktop contexts. These are worthwhile building blocks.

**Prioritized findings**

P1 means an important action or accessibility barrier. P2 means substantial workflow friction or inconsistent behavior. P3 means polish or clearer communication. No P0 outage was identified by this design audit.

**F01 · P1 — Plan activation is obscured on phone/tablet and does not behave like its declared modal.**

In a custom plan, choose manual start, select “Turn this plan on,” choose an audience, enter one message, and open the activation review. At 390 × 844, the confirmation button occupies y=771–819 while bottom navigation starts at y=778. A center-point hit test reaches the navigation's More icon. At 768 × 1024, the confirmation button's center also hits navigation. Desktop's button is unobscured. Across all three widths, focus stays outside the review when it opens, Shift+Tab leaves it, and Escape does not close it, despite `aria-modal="true"`.

Use the existing native dialog pattern for this review, with focus entry/return and a scrollable body whose actions remain clear of navigation and safe areas. Acceptance: keyboard focus stays in the open review, Escape closes it, and hit tests on all confirmation-button corners and center reach the button at phone/tablet widths. No plan was activated during verification.

Source: [MixEditor.tsx](<../src/components/MixEditor.tsx#L163>), [MixEditor.module.css](<../src/components/MixEditor.module.css#L54>). Evidence: `targeted/results.json`, entries `activation-keyboard`. Automated axe returned no violations for this state, demonstrating why interaction tests are necessary.

**F02 · P1 — “Ready-made plans” effectively disappears from the phone Plans header.**

At 390 pixels, the link is **2 × 48 pixels**, with `font-size: 0px` and `overflow: hidden`. It contains no replacement icon. The same defect occurs with empty search results. Tablet and desktop display a usable text link. The mobile rule that converts header buttons into icon actions also affects this text-only link; subsequent width overrides collapse it.

Give this destination an explicit visible text treatment or a properly labeled icon with a suitable hit area. Acceptance: its name is visible, its target is at least 44 × 44 pixels, and it opens the library at 320, 390, and 430 pixels.

Source: [components.css](<../src/styles/components.css#L311>), [mobile-ux.css](<../src/styles/mobile-ux.css#L24>), [Plans page](<../src/app/(app)/mixes/page.tsx#L67>). Evidence: `mobile-plans.json`, `mobile-plans-empty.json`, `targeted/results.json`.

**F03 · P1 — Dark mode contains near-unreadable headings and plan content.**

On phone, several page headers retain white backgrounds while their text changes to the dark theme's near-white foreground: measured contrast **1.10:1**. Library step cards retain white backgrounds on both desktop and phone. Their heading contrast is also **1.10:1**, and supporting text reaches only **1.82:1**. White primary-button text on the lighter dark-mode brand color is **2.76:1**, below the required 4.5:1 for the tested button text. The first library page produces 314 affected contrast nodes on phone and 311 on desktop; these mostly repeat a few component defects.

Replace hardcoded surface colors with semantic tokens and define a foreground specifically for each brand-button background. Validate headers, sequence steps, badges, notices, and open dialogs in both themes. Do not treat a root-level dark palette as sufficient coverage.

Source: [product.css](<../src/styles/product.css#L182>), [mobile-ux.css](<../src/styles/mobile-ux.css#L8>), [templates.css](<../src/styles/templates.css#L197>), [base.css](<../src/styles/base.css#L146>). Evidence: `additional/*-dark-*.json`.

**F04 · P1 — Address inputs lack accessible names.**

Contact edit fails the label rule at all three main widths. Expanding “More details” on a new contact exposes the same failure. Street, street line 2, city, state/region, and postal code have nearby labels that are neither associated with IDs nor wrapped around the inputs. Other address fields rely on placeholders rather than a consistent labeling relationship.

Generate stable IDs for every repeated address field and connect every visible label with `htmlFor`. Acceptance: all address inputs have the intended accessible name, clicking each label focuses its field, and both edit and expanded-create states pass the label checks.

Source: [ContactForm.tsx](<../src/components/ContactForm.tsx#L203>). Evidence: `*-contact-edit.json`, `additional/*-states-new-contact-expanded.json`.

**F05 · P2 — The library is too long to compare comfortably.**

The first page renders 24 complete plan cards, including sequence summaries. With the current data it is **22,413 pixels tall on phone**, **18,879 on tablet**, and **9,991 on desktop**: approximately 26.6, 18.4, and 10 viewport heights. Opening the first plan's guidance and messages makes the phone page 25,143 pixels tall. Four filters help retrieval but do not solve the default browsing experience.

Make the default result a compact comparison card: situation, intended audience, approach, number of touches, duration, and one Preview action. Show the full sequence and sources in a focused preview. Consider 6–12 initial results, visible result counts near the filters, and persistent filter access. Acceptance: a person can compare several relevant plans without reading every sequence, and returning from a preview preserves filters and position.

Source: [Templates page](<../src/app/(app)/templates/page.tsx#L14>), [SharedMixPreview.tsx](<../src/components/SharedMixPreview.tsx>). Evidence: `*-templates.json`, `*-template-preview.json`.

**F06 · P2 — Import setup puts the full reference material before the task.**

The NEPQ inquiry setup page expands the approach explanation, sequence, and all prepared messages before the audience/setup form. Total height is **5,303 pixels on phone**, **4,089 on tablet**, and **3,529 on desktop**. Users must locate the settings after a long reference section. This repeats much of what they just inspected in the library.

Lead with plan name, audience, start behavior, and draft status. Keep a concise sequence summary nearby and make full messages/guidance expandable. Preserve source attribution and reply-handling guidance at the point they are useful. Acceptance: the first setup fields are available near the top at every viewport, with an obvious way to review all messages before activation.

Source: [Template setup page](<../src/app/(app)/templates/[sharedMixId]/use/page.tsx#L39>), [TemplateUseForm.tsx](<../src/components/TemplateUseForm.tsx>). Evidence: `*-template-use.json` and corresponding text.

**F07 · P2 — The tablet layout sits between two designs.**

The 768-pixel layout correctly uses bottom navigation, not a sidebar. However, phone-specific compact rows stop at 767 pixels while several stacked-layout rules extend to 900 pixels. The same eight-person Today view grows from 1,704 pixels on phone to 2,451 on tablet; the 12-contact list grows from 1,453 to 4,052; four plans grow from 881 to 2,241. Larger screens should not automatically require much more scrolling for the same work.

Define a deliberate compact tablet layout based on available content width. Keep list rows compact, make header actions economical, and use columns only when they preserve comfortable line lengths. Acceptance: inspect 767, 768, 820, 900, and 1024 pixels, not just one phone and one desktop preset.

Source: [base.css](<../src/styles/base.css#L257>), [mobile-ux.css](<../src/styles/mobile-ux.css>), [desktop-ux.css](<../src/styles/desktop-ux.css>). Evidence: the three devices' `today`, `contacts`, and `plans` records.

**F08 · P2 — Muted text misses contrast requirements on tinted surfaces in light mode.**

The common muted foreground measures **4.28:1** on the lavender surface and **4.39:1** on the gray surface, below 4.5:1 for the affected text. Examples include Today’s highlighted follow-up metadata, contact “Next” metadata, onboarding preview text, account-deletion labels, and Quick Add's interpreted details. This is a repeated token-pair problem.

Define darker text for tinted surfaces and test the actual combinations. Keep the existing hierarchy through size, weight, and spacing rather than relying on insufficient contrast. Evidence: the main contrast records and `additional/*-quick-add-interpreted.json`. Source: [base.css](<../src/styles/base.css#L4>), [product.css](<../src/styles/product.css#L64>).

**F09 · P2 — Help's conversation navigation leads to the wrong screen.**

“My conversations” and “View all conversations” link to `/account#support`. The account page contains no `support` anchor and displays Profile instead. Ticket detail's “All tickets” uses `/account?section=support`, but Account accepts only overview, security, and privacy. Help shows only the five most recent conversations, so the broken destination also undermines access to older threads.

Provide a real conversation list destination and point all three links to it. Acceptance: a user can open all their conversations, find an older thread, and return from a thread without landing on Profile. Live verification confirmed the missing anchor; populated ticket-detail rendering was source-reviewed only.

Source: [Help page](<../src/app/(app)/help/page.tsx#L63>), [Account page](<../src/app/(app)/account/page.tsx#L34>), [Ticket page](<../src/app/(app)/account/tickets/[ticketId]/page.tsx#L59>). Evidence: `targeted/results.json`, `missing-support-destination`.

**F10 · P2 — Notifications mixes reminders to the owner with messages to customers.**

One page includes email reminders, device push permission, and automatic customer sending with its own consent and provider requirements. The phone page is 2,214 pixels tall. The unavailable-email notice tells an ordinary business user to add `RESEND_API_KEY` and `EMAIL_FROM`; this is operator configuration, not a useful customer action. Automatic sending also remains editable when no delivery channel is available.

Separate “Remind me” from “Send to customers,” or place automatic sending in a clearly separate destination. Show unavailable capabilities with a plain explanation and an actionable support route. Keep provider setup details in operator documentation. Preserve per-device push consent and the test-notification control.

Source: [Notifications page](<../src/app/(app)/settings/notifications/page.tsx#L25>). Evidence: `mobile-notifications.txt` and `.json`.

**F11 · P2 — Business categories and plan labels disagree.**

Business settings offers only Home services, Real estate, Insurance & finance, and Other, while the plan library supports additional professional-services, B2B, retail, automotive, and wellness categories. Library goal options also include near-duplicates such as “New clients”/“New customers” and “Past clients”/“Past customers.” Those distinctions are not explained and complicate choosing a filter.

Use one reviewed business taxonomy and one customer vocabulary across onboarding, settings, plans, and search. Preserve old values through aliases or migration. Acceptance: each supported industry can be selected consistently, and equivalent goals return the same intended results.

Source: [Business page](<../src/app/(app)/settings/business/page.tsx#L37>), [Templates page](<../src/app/(app)/templates/page.tsx#L34>). Evidence: `mobile-business.txt`, `mobile-templates.txt`.

**F12 · P2 — Editing a contact is disproportionately heavy.**

Create starts with seven visible input/select/textarea controls in the sampled account. Edit exposes 23 and is 3,692 pixels tall on phone. The distinction is useful for richer records, but routine changes such as correcting a phone number inherit a long address/notes form. Contact detail can grow from 2,416 to 4,034 pixels when expanded.

Retain the simple create flow and give edit similarly clear sections: basics, contact methods, addresses, and notes. Expand populated or intentionally selected sections and preserve a visible save action. Do not remove advanced data to simplify the first screen. Evidence: `mobile-contact-new.json`, `mobile-contact-edit.json`, `mobile-contact-detail-expanded.json`. Source: [ContactForm.tsx](<../src/components/ContactForm.tsx>).

**F13 · P2 — Navigation loses section context inside More.**

Plans correctly remains active on `/templates`, but More does not remain active on `/settings`, `/account`, or `/help`. The active link is only styled with a class; the primary navigation does not expose `aria-current="page"`. The Data & privacy tab shows only deletion, while export is on Profile, making the section labels less predictable.

Map related routes to their parent navigation item, expose current location programmatically, and put export and deletion under the same clearly labeled data section. Acceptance: users can identify their current top-level section visually and through assistive technology on every customer route.

Source: [Nav.tsx](<../src/components/Nav.tsx#L20>), [Account page](<../src/app/(app)/account/page.tsx#L49>). This combines source-confirmed navigation behavior with the rendered account sections.

**F14 · P2 — The public promise does not describe the current sending options precisely.**

The homepage says “You approve every message” and “You decide what gets sent,” while the product now supports opt-in automatic sending without a final tap. “Proven post-job plans” also reads as an effectiveness claim without supporting evidence on the page. The landing page explains benefits and steps clearly, but its source contains no actual product demonstration in the hero.

Describe approval-first as the default and explain optional automatic sending plainly. Replace unsupported effectiveness language with a factual description. A short product demonstration could strengthen understanding; its visual treatment was not evaluated here.

Source: [Homepage](<../src/app/page.tsx>). Browser evidence: `mobile-home.txt`.

**F15 · P2 — Production hydration errors remain in ordinary pages.**

The main sweep recorded two React #418 text-hydration errors per viewport. A focused replay reproduced them while visiting Today and Personal preferences. The rendered pages remained available, but the errors prevent claiming clean browser execution. Initial label-based automation also timed out after some state changes; those checks were rerun with stable field selectors. The audit does not establish that hydration caused those timeouts or identify the mismatched node.

Reproduce with an unminified build, identify the server/client text difference, and correct its source rather than suppressing the warning. Acceptance: fresh authenticated navigation and hydration produce no page errors in the affected routes and timezone contexts. Evidence: `*-browser-errors.json`, `targeted/hydration-check.json`.

**F16 · P3 — Secondary copy and recovery states need a consistency pass.**

The missing-page state is the default 404 with no app-specific recovery action. The expired feedback link asks the visitor to contact the business but provides no contact method in the captured invalid-token state. Administrative concepts such as “survivor,” “normalized,” “queue,” “server timestamp,” and “personal data space” appear in customer-facing duplicate, import, and support copy. Some ordinary secondary text links are only about 20 pixels high; this is an ergonomic concern, not a blanket WCAG failure because spacing and inline-text exceptions matter.

Use task-specific recovery links where the app can safely provide them, plain customer language, and comfortable hit areas for standalone actions. Keep technical detail where it helps an operator make a decision. Sources: duplicate-contact and support pages, `src/app/review/[token]/page.tsx`, and the captured 404/import text.

**Page and section coverage**

“Rendered” means the listed route/state was examined in Chromium at all three main widths. It does not mean every possible database condition or submission succeeded. “Source” means structure and relevant components were reviewed without claiming live layout qualification.

| Page / route | Sections and states reviewed | Assessment / coverage |
| --- | --- | --- |
| `/` | Navigation, hero, setup steps, features, approval explanation | Rendered; clear benefit-led copy; F03, F14. |
| `/login` | Email/password, recovery link, sign-up route | Rendered; simple; dark-mode button contrast fails. Unconfigured social/email-link alternatives were source-reviewed only. |
| `/register` | Name, email, password, existing-account link; closed-registration branch in source | Rendered open form; economical. No account created. |
| `/forgot-password` | Email-unavailable explanation, sign-in recovery; email/sent/error branches in source | Rendered unavailable state; honest limitation, but operator-dependent recovery. |
| `/reset-password` | Incomplete-link recovery; password/confirmation and error branch in source | Rendered without token; valid-token submission not performed. |
| `/verify-email/pending` | Verification guidance, resend form, back navigation | Rendered; no email sent. |
| `/account/deleted` | Deletion confirmation and return to sign-in | Rendered directly; light-mode eyebrow contrast fails. No account deleted. |
| `/offline` | Connection explanation and retry | Rendered directly; actual service-worker offline behavior not requalified. |
| `/review/[token]` | Expired link; rating, private feedback, thanks/referral branches in source | Expired state rendered; valid token and submission not exercised. |
| `/onboarding` | Business information, customer inputs, first follow-up, preview | Rendered; useful preview, long phone form, F08/F11. No onboarding submitted. |
| `/jumps` | Next action, attention list, upcoming/completed/empty filters, message review, snooze/options | Rendered; useful focus on next action. F03/F07/F08/F15. No messages, outcomes, or snoozes submitted. |
| Global Quick Add | Empty composer, interpreted capture, options, close | Rendered on all main widths; focused phone dialog. Interpreted-state contrast fails. Voice and software keyboard not qualified. |
| `/contacts` | Search, contact summaries, empty results; bulk/tool component source | Rendered; compact phone list is a strength. Tablet much taller. Populated bulk selection not exercised. |
| `/contacts/new` | Basics, optional first follow-up, expanded details/address | Rendered default and expanded; F04/F12. No contact saved. |
| `/contacts/[contactId]` | Quick actions, next follow-up, relationship state, notes/timeline, expanded dates/plans | Rendered with sample contact; F08/F12. Long history and attachment variants not qualified. |
| `/contacts/[contactId]/edit` | Names, methods, address, tags, notes, sticky save | Rendered; F04/F12. |
| `/contacts/import` | File entry, sample CSV, three-step explanation; review/result structure in source | Entry rendered. File parsing, populated mapping/issues, queued import, and results were not exercised in this audit. |
| `/contacts/archived` | Search and empty state; populated restoration controls in source | Empty state rendered; populated restore workflow not submitted. |
| `/contacts/duplicates` | Empty state; comparison, survivor choice, confirmation in source | Empty state rendered. Populated comparison and merge not live-qualified; F16. |
| `/contacts/custom-fields` | Add field, empty management; rename/delete in source | Rendered; keep this secondary to contact creation. No schema/data change. |
| `/mixes` | Populated/empty lists, management sheets; expanded details where visible | Rendered; compact phone list, but F02. Management sheet inspected at all main widths. |
| `/mixes/new` | Starter-plan choices and custom-builder entry | Rendered; a useful guided entry, but long on phone. |
| `/mixes/new?custom=1` | Name/start, audience, first step, advanced settings, activation review | Rendered; twelve visible controls before expansion in the sample state. F01/F07. |
| `/mixes/[mixId]/edit` | Existing sequence, timing, audience, save/activation controls | Rendered default and expanded; uses the same activation component as F01. No existing plan saved. |
| `/templates` | Search, goals, industry, approach, 24 cards, pagination, expanded first preview, empty results | Rendered; F03/F05/F11. Earlier plan-library session separately verified author search and pagination behavior. |
| `/templates/[sharedMixId]/use` | Guidance, full messages, audience, start, draft/active choice, summary | Rendered; F06. No import created. |
| `/more` | Settings, account, help, sign-out; desktop extra shortcuts | Rendered; restrained mobile hub. F13 for descendant navigation. |
| `/settings` | Six destination cards | Rendered and geometry checked; row alignment passes. Dark mobile heading contrast fails. |
| `/settings/business` | Business details, services, review URL, signatures | Rendered; useful grouping, F11. No settings saved. |
| `/settings/notifications` | Email, per-device push, automatic sending, quiet-hours link | Rendered; F10. No device subscription, test push, or configuration submitted. |
| `/settings/jump-date-types` | New custom type, management/search, built-ins; rename in source | Rendered with no custom types; secondary concepts need plain examples. |
| `/account` | Profile and exports | Rendered; content grouping concern in F13. No export downloaded. |
| `/account?section=security` | Password form, session list, sign-out controls | Rendered; long session history increases height. No sessions revoked. |
| `/account?section=privacy` | Destructive explanation and reauthentication | Rendered; contrast failure, export absent from this section. No deletion submitted. |
| `/account/preferences` | Name/locale/timezone, follow-up time, weekends, quiet hours | Rendered; two clear groups. F15. Timezone picker variants not comprehensively exercised. |
| `/help` | FAQ/search/topics, expanded answers, support form, recent conversations | Rendered default and expanded; F09/F16. No support message sent. |
| `/account/tickets/[ticketId]` | Thread, reply, resolved/reopen, closed state, metadata | Source; missing-ticket 404 rendered. F09. No populated sample ticket was available. |
| `/account/admin-mfa` | Enroll, challenge, recovery, verified-session components | Source. Ordinary test account redirects to Today; not a live MFA layout pass. |
| `/admin` | Metrics, control destinations, recent activity | Source; ordinary test account redirects to Today. |
| `/admin/users` | Search, customer cards, support-view reason sheet | Source; live admin geometry and impersonation flow not exercised. |
| `/admin/templates` | Create from existing plan, discovery metadata, filters, results | Source; dense authoring and browsing share a page. Separate them if operator use grows. |
| `/admin/templates/[sharedMixId]/edit` | Repair branch, metadata, visibility, scheduling, repeated step fields | Source; “Time, minutes after midnight” should become a time input for human editing. |
| `/admin/settings` | Categories and multiline option editors | Source; suitable operator control, needs populated responsive verification. |
| `/admin/audit` | Search, events, expandable before/after/metadata | Source; disclosure suits technical detail. Large JSON and long identifiers need live checks. |
| `/admin/operations` | Metrics, worker heartbeats, job filters/list, retry controls | Source; verify mobile density and action separation with real failed jobs. |
| `/admin/support` | Metrics, queue filters, ticket results | Source; live dense/populated queue not qualified. |
| `/admin/support/[ticketId]` | Conversation, prepared reply, triage, status, customer context | Source; verify reading/reply order and sticky controls on small screens. |
| Missing route / missing ticket | Default 404 | Rendered; F16. No custom error/loading/not-found component files were found in the app route tree. |

**Recommended order of work**

1. Fix F01–F04 first: activation review, mobile library entry, dark surfaces/button colors, and address labels. These are specific barriers with reproducible checks.
2. Make library browsing and setup compact (F05/F06), then resolve tablet breakpoints (F07). Preserve detailed sales guidance as optional reference material.
3. Resolve shared contrast, support navigation, settings organization, taxonomy, and navigation state (F08–F13). Correct public claims and hydration errors before calling the release polished.
4. Conduct a visual craft pass and physical-device qualification after the functional layout is stable. Include iPhone Safari and the installed PWA, Android Chrome, tablet portrait/landscape, desktop Safari/Firefox/Chromium, software keyboard, 200% text/zoom scenarios, and assistive-technology navigation.

A useful acceptance goal is: each main screen makes its next action evident; complete tasks remain available with keyboard and touch; the library supports comparison without a long reading assignment; all supported themes remain legible; and phone/tablet/desktop layouts are intentionally composed. Automated green checks alone do not establish any of those outcomes.

**Verification limits and reproducibility**

The collection scripts are `.artifacts/design-audit-2026-09-05/capture-text-only.mjs`, `additional-text-checks.mjs`, and `targeted-text-checks.mjs`. They use Playwright and axe, write text/JSON, and make no screenshot or image-view calls. Existing images from the interrupted session were left untouched. Supplementary interaction runs blocked application POST requests as a backstop while opening review dialogs.

The main run had three cleanup timeouts after the Quick Add interpreted state was captured. Both initial activation attempts also hit strict label-selector timeouts. Focused checks subsequently verified Quick Add clearing/closing and activation using stable field selectors. These harness errors are retained in raw progress files and are not counted as successfully inspected states. The hydration errors remain genuine recorded browser findings.

All 43 page files are accounted for in the coverage table, but live qualification is incomplete for restricted administration, valid feedback/reset tokens, populated support threads, populated duplicates, and later import steps. No real customer messages were sent, no campaigns were activated, and no account or business data was intentionally changed. Signing in creates the ordinary test session. This audit is complete as a documented assessment with those limits; it is not a claim that every possible state or device passed.

## September 12 verification

Re-checked on the current tree with the seeded demo account (Playwright and axe, light and dark themes, 390, 768 and 1280px).

- **F01** — resolved earlier: the activation review is a native `<dialog>` opened with `showModal`, traps Tab and Shift+Tab, closes on Escape and returns focus (`src/components/ReviewDialog.tsx`); its actions sit in a sticky footer inside the top layer, clear of the bottom navigation.
- **F02** — resolved earlier: the "Ready-made mixes" link measures 184×48px with visible 16px text at 320, 390 and 430px.
- **F03, F08** — resolved: an axe color-contrast sweep over ten signed-in pages in both themes reported no violations; the muted token is now #56627a (5.3:1 on the lavender surface).
- **F04** — resolved earlier: every address input has an `id` and a `label` with `htmlFor`; the label rule passes on contact edit and on the expanded new-contact form.
- **F07** — improved: a deliberate 768–900px tablet block exists; Today measures 1,530px at 768 against 1,260px at 390 for the demo data, and the contact rows are fixed on September 12 (see the mobile audit follow-up). No further tablet work is planned before launch.
- **F14** — resolved on September 12 with the public-page copy: approval-first is the default, optional automatic sending is explained on `/faq`, and no effectiveness claims remain.
- **F15** — the audit-era mismatches came from the timezone picker computing `Intl.supportedValuesOf` and short zone names during render on a different ICU than the browser; the picker was rewritten on September 9. One live mismatch remained on `/calendar`: the date and time trigger labels formatted with the runtime's default locale. The formatters in `src/lib/when-picker.ts` now default to one fixed locale and the calendar page passes the user's saved locale, and a check across en-GB, en-CA and en-US browsers in three timezones reports no hydration messages on Today, Calendar, new contact, preferences or the mix editor.

