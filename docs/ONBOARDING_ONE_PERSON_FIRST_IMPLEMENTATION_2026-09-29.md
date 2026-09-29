# One-person onboarding start (B-17) — implementation record, September 29, 2026

Onboarding now recommends one person and one follow-up. A complete Mega-Mix is offered afterward, as an optional next step. This carries out Kevin's decision D26g of 2026-09-28 ([owner decisions](standards-audit-2026-09-28/OWNER_DECISIONS.md), JITM-09 §2.20) and backlog item B-17 ([standards audit](STANDARDS_AUDIT_2026-09-28.md) §8).

**Status:** built and verified locally; not merged and not released. The release is a separate task (WF-06) after this pull request and its base merge. It is code-only, with no migration.

| Item | Value |
| --- | --- |
| Branch | `feat/onboarding-one-person-first-20260929` |
| Base | `copy/copy-batch-20260928` (PR #96, head `722d64b`). Merge #96 first, then retarget this pull request to `main` (JITM-13 §2.16) |
| Code commits | `4840291` (the change) and `55616d9` (narrow-screen layout) |
| Decision | D26g: "recommend one person and one follow-up, with Mega-Mix setup as an optional next step." "This is a usability hypothesis worth testing: observe whether testers can prepare their first useful follow-up without help." |
| Workflow | WF-01, then WF-04 with WF-02 and WF-03; skills `jitm-feature`, `jitm-ui-change`, `jitm-copy` |

## What changed

**Onboarding (`/onboarding`).**
- The first choice is now "One person and one follow-up · Recommended", and it is selected by default.
  - Its description: "Add someone you need to follow up with, then review the first follow-up prepared for them. You can add a complete Mega-Mix later."
  - "A complete Mega-Mix" (no longer marked Recommended) and "Choose individual Mixes" follow, unchanged.
- Answers saved with "Save answers and finish later" still reopen the route they were saved from. "Skip for now" is unchanged.
- The intro reads "Start with one person and review their first follow-up before you send it." This matches the invitation email and the registration page. It replaces "Choose a connected journey or build your own."
- Step 2 of the one-person form is titled "Choose your first follow-up" instead of "Choose a starting point", which repeated the heading above it.

**Today's welcome after onboarding.** Once the first follow-up is ready to review, the welcome adds "Optional next step: Set up the ⟨name⟩ Mega-Mix". The link opens that Mega-Mix's setup; nothing is added until the owner reviews it and chooses Add.
- The Mega-Mix it names:
  - the one that matches the marketing example the person tried;
  - otherwise, the one that matches the business type, when exactly one Mega-Mix does (Home services is Contractor; Real estate is Real estate);
  - otherwise, "Choose a complete Mega-Mix", which opens the Mega-Mix list.
- It is not offered:
  - for personal or networking use without Business;
  - when the account already has a Mega-Mix;
  - in an administrator support session;
  - while the first follow-up still needs a phone number or email address, because adding it stays the one next step.

**Help.** The "Can I finish setup later or use it for something else?" answer now names "One person and one follow-up" and "Skip for now". It no longer names the retired "Other uses or one follow-up" label.

**Narrow screens at 200% text (scoped to onboarding).** B-17 makes this form the first screen a new owner sees. These faults already existed on it and were found while verifying:
- Long option text squeezed the radio buttons and checkboxes into slivers (3–12 px wide by 13 px tall at 390 px). The controls now keep their size, and the option text wraps.
- At 320 px with 200% text, the starter preview and the timezone row widened the page to 378 px. The preview's long words now wrap, and the timezone name and its Change button wrap onto two lines.

**Code.**
- `matchedMegaMix()` in `src/lib/mega-mixes.ts` returns the matching Mega-Mix or none. `suggestedMegaMix()`, the preselection used by onboarding and the Mega-Mix library, keeps its previous results.

**Standards (WF-08).**
- JITM-09 2.0.1: §2.20 and §6 no longer list the Mega-Mix-first deviation.
- JITM-01 2.0.1: the §6 deviation about the "start with one person" promise is removed.
- Production still recommends the Mega-Mix first until a release includes this change. The JITM-01 §2.22 feature map is updated in that release's record (WF-06 step 13).

## Defaults chosen here (JITM-15 §2.12)

1. **Where the optional next step appears:** in Today's welcome, once the first follow-up is ready. Should it also appear later, for example after the first follow-up is sent?
2. **Which Mega-Mix it names:** from the example or a single matching business type; otherwise the list. Should Professional services name one Mega-Mix? Consultant, Photographer and Recruiter all fit it.
3. **Wording:** the option label and description, the intro, the step 2 title, "Optional next step:" and the Help answer. It follows the voice standard and needs Kevin's approval (JITM-04 §2.24, §2.28).

## Claims in the new onboarding copy (JITM-04 §2.26)

| Claim | Type | Proof | Status |
| --- | --- | --- | --- |
| "Start with one person and review their first follow-up before you send it." | Product; sending | The one-person route adds the person to a starter Mix and prepares their first follow-up. The owner reviews it on Today and sends it from their own app. Automatic customer email is off in production during the beta, and SMS is not configured (JITM-00 §2.3). | Verified in code and in the browser (core-flows). A sending claim, so it needs Kevin's approval (§2.28) |
| "…then review the first follow-up prepared for them." | Product | `e2e/core-flows.spec.ts`: the prepared message opens on Review | Verified |
| "You can add a complete Mega-Mix later." | Product | Mega-Mix setup stays available from Mixes, the Marketplace and the welcome's next step (`e2e/onboarding-one-person-first.spec.ts`) | Verified |
| "Recommended" | Recommendation | D26g, a usability hypothesis, not a proven result | Owner decision |
| "One person and one follow-up" | Product | D26g's wording. Some starters have a second Beat, such as a call five days later; the preview lists every Beat before anything is created | Qualified by the preview |
| "Optional next step: Set up the ⟨name⟩ Mega-Mix" | Product | The link opens that Mega-Mix's setup; installation still needs review and Add | Verified |

## Verification

Runs were local on TrixBot, against a production build served with the CI `validate` environment. The browser suites used a fresh `jitm_design_onb0929` database (migrated, demo seed and the e2e administrator). The unit suite used a fresh migrated, empty `jitm_design_onb0929_unit` database.

**Tier 1 (JITM-12 §2.9)**
- VERIFIED-RUNTIME:
  - `npm run validate:static` passed on `55616d9`.
  - `npm run typecheck` passed on `f90a5b9`. That commit differs from `55616d9` by one CSS rule.
  - `npm test` passed on `f90a5b9`: 282 files and 2,115 tests passed; 8 files (74 tests) were skipped by their own environment gates; none failed. See the pull request for the rerun on the final head.
  - `npm run build` passed on the `55616d9` source.
  - `npm run standards:check` passed.
  - `gitleaks` 8.21.2 found no leaks in the branch's commits.

**Tier 2, UI (JITM-12 §2.10)**
- VERIFIED-RUNTIME, desktop-chromium and mobile-chromium, on the `55616d9` build:
  - `e2e/onboarding-one-person-first.spec.ts` (new, 5 tests);
  - `e2e/onboarding-journey-preferences.spec.ts`, `core-flows`, `contractor-user-journey`, `ui-ux-workflows`, `onboarding-invitations`, `mega-mixes` and `today-navigation`;
  - `npm run test:a11y`.
  - Result: every test passed, except three first attempts that failed while another session's WebKit tests drove the host load average to 8–11. Each passed when rerun.
    - The Mega-Mix install test stopped at "Connecting your Mixes…" at its 10-second expectation. It failed again alone under load, then passed alone once the load dropped.
    - Today's "in-flight list update and slow Undo" test passed alone on this build and on the base build (`722d64b`), so it is order-dependent under load, not a regression.
    - The phone reflow test timed out taking a full-page screenshot. It failed again alone under load, then passed alone at low load.
  - Skips are by design: tests that run on only one project.
- VERIFIED-RUNTIME, visual (private captures in `.artifacts/onboarding-one-person-20260929/`):
  - Onboarding and Today's welcome, in both themes, at 320, 390, 834, 1440 and 1920 px: no sideways scroll.
  - At 320 px with 200% text, no sideways scroll. "Recommended" breaks inside the word in that extreme case.
  - Keyboard: the arrow keys move between the three choices. The new link is reached by Tab and shows the 3 px focus outline, at 390 and 1440 px.
  - The link measures at least 44 px tall.
  - The link's contrast on the success notice measures about 5.1:1 (light) and 5.4:1 (dark), and axe finds no contrast or link violations.
  - No export screen exists for onboarding; it follows the existing onboarding card and the shared tokens (JITM-07 page archetype).
- INFERRED: the one-person route now needs no clicks before its form. The audit's earlier count of about 8 taps from invitation to first follow-up (`docs/beta-audit-2026-09-26/lanes/01-first-run-onboarding.md`) is now the default path. No new timing was measured.

## How to observe the hypothesis

D26g asks whether testers prepare their first useful follow-up without help. This change adds no tracking.
- Admin → Reports (`/admin/reports`) already counts accounts by setup, first contact and first action on a follow-up (opened, copied, called, or an outcome recorded) in the first week (`src/lib/admin-report-data.ts`).
- The reports do not show which setup route each tester took, or whether they needed help. For that, observe or ask testers, and check support tickets opened during setup.
- Before looking at results, Kevin writes down the decision rule and the number of testers (JITM-04 §2.32).

## Follow-ups (not in this change)

1. **ONB-10, the most important before inviting testers:**
   - With the defaults, a realtor's first prepared text reads "…just checking that you received the estimate from my business". Every business type starts on "Follow up about an estimate", and the missing business name falls back to "my business".
   - Kevin to decide the default follow-up for each business type, and the wording when there is no business name.
2. **Unsaved changes on an untouched form:**
   - The one-person form says "Unsaved changes. Save before leaving this page." before anything is typed, because the starter preview and the device-timezone detection change the form after `FormGuard` takes its snapshot. A new account (UTC) always detects its timezone.
   - Fixing it changes the shared `FormGuard`, so it needs Kevin's go-ahead.
3. **ONB-05:** the customer name, phone and email fields use the owner's autofill tokens (`src/components/OnboardingForm.tsx`, `src/components/ContactForm.tsx`).
4. **ONB-04:** a first follow-up dated later is welcomed as "ready", and Today says "You're caught up".
5. **ONB-09:** retrying "Prepare my first follow-up" after a lost response creates a second person.
6. **ONB-07:** "Setup is complete — Your follow-ups are on Today" also shows when nobody is enrolled.
7. **Today at 320 px with 200% text:** the heading and navigation labels break inside words. This is not caused by this change.
8. **Squeezed controls elsewhere:** the shared `.checkbox-card` style lets long labels squeeze controls on other pages too. This change fixes only onboarding.
9. **If measured evidence is wanted:** a staff report of the setup route and first-follow-up outcome per new account.

## NOT RUN

- The full browser suite: only the affected specs ran.
- Physical iPhone and Android devices, screen readers, 400% browser zoom, and a real invitation → registration → verification → onboarding chain with a real inbox.
- Lighthouse: no public page changed.
- Migration and restore rehearsals, and the worker suites: no schema, job or worker change.
- `npm run security:audit`: no dependency change.
- GitHub Actions CI, which is blocked by billing; the practiced set ran locally as listed above.
