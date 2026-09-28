# Migration ledger — superseded authorities → JITM standards (2026-09-28)

Owner decision D3 (2026-09-28) made the JITM standards the authority in place of:
- `docs/CANONICAL_PRODUCT_DECISIONS.md`;
- `docs/design/DESIGN_GUIDELINES.md`;
- the product-language and convention sections of `CONTRIBUTING.md`;
- `docs/UX_WORKFLOW_OPTIMIZATION.md`;
- the rule sections of the previous `AGENTS.md`.

This ledger shows where every rule, paragraph or bullet of those sources lives now, so nothing is dropped silently.

How to read it:
- **Where it lives now** names the home rule (`JITM-NN §2.N`) or section. `historical` means the content was deliberately not carried forward, and the reason says why: superseded by a newer owner decision, a dated status, or a retired rule.
- **Source** gives line numbers in the document as it stood on `origin/main` at 9439fd6.
- The superseded documents stay in the repository as history, each with a one-line banner.
- `npm run standards:check` verifies that every `JITM-NN §x` reference below exists.

## docs/CANONICAL_PRODUCT_DECISIONS.md

| Source | What it said | Where it lives now | Note |
|---|---|---|---|
| `docs/CANONICAL_PRODUCT_DECISIONS.md:1-6` | Title; "Active implementation contract"; effective 09-04, payments 09-07, audience | historical: authority superseded by D3 (JITM-00 §2) | Dated decisions stay citable in place; how decisions are logged and cited is JITM-15 §2.11 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:8` | Single source of truth; this file wins over code, copy, tests and documents | historical: superseded by D3 | Precedence now in JITM-00 §2.12, JITM-00 §2.13, JITM-00 §2.16 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:10-12 (part)` | 09-08 access: waitlist waves, manual admin invitations, personal referrals; waitlist entry creates no account | JITM-01 §2.8 | Concept only; wave mechanics (5 oldest + 5 random weekly) live in JITM-09 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:12 (part)` | Five lifetime member invitations sent through the System Mix | historical: superseded by three member-sent invitations (OWNER 2026-09-17, re-reviewed 2026-09-18); JITM-11 §2.37 | Current rule JITM-09 §2.17 (JITM-01 §2.8 points to it); listed as deviation in JITM-01 §6; Access-link flow: JITM-09 §2. "Bound to the recipient email" now holds for email invitations only; a text invitation lets the holder choose the email (docs/ONBOARDING_INVITATIONS_2026-09-17.md:12) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:14` | Granting access clears the Waiting queue; one shared access service prevents duplicate admissions; wave grants spend no admin slots | JITM-11 §2.48 | Engineering part only (one rule in one module). Admission semantics: JITM-09 §2 and the runbook docs/ADMISSION_CONTROLS.md; "five personal slots" historical (three, JITM-09 §2) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:16 (part)` | Admin console scope, roles, MFA, audit | JITM-01 §2.22; JITM-11 §2.12, §2.34; JITM-11 §2.13, §2.45 | Feature-map row "staff console" only; rules live in JITM-11 §2; Console scope: JITM-01 §2 feature map; staff workflows follow runbooks (JITM-09 §2); JITM-16 §2 cites §2.13 for agents' data-access limit |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:18 (end)` | Payments and native iOS/Android deferred until traction | JITM-01 §2.20, §2.7 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:18 (part)` | "Implemented locally" status narrative for email, admin and staff features | historical: a dated status, superseded by the production deployment |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:20` | Keep costs low: free email, free Hobby workspace, ~$22/month target, free Postgres expires, scale on measured demand | JITM-14 §2.25 | Principle current under O4; dollar figures historical (checked 2026-09-08); code side JITM-11 §2.51 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:22-24 (part)` | Phone-first follow-up CRM for owner-operated small businesses | JITM-00 §2.1 | Audience list superseded by D2 (JITM-02 §2) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:24 (part)` | First launch audiences: home services, real estate, insurance/financial | historical: superseded by D2 | JITM-02 §2.1 names the five audiences and retires the old list |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:26` | "The product helps an owner:" | JITM-01 §2.16 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:28` | Keep estimates and new leads from going quiet | JITM-01 §2.16 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:29` | Check in after a job or closing | JITM-01 §2.16 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:30` | Earn reviews and referrals without sounding pushy | JITM-01 §2.16 | Tone side carried by JITM-04 §2.1 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:31` | Remember renewals, anniversaries, promised callbacks | JITM-01 §2.16 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:32` | Open the app and know who to contact next | JITM-01 §2.16 | Listed as a goal; the promise itself is homed in JITM-00 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:34 (part)` | First-run promise: account, business, one person, prepared follow-up in minutes from a phone | JITM-01 §2.12; (home of the first-run promise); JITM-09 §2.20, §2.21 carry the route | allocation homes the first-run promise in JITM-01 (A1 suggested JITM-00/09); A1 said "JITM-00 promise + JITM-09 first-run"; ALLOCATION homes the promise in JITM-01 (its draft has it as a rule) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:34 (end)` | Docker knowledge never required for hosted | JITM-01 §2.6 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:36-41` | "Customer-facing language is deliberately ordinary"; table header | JITM-04 §2.1 | Principle kept as voice; table authority retired by D1, replaced by JITM-05 §2.1-§2.3 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:42` | Due work → Today | JITM-05 §2.2 | Term kept; meaning broadened to everything due |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:43` | One scheduled action → Follow-up | JITM-05 §2.3 | Term kept as a supporting word |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:44` | Timed sequence → Plan | historical: retired by D1 (shipped "Mix") | Retirement stated in JITM-05 §2.10 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:45` | Reusable starting point → Ready-made plan | historical: retired by D1 | Replacement "ready-made Mix" in JITM-05 §2.3, §2.5; retirement in §2.10 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:46` | Contact grouping → Tag | JITM-05 §2.3 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:47` | Trigger such as birthday or job completion → Saved date | JITM-05 §2.3 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:48` | Context → Note / Private note | JITM-05 §2.3 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:50 (part)` | "Jump in the Mix" is the brand, not a noun for work | JITM-03 §2.3; JITM-05 §2.11; JITM-11 §2.52 | Short form "Jump" also barred: JITM-03 §2.1; "Mix" dropped from the list: it is a customer term under D1; A1 target JITM-05. JITM-11 carries only the code side (keep internal names in code); the customer-copy ban is JITM-05 §2; "Mix" is a customer term again under D1 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:50 (end)` | Never expose Action Template, Mix Template, day offset, snapshot, broadcast, activation impact, reconciliation | JITM-05 §2.11 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:52-54` | "Primary navigation has four destinations" | historical: superseded by D1 and the shipped nav; replaced by JITM-09 §2.3 | |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:56` | Today: overdue and due follow-ups, ordered by attention | JITM-09 §2.24 | queue order now codified from shipped code (jumps/page.tsx:449-464) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:57` | Contacts: people, notes, history, tags, saved dates | JITM-09 §2.32 | meaning kept |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:58` | Plans: ready-made and simple custom plans | historical: "Plans" superseded by D1 ("Mixes"); destination in JITM-09 §2.3, tabs in §2.35 | |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:59` | More: business settings, account, notifications, privacy, help | JITM-09 §2.6 (More), §2.7 (Settings) | More now also carries Journey and Calendar for phones |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:61-69` | Core loop, five steps | JITM-01 §2.10; (home per ALLOCATION); JITM-09 §2.10 links to it | allocation homes the core loop in JITM-01 (A1 suggested JITM-09); JITM-09 §2 implements it; A1 targeted JITM-09; kept in one home to avoid restating |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:61 (part)` | Quick Add available everywhere | JITM-09 §2.8 | view-only sessions excepted (deviation on phones in §6) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:71-73` | Human review default; native composers; no carrier-confirmed delivery claim | JITM-04 §2.8 | Copy side only; the principle is homed in JITM-00 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:75` | Automatic email/SMS default-off with review window, quiet hours, durable claim, receipt | JITM-01 §2.4 | Off for the beta; delivery mechanics live in JITM-11 §2; sender identity in JITM-03 §2.23 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:77` | Digests, Web Push, Monday reports; owner timezone and quiet hours | JITM-01 §2.22 | Feature-map row; timing rules live in JITM-11 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:79-81 (part)` | Hosted multi-tenant free beta primary; unique access grant; verification and recovery mandatory | JITM-01 §2.6, §2.8; JITM-14 §2.1, §2.4 | Recovery mechanics live in JITM-11 §2; Edition positioning: JITM-01 §2; access grant flow: JITM-09 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:81 (end)` | Social/email-link/password sign-in for existing accounts; only access-grant signup creates accounts | JITM-01 §2.8 | "Only from a grant" carried; sign-in providers are for JITM-09 §2 / JITM-11 §2 (Google/Apple not configured in production) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:83 (part)` | Docker edition: single-owner, loopback, may lack email, CLI password recovery | JITM-01 §2.6; JITM-14 §2.1 | Operations of the edition live in JITM-14 §2; Local environments only; edition definition: JITM-01 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:83 (end)` | Help must never imply a support team or email when not configured | JITM-04 §2.16 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:85 (part)` | No billing; Stripe planned 09-07; model, pricing, date undecided | JITM-01 §2.9, §2.20 | Public price wording: JITM-02 §2.18 (D11) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:85 (end)` | Payments are a new implementation with reviewed migrations and payment-lifecycle tests; deployment deferred | JITM-11 §2.26; JITM-12 §2.8 | Covered by the general rules (reviewed migrations, tests for new behavior). "Deployment deferred" historical (production live since 2026-09-10). Price wording: D11 (JITM-02 §2, JITM-04 §2) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:87 (part)` | Google Contacts sync, AI plan wizard, signup-reward referrals retired; must not compile in | JITM-01 §2.19; JITM-11 §2.49 | Non-goals: JITM-01 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:87 (end)` | Supported: hosted admin, support conversations, ready-made curation, review requests, customer referral prompts | JITM-01 §2.22 | Feature map lists support conversations and the staff console (which covers ready-made library curation); review requests and referral prompts are not separate rows |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:89-91` | `workspaceId` is the authorization boundary, from the session only, kept by every route, action, job, import, export and support view | JITM-11 §2.9, §2.10 | Principle: JITM-00 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:93` | One workspace per account; no seats, team invitations, role screens, switcher | JITM-01 §2.5 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:95 (part)` | No commercial limits on contacts, tags, saved dates, plans, imports, follow-ups | JITM-01 §2.9; JITM-11 §2.35 | "plans" read as Mixes (D1); "No commercial limits" part belongs to JITM-01 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:95 (end)` | Completed history and rendered messages are immutable | JITM-11 §2.34 | Principle: JITM-00 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:97-99` | Scheduling = logical local date + IANA zone + local time + derived UTC; owner locale/zone rendering; servers in UTC | JITM-11 §2.14, §2.15 | |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:101` | Feb 29 → Feb 28; 29–31 clamp to month end; quiet hours, weekends, snooze in owner zone | JITM-11 §2.14 | |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:103` | Bounded workspace batches; deterministic uniqueness keys make scheduling and outcomes idempotent | JITM-11 §2.16, §2.21 | Outcome request ids: JITM-11 §2.24 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:105` | Business-detail edits refresh still-pending messages; completed history immutable; chunk the refresh at scale | JITM-11 §2.34 | "Chunked job at scale" covered by §2.21 (bounded passes) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:107-109 (part)` | Sessions: opaque hashes, `SameSite=Strict`, 14-day maximum, per-user caps, rotation after password change | JITM-11 §2.36 | `SameSite=Strict` and the 14-day maximum are historical: superseded by the Release A default (docs/FULL_AUDIT_2026-09-24.md:137) and shipped code; caps and rotation stay as shipped under §2.36 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:109 (end)` | Origin boundary, nonce CSP, separate encryption keys | JITM-11 §2.38, §2.39, §2.41 | |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:111` | Export, session control, deletion after reauth; auditable receipts | JITM-01 §2.22; JITM-11 §2.34 | Feature-map row; mechanics live in JITM-11 §2; Receipts only; the account features are JITM-09 §2 and JITM-01 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:113-115` | One responsive DOM; no duplicated mobile and desktop content | JITM-07 §2.2 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:116` | 13px minimum for meaningful text | JITM-10 §2.2 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:117` | 44 × 44 CSS px touch targets | JITM-10 §2.1 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:118` | System light and dark preference respected | JITM-06 §2.25, JITM-06 §2.26 | Choice stays browser-local (D12) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:119` | Shared accessible sheet for menus and mobile tasks; native disclosure for long optional content | JITM-08 §2.10, JITM-08 §2.11 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:120` | Empty states describe the next useful business action | JITM-04 §2.11 | Behavior side in JITM-08 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:121` | Copy never explains workers, database state or internals | JITM-04 §2.6 | Word list in JITM-05 §2.11 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:122` | CI runs static checks, rehearsals, tests, build, browser, axe, Lighthouse, restore, audit, images | JITM-12 §2.10, §2.11, §2.12 | CI is not a gate while Actions is billing-blocked (D8); the local tiers replace it; gaps in JITM-12 §6 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:123` | iPhone Safari and Android Chrome handoffs before external launch; device matrix | JITM-12 §2.6 | Evidence-class rule only; device qualification is JITM-10 §2; all rows NOT RUN |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:125-127` | What stays deliberately strong | JITM-11 §2.47 | Principle list: JITM-00 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:129-131 (part)` | Voice PRD reviewed; dictation, capture drafts, spoken briefing; device qualification required | JITM-01 §2.21, §2.22 | Feature map marks devices NOT RUN |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:131 (part)` | Paid realtime assistant, inbox analysis, messaging bridges, native clients deferred; free closed access stays | JITM-01 §2.20, §2.8 |  |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:131 (end)` | QR intake separate from invitations; cannot bypass System Mix or its five-person limit | JITM-01 §2.8 | "Five" is historical; the allowance is three |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:133-135 (part)` | Capacity ceilings default 0; suspended/unverified count; staff-only don't; existing invitations stay valid | JITM-09 §2.69; not restated in JITM-11 | Concept only (two limits, zero until configured, pauses keep issued links); moved from JITM-01 §2.8 on 2026-09-28 (review R1 #19). Counting details stay in the runbook docs/ADMISSION_CONTROLS.md, which JITM-09 §2.69 points to. Feature semantics, not architecture. "Five lifetime invitations" historical (three, JITM-09 §2.17) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:135 (end)` | Five lifetime System Mix invitations, independent of capacity | historical: superseded by three member-sent invitations | JITM-09 §2.17 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:137` | Waves need room for the whole batch; delays keep the due date; pauses never silently revoke links | not restated in JITM-11 | Feature semantics; wave composition is JITM-09 §2; the rest stays in docs/ADMISSION_CONTROLS.md (JITM-09 §2). Same flag as above |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:140-142` | Library: immutable drafts; publish, hide and rollback are permission-gated with current credentials, recent MFA, a reason and a stale-form check | JITM-11 §2.12, §2.24, §2.34 | Workflow detail stays in docs/LIBRARY_ADMINISTRATION.md (JITM-09 §2) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:144` | Customer setup bound to the previewed version; copies independent; catalog setup installs missing plans only | JITM-11 §2.24 | Engineering part (a retry returns the same copy). Behavior: JITM-09 §2; catalog seeding runs in the web pre-deploy (JITM-14 §2.15) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:147-149` | System Mix copy: immutable versions, editor and publisher permissions, recent MFA, audited rollback | JITM-11 §2.12, §2.34 | Customer flow: JITM-09 §2. "Five lifetime invitation rules" historical (three) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:150` | Re-review on changed wording; allocation freezes the email in the outbox; later releases cannot alter prepared messages | JITM-11 §2.34 | Re-review: JITM-09 §2. "Freezes the complete email in the existing outbox" historical: member invitations are delivered by the member (src/lib/referral-access.ts:65) |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:152-154 (part)` | Admin Reports: bounded UTC ranges, `reports.read` | JITM-11 §2.12, §2.45 | Metric definitions stay in docs/ADMIN_REPORTS.md; activation definition: JITM-01 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:154 (part)` | Activation definition | JITM-01 §2.14; JITM-01 §2.15 | Precise form from docs/ADMIN_REPORTS.md:13 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:154 (end)` | Separate funnel facts; growth exclusions; aggregate-only analytics; live data can restate totals | JITM-11 §2.45 | Metric semantics stay in docs/ADMIN_REPORTS.md; audit use: JITM-17 §2 |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:156` | Daily aggregates; encrypted CSV exports bound to the staff session, 24-hour expiry; no paid analytics; bounded operator retries | JITM-11 §2.45, §2.23, §2.51 | |

## docs/design/DESIGN_GUIDELINES.md

| Source | What it said | Where it lives now | Note |
|---|---|---|---|
| `docs/design/DESIGN_GUIDELINES.md:1` | Title "Jump in the Mix design guidelines" | historical: document title | Document gets a D3 supersession banner (JITM-15 §2) |
| `docs/design/DESIGN_GUIDELINES.md:3 (a)` | Export is the visual authority for homepage and webapp; preserve its HTML, tokens and canvas | JITM-06 §2.1, JITM-06 §2.3 | Authority narrowed by D3 to "where the standards are silent"; precedence list is JITM-00 §2 |
| `docs/design/DESIGN_GUIDELINES.md:3 (b)` | Fixed-size screens illustrate layouts, not content or capabilities | JITM-06 §2.4, JITM-07 §2.3 |  |
| `docs/design/DESIGN_GUIDELINES.md:3 (c)` | Export governs visual composition when derived guidelines disagree | JITM-06 §2.1 | Superseded in part by D3: standards govern, export only where silent; JITM-00 §2 |
| `docs/design/DESIGN_GUIDELINES.md:3 (d)` | Label implementation assumptions; automated checks alone don't establish visual fidelity | JITM-10 §2.20; JITM-12 §2 and JITM-15 §2 | Screenshot comparison and assumption labels: |
| `docs/design/DESIGN_GUIDELINES.md:3 (e)` | Use the existing real logo | JITM-03 §2; JITM-06 §2.4 | Logo rules (JITM-03); "real logo beats mockup" in JITM-06 §2.4 |
| `docs/design/DESIGN_GUIDELINES.md:3 (f)` | Consult homepage roadmap, asset index and fictional ICPs for content | JITM-02 §2, JITM-04 §2 | |
| `docs/design/DESIGN_GUIDELINES.md:5` | Owner 09-21: Journey is a dynamic Mix/Beat graph; stages optional; supersedes the stage composition | JITM-06 §2.2, JITM-07 §2.19; JITM-09 §2.50, §2.51 | D4; graph semantics (JITM-09); layout part → JITM-07 |
| `docs/design/DESIGN_GUIDELINES.md:7` | Journey forensic review and acceptance scenarios; consult before Journey work | JITM-09 §2; JITM-12 §2; JITM-09 §1 (proposals except where shipped), §5 (acceptance matrix) | test part → JITM-12 |
| `docs/design/DESIGN_GUIDELINES.md:9` | Account configuration determines nodes and routes; triggers, concurrency, forks, guarded loops; estimate illustrative | JITM-09 §2.50, §2.55 | |
| `docs/design/DESIGN_GUIDELINES.md:11` | Heading "Shared foundation" | historical: structural heading |  |
| `docs/design/DESIGN_GUIDELINES.md:13` | design-tokens.css implements the palette; semantic tokens, no page hex; design layers load after legacy | JITM-06 §2.7, JITM-06 §2.8, JITM-06 §2.29 |  |
| `docs/design/DESIGN_GUIDELINES.md:14` | Instrument Sans for the interface; Newsreader for a person's words; fonts local with OFL | JITM-06 §2.13, JITM-06 §2.14 | Brand meaning of the typefaces links from JITM-03 |
| `docs/design/DESIGN_GUIDELINES.md:15` | Four distinct surfaces; violet fill, text, mark and wash roles | JITM-06 §2.9, JITM-06 §2.10 |  |
| `docs/design/DESIGN_GUIDELINES.md:16` | Radii 12/24/20; tail uses the body fill; flat rows and fine separators; shadows for overlays | JITM-06 §2.18, JITM-06 §2.19, JITM-06 §2.20; JITM-03 §2 | Tail fill rule is homed in JITM-03 |
| `docs/design/DESIGN_GUIDELINES.md:17` | Explicit icon dimensions; overflow scans miss SVG growth; inspect screenshots | JITM-06 §2.22; JITM-12 §2 | Screenshot inspection: |
| `docs/design/DESIGN_GUIDELINES.md:18` | System/Light/Dark; browser-local; tab sync; nonce bootstrap; root-layout sync; no account theme; blocked storage | JITM-06 §2.25, JITM-06 §2.26, JITM-06 §2.27 | D12; control is now the sun/moon switch (owner 2026-09-27); CSP nonce mechanics also JITM-11 §2 |
| `docs/design/DESIGN_GUIDELINES.md:20` | Heading "Layout and interaction" | historical: structural heading |  |
| `docs/design/DESIGN_GUIDELINES.md:22` | 248px rail; 80px compact rail 901–1279; bottom nav with Quick Add bubble and More | JITM-07 §2.4, JITM-07 §2.5, JITM-07 §2.6 | Destinations, labels and order: JITM-09 §2 |
| `docs/design/DESIGN_GUIDELINES.md:23` | Rails scroll independently; controls usable; focus revealed; Appearance and Profile reachable; 600px-high laptop check | JITM-07 §2.7 | 600px height is in JITM-07 §5 |
| `docs/design/DESIGN_GUIDELINES.md:24 (a)` | Today queue beside one review pane from 768px; very wide adds context; smaller screens use the review sheet | JITM-07 §2.15 |  |
| `docs/design/DESIGN_GUIDELINES.md:24 (b)` | Opening another review or resizing keeps the editor and draft | JITM-08 §2.15 |  |
| `docs/design/DESIGN_GUIDELINES.md:24 (c)` | Queue groups Overdue / Today / Later this week (Upcoming) / Done | JITM-09 §2.24 | "Later this week" is superseded by the shipped "Next 7 days"/"Upcoming" (§6) |
| `docs/design/DESIGN_GUIDELINES.md:24 (d)` | Channels, Copy, outcome, Snooze and Skip visible; unavailable methods disabled with reason; confirmations above the bottom nav with Undo; handoff is not delivery | JITM-08 §2.2, JITM-08 §2.3, JITM-08 §2.4, JITM-08 §2.6; JITM-07 §2.9 |  |
| `docs/design/DESIGN_GUIDELINES.md:25` | Pending-Beat track per selected occurrence; selected Beat visible; no speculative joins; compose field transparent inside its bubble | JITM-06 §2.20; JITM-12 §2; JITM-09 §2.32 (real dates only), partial | Occurrence model (JITM-09); computed-background check (JITM-12); track display → JITM-07/JITM-08 |
| `docs/design/DESIGN_GUIDELINES.md:26` | Contacts rows, 1200px split, details column, phone full profile, profile content, reachable tools | JITM-07 §2.13, JITM-07 §2.17; JITM-09 §2.32 | Row and profile content (JITM-09); layout → JITM-07 |
| `docs/design/DESIGN_GUIDELINES.md:27` | Mixes library, editor and sidebar; collapsing settings; explicit save; activation preference enforced on the server; phone My mixes/Ready-made tabs; Mix definition | JITM-07 §2.18, JITM-08 §2.23; JITM-09 §2.36, §2.39 | Tabs superseded by My mixes / Mega-Mixes / Marketplace (D1, 2026-09-24); activation modes and Mix definition; tab names superseded by §2.35; editor pattern → JITM-08 |
| `docs/design/DESIGN_GUIDELINES.md:28` | Journey stage circles, rings, 30-day arrows, touchpoint nodes, quiet-day node | historical: stage-circle Journey superseded (D4) |  |
| `docs/design/DESIGN_GUIDELINES.md:29` | Movement-arrow geometry, curves, assistive text, captions | historical: stage-circle Journey superseded (D4) |  |
| `docs/design/DESIGN_GUIDELINES.md:30 (a)` | Journey uses the 1672px workspace; up to six touchpoints; row spacing | historical: D4 | The graph page fills the width (JITM-07 §2.19) |
| `docs/design/DESIGN_GUIDELINES.md:30 (b)` | Quiet-day names in Instrument Sans; Newsreader for personal wording | JITM-06 §2.13 |  |
| `docs/design/DESIGN_GUIDELINES.md:31` | No empty touchpoint row; phones lead with stages and people; options sheet with stage settings | historical: stage-circle Journey superseded (D4) |  |
| `docs/design/DESIGN_GUIDELINES.md:32` | Portrait-tablet compact header through 900px; no stacked headers; roster visible; landscape restores the rail | JITM-07 §2.19 | Compact header 768–900px kept for the graph page; stage-map specifics historical (D4) |
| `docs/design/DESIGN_GUIDELINES.md:33` | Seven timing buckets, Monday weeks, rolling ring, dot previews, Select them, roster paging, timezone day boundaries, no decorative dots | historical: stage view superseded (D4); JITM-09 §2; historical: stage view superseded (D4) | Timezone and calendar-day principle (JITM-09); calendar-day/timezone principle → JITM-11 §2, not restated here |
| `docs/design/DESIGN_GUIDELINES.md:34` | Calendar agenda, editor and context; filters and actions as disclosures; phone agenda leads; initial selection; follow-ups link to Today; scheduling kept | JITM-07 §2.21, JITM-08 §2.21; JITM-09 §2.62 | Initial selection and workflow; layout → JITM-07 |
| `docs/design/DESIGN_GUIDELINES.md:35` | Demo contract (owner 09-19): one fictional contact, three Beats, in memory, supersedes the export's demo labels | JITM-04 §2; JITM-09 §2.67 | |
| `docs/design/DESIGN_GUIDELINES.md:36` | `PublicLanding` for the homepage and five profession pages; five links, no All; one row or natural wrap | JITM-07 §2.24, JITM-07 §2.25; JITM-02 §2 | Profession-page content |
| `docs/design/DESIGN_GUIDELINES.md:37` | Homepage bands, headings, demo, rhythm, waitlist; preserve verified claims; no invented testimonials, pricing or auto-send promises | JITM-07 §2.24; JITM-04 §2, JITM-02 §2 | Claims (D11) |
| `docs/design/DESIGN_GUIDELINES.md:38` | Same foundation for account, settings, onboarding, auth, support, staff, empty and error states; mockups without behavior need a product decision | JITM-06 §2.4, JITM-06 §2.6 | Stop-and-ask mechanics are JITM-16 §2 |
| `docs/design/DESIGN_GUIDELINES.md:39` | More rows (44px, lighter labels, Appearance, Sign out); flat account and support rows; Newsreader conversation bodies, neutral in / violet out; status colors describe status; current destination marked | JITM-07 §2.22, JITM-06 §2.11, JITM-06 §2.13, JITM-10 §2.15; JITM-03 §2 | Who-is-speaking surfaces are bubble roles in JITM-03 |
| `docs/design/DESIGN_GUIDELINES.md:40` | Archetype maxima 1440/1672/1120/1040/960; contract to available space; consistent headers, actions and colors | JITM-07 §2.10, JITM-07 §2.11 |  |
| `docs/design/DESIGN_GUIDELINES.md:41` | Size columns to the bounded workspace; Today 300–440px queue and 24px gap; no percentage padding; readable ultrawide | JITM-07 §2.12, JITM-07 §2.15 |  |
| `docs/design/DESIGN_GUIDELINES.md:43` | Heading "Pane and control details" | historical: structural heading |  |
| `docs/design/DESIGN_GUIDELINES.md:45` | Today pane order; Copy beside the handoff; status and discard below; errors, holds and conflicts visible; phone shows handoff and outcomes together | JITM-08 §2.1, JITM-08 §2.3 |  |
| `docs/design/DESIGN_GUIDELINES.md:46` | Beat fields together; Beat options disclosure; disclosed fields stay mounted; exact Beat names; library tracks show real counts | JITM-08 §2.22; JITM-09 §2; not restated: editor → no invented activity → JITM-00 §2 | Beat editing and library truth |
| `docs/design/DESIGN_GUIDELINES.md:47` | Calendar editor pane separation and field order; disclosures; save and share beside the no-invitation note; timezones | JITM-07 §2.21, JITM-08 §2.21; JITM-09 §2.62 (no invitation) | Field order and timezone behavior; editor → JITM-08 |
| `docs/design/DESIGN_GUIDELINES.md:48` | From 1200px Snooze and Skip beside the heading, Mark sent beside the send controls; phones keep outcomes below | JITM-07 §2.16 |  |
| `docs/design/DESIGN_GUIDELINES.md:49` | Saved views in Filter; keep sort; tools as single-column rows; no invisible submit buttons | JITM-08 §2.29, JITM-08 §2.10, JITM-08 §2.23 |  |
| `docs/design/DESIGN_GUIDELINES.md:50` | Scope docked pane styles to direct children; short-height headers and footers scroll; timezone picker conventions | JITM-08 §2.16, JITM-07 §2.26, JITM-08 §2.28 |  |
| `docs/design/DESIGN_GUIDELINES.md:51` | Popup heading, supporting copy, 44px close; bounded dialogs; Cancel first with initial focus; Journey previews measure content | JITM-08 §2.7, JITM-08 §2.10 | Journey-preview clause historical (D4) |
| `docs/design/DESIGN_GUIDELINES.md:52` | 18px/700 titles and 14px `--text-2` copy; phone bottom sheets with grabber; `--scrim`; ConfirmDialog/useConfirmDialog, not window.confirm; shared disclosure pattern | JITM-08 §2.7, JITM-08 §2.8, JITM-08 §2.10, JITM-08 §2.11, JITM-08 §2.19, JITM-06 §2.19; JITM-06 §3 | "Only the navigation guard stays native" widened to FormGuard's two synchronous guards; title and supporting-text sizes live in JITM-06 §3 |
| `docs/design/DESIGN_GUIDELINES.md:53` | Phone Journey search from the header; touchpoint headings in ordinary case; More icons match their destination | JITM-06 §2.23 | Journey clauses historical (D4) |
| `docs/design/DESIGN_GUIDELINES.md:54` | Phone public header; hero order; two-column profession directory that stacks; footer flex basis | JITM-07 §2.24, JITM-07 §2.25, JITM-10 §2.3 | Footer flex-basis fix is an implementation detail covered by JITM-10 §2.3 |
| `docs/design/DESIGN_GUIDELINES.md:56` | Native dialog stacking on resize; Escape closes the current layer; focus and drafts survive | JITM-08 §2.14 |  |
| `docs/design/DESIGN_GUIDELINES.md:57` | Reveal invalid fields in collapsed disclosures; focus failed saves and required choices; keep values on repeated failure | JITM-08 §2.22, JITM-08 §2.24, JITM-10 §2.12 |  |
| `docs/design/DESIGN_GUIDELINES.md:58` | Form grids shrink; action rows wrap; save actions scroll with the form on phone and tablet; focus clear of navigation and save bars | JITM-08 §2.26, JITM-10 §2.11 |  |
| `docs/design/DESIGN_GUIDELINES.md:60` | Heading "Verification for future changes" | historical: structural heading |  |
| `docs/design/DESIGN_GUIDELINES.md:62` | Contacts implementation contract (Next card, personal Journey, Start a touchpoint, notes and History, selection retained, secondary tools) | JITM-09 §2.32, §2.34, partial | personal-journey panel and notes display → JITM-07/JITM-08 |
| `docs/design/DESIGN_GUIDELINES.md:64` | Verification matrix: themes, widths, breakpoint pairs, keyboard, contrast, targets, long names, empty and dense data, overflow, 200% text, validation, repeated failures, resize with a child dialog, column widths, screenshots, workflow checks, typecheck, build | JITM-07 §5, JITM-10 §2.20, JITM-08 §5; JITM-12 §2 | Screenshots, typecheck and build (JITM-12) |
| `docs/design/DESIGN_GUIDELINES.md:66` | Heading "Product decisions still open" | historical: structural heading |  |
| `docs/design/DESIGN_GUIDELINES.md:68` | Open 1: should appearance sync with the account? | JITM-06 §2.26 | Resolved by D12: stays browser-local |
| `docs/design/DESIGN_GUIDELINES.md:69` | Open 2: should general touchpoints become a distinct feature? | historical: stage-map touchpoints moot under D4; JITM-01 §6 | Remaining question (UNCLEAR) |
| `docs/design/DESIGN_GUIDELINES.md:70` | Resolved 09-20: combined Quick Add contract | JITM-08 §2.12, JITM-08 §2.13, JITM-08 §2.30, JITM-08 §2.31; JITM-09 §2.22, §2.23 | Contract (JITM-09); review UI in JITM-08 |
| `docs/design/DESIGN_GUIDELINES.md:71` | Resolved 09-20: quiet-day lifecycle | JITM-09 §2.61 | |
| `docs/design/DESIGN_GUIDELINES.md:72` | Resolved 09-20: activation modes per user | JITM-09 §2.39 | |
| `docs/design/DESIGN_GUIDELINES.md:74` | Unresolved items are assumptions; resolved decisions describe implementation, not outcomes | JITM-15 §2, JITM-17 §2 | |
| `docs/design/DESIGN_GUIDELINES.md:76` | The Quick Add nav bubble is the explicit exception to "navigation never gets a tail" | JITM-03 §2 | (JITM-03 already carries it); bubble size question in JITM-07 §6 |

## AGENTS.md (before this change)

| Source | What it said | Where it lives now | Note |
|---|---|---|---|
| `AGENTS.md:1-9` | Next.js 16 agent block: read `node_modules/next/dist/docs/`; block re-added by `next dev` | JITM-11 §2.1, §2.2; JITM-13 §2.10 | A1 target JITM-16 (block placement: JITM-16 §2). Recorded here because JITM-11 owns the read-the-docs rule and JITM-13 the commit handling |
| `AGENTS.md:11-13 (part)` | All testing and staging deploys go to the Netlify test site by site ID; stable URL is the handoff | historical: retired by D5 | Quoted verbatim in JITM-14 §2 ("Deployment facts carried from AGENTS.md"); replacement: JITM-14 §2.2 and JITM-12 §2.11 |
| `AGENTS.md:13 (part)` | jumpinthemix.com is the customer site and a separate target | JITM-14 §2.1 | |
| `AGENTS.md:13 (end)` | Verify site identity before deploying; the local link may point to the customer site | JITM-14 §2.3 | Netlify wording historical |
| `AGENTS.md:15-17 (part)` | Render topology: web, worker, private PostgreSQL with `jitm_runtime`, daily backup cron, `render.yaml`, auto-deploy off | JITM-14 §2.1, §2.5 | Quoted verbatim in JITM-14 §2. Correction noted there: the database and backup cron are defined in `infra/operations/` |
| `AGENTS.md:17 (part)` | Releases deploy a specific commit to the worker then the web, after a read-only preflight and a fresh backup, with a reviewed one-off migration job first | JITM-14 §2.8, §2.11, §2.12, §2.13, §2.14; JITM-14 §2.19, §2.23; JITM-14 §2.20; JITM-15 §2.6; JITM-11 §2.40 | Backup before code-only releases is an open question (JITM-14 §6); Tag date is UTC; tag message format added as proposed; two records rolled back worker first (JITM-14 §6); Missing records listed in JITM-14 §6 |
| `AGENTS.md:17 (end)` | The Netlify staging rule is flagged for the owner's decision | historical: resolved by D5 | JITM-14 §2.2 |
| `AGENTS.md:19-21 (part)` | UI follows the design export and DESIGN_GUIDELINES; consult the matching screen first | JITM-06 §2.1, JITM-06 §2.3 | DESIGN_GUIDELINES authority superseded by D3; the export stays the reference |
| `AGENTS.md:21 (part)` | Preserve the export; export beats derived guidelines; document implementation assumptions separately | JITM-15 §2.14; JITM-12 §2.18 | Preservation and separate assumptions only; export authority and precedence: JITM-06 §2 and JITM-00 §2; Screenshot protocol only; "build absent structures" is JITM-06 §2 |
| `AGENTS.md:21 (end)` | Raise design and function conflicts; do not invent product behavior or copy sample metrics | JITM-16 §2.7, JITM-16 §2.16, JITM-00 §2.4 |  |
| `AGENTS.md:23-25 (part)` | Homepage/profession/onboarding/copy work consults the asset index, ICPs and third-party guidance | JITM-02 §2.4; JITM-04 §2.24-§2.25 | Third-party guidance: historical, removed by D7 (JITM-04 §2.34-§2.35); files stay local-only by D6 |
| `AGENTS.md:25 (end)` | ICPs are fictional hypotheses; verify product/access/pricing claims against current behavior | JITM-02 §2.4, §2.18; JITM-04 §2.26 |  |
| `AGENTS.md:25 (part)` | The index records missing references; do not claim to have reviewed unavailable files | JITM-15 §2.17 | A1 target JITM-16; honesty in general: JITM-16 §2 |
| `AGENTS.md:27 (part)` | The homepage roadmap sets the implementation sequence and completion criteria | not restated in JITM-11..15 | The roadmap is a dated planning record (type per JITM-15 §2.1). JITM-02, JITM-04, JITM-05 and JITM-09 cite it as a source; the router keeps any pointer |
| `AGENTS.md:27 (end)` | Preserve original source documents; distinguish planned work, verified implementation and measured outcomes | JITM-15 §2.14, §2.15 | JITM-16 §2 cites §2.15 for reports |

## CONTRIBUTING.md

| Source | What it said | Where it lives now | Note |
|---|---|---|---|
| `CONTRIBUTING.md:1` | Title | historical: the file stays | Its "Branch and commit conventions" and "Product language" sections are superseded (D3) and get a one-line banner (JITM-15 §2.13); the other sections are absorbed by JITM-11, JITM-12 and JITM-14 |
| `CONTRIBUTING.md:3-5` | Docker is the supported local path | JITM-14 §2.1 | |
| `CONTRIBUTING.md:7-9` | Launchers per OS (`start-local.cmd`, `.command`, `.sh`) | JITM-14 §2.1 | |
| `CONTRIBUTING.md:11` | Launcher creates `.env`, secrets, PostgreSQL and a seeded demo | JITM-14 §2.1 | Demo data stays local (JITM-12 §2.21) |
| `CONTRIBUTING.md:13-24` | Pre-PR commands: install, db:generate, validate:static, typecheck, test, build | JITM-12 §2.9 | Equals `npm run check` (package.json:55) |
| `CONTRIBUTING.md:26` | Full-stack changes also run the LOCAL_TESTING smoke | JITM-12 §2.9 | |
| `CONTRIBUTING.md:28-36` | Branch names `feature/`, `fix/`, `chore/` | historical: superseded by D10 | Replacement: JITM-13 §2.3, §2.4 |
| `CONTRIBUTING.md:38-44` | Conventional commit messages | historical: superseded by D10 | Replacement: JITM-13 §2.5, §2.8 |
| `CONTRIBUTING.md:46-48` | Update `prisma/schema.prisma` | JITM-11 §2.26 | The schema is split across `prisma/*.prisma` (listed in JITM-11 §6) |
| `CONTRIBUTING.md:49` | Generate and review a Prisma migration | JITM-11 §2.26 | PR notes: JITM-13 §2.15 |
| `CONTRIBUTING.md:50` | Do not edit production data manually | JITM-14 §2.29 | |
| `CONTRIBUTING.md:51` | Migration and rollback notes in the pull request | JITM-13 §2.15 | Release-time rollback: JITM-14 §2.24 |
| `CONTRIBUTING.md:53-55` | Never commit `.env`, provider secrets, tokens or customer exports | JITM-11 §2.41 | Commit hygiene: JITM-13 §2.11; operational secrets: JITM-14 §2.27 |
| `CONTRIBUTING.md:56` | Keep credentials server-side | JITM-11 §2.41 | |
| `CONTRIBUTING.md:57` | Validate tenant ownership for every workspace-scoped mutation | JITM-11 §2.10, §2.11 | Principle: JITM-00 §2 |
| `CONTRIBUTING.md:58` | Verify webhook signatures; idempotent handlers | JITM-11 §2.43 | |
| `CONTRIBUTING.md:59` | AI-generated multi-record changes need a user confirmation | JITM-11 §2.46 | |
| `CONTRIBUTING.md:61-63` | "Use the canonical terms consistently" | historical: superseded by D1/D3 | Replaced by JITM-05 §2.1 |
| `CONTRIBUTING.md:65` | Important Date (UI) / `JumpDate` (internal) | historical: retired by D1 (shipped "saved date") | Retirement JITM-05 §2.10; `JumpDate` in JITM-05 §2.11 |
| `CONTRIBUTING.md:66` | Mix = follow-up plan | JITM-05 §2.2 |  |
| `CONTRIBUTING.md:67` | Step = reusable message or call template | historical: retired by D1 (Beat) | Retirement JITM-05 §2.10 |
| `CONTRIBUTING.md:68` | Jump = one generated follow-up action | historical: retired as a customer term by D1 | Customer word "follow-up" in JITM-05 §2.3; `Jump` internal in §2.11 |
| `CONTRIBUTING.md:70` | Do not reintroduce Campaign, Connect, Connected | JITM-05 §2.10 | Carried; shipped "Connected" call outcome listed in JITM-05 §6 with an open question |

## docs/UX_WORKFLOW_OPTIMIZATION.md

| Source | What it said | Where it lives now | Note |
|---|---|---|---|
| `docs/UX_WORKFLOW_OPTIMIZATION.md:1` | Title "Phone-first workflow contract" | historical: superseded as a contract (D3); listed in JITM-09 `supersedes` | |
| `docs/UX_WORKFLOW_OPTIMIZATION.md:3` | Checklist complete; decisions live in CANONICAL | historical: pointer superseded by D3 | |
| `docs/UX_WORKFLOW_OPTIMIZATION.md:5 (part)` | Core workflow: add → when → review on Today → composer/call → record | JITM-01 §2.10; (core loop home); JITM-09 §2.10; historical: superseded by D1 and the shipped nav; replaced by JITM-09 §2.3 | (core loop home); JITM-09 §2 implements it |
| `docs/UX_WORKFLOW_OPTIMIZATION.md:5 (end)` | Quick Add remains available everywhere | JITM-09 §2.8 | |
| `docs/UX_WORKFLOW_OPTIMIZATION.md:7` | Release review should enforce the budgets | JITM-09 §2.10 | SHOULD; enforcement advisory (D8) |
| `docs/UX_WORKFLOW_OPTIMIZATION.md:9-10` | Budget table header | JITM-09 §2.10 | structure only |
| `docs/UX_WORKFLOW_OPTIMIZATION.md:11` | Add a person + first follow-up = one compact form submission | JITM-09 §2.10 | |
| `docs/UX_WORKFLOW_OPTIMIZATION.md:12` | Complete a follow-up = composer handoff + one return confirmation | JITM-09 §2.10 | |
| `docs/UX_WORKFLOW_OPTIMIZATION.md:13` | Search/filter: live update, no Apply button | not JITM-09: JITM-08 §2 per A1 | D9 keeps Apply on the Mixes and Ready-made filters |
| `docs/UX_WORKFLOW_OPTIMIZATION.md:14` | Start a ready-made plan = one setup screen | JITM-09 §6 (open question) | not adopted: the owner's Mega-Mix-first route (JITM-09 §2.20) does not meet it; tester default still open (BETA_READINESS_AUDIT:393) |
| `docs/UX_WORKFLOW_OPTIMIZATION.md:15` | Resume a composer handoff restores the return tray | not JITM-09: JITM-08 §2 per A1 | |

## CLAUDE.md

| Source | What it said | Where it lives now | Note |
|---|---|---|---|
| `CLAUDE.md:1` | `@AGENTS.md` import | JITM-16 §2.18 | Replaced by a symlink to `AGENTS.md`, because the import did not load in subdirectory sessions (see the verification record) |
