# Design adoption — 2026-09-19

Implemented the supplied [Jump in the Mix design export](jump-in-the-mix-designs/index.html) throughout the shared application and public site. The original export remains unchanged. [AGENTS.md](../../AGENTS.md) now requires future UI changes to follow it and [DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md).

## Implemented

- Shared light/dark semantic palette, Instrument Sans interface type, locally hosted Newsreader for personal wording, flat list rows, subtle separators, rounded controls/sheets and matching speech-bubble tails. Existing status meanings and the real logo remain in use.
- System/Light/Dark controls in the public footer, desktop rail, More and account preferences. A nonce-bearing bootstrap applies the saved browser choice before paint. Explicit choices override the OS, synchronize between tabs, and fail gracefully when storage is blocked.
- Homepage bands, heading hierarchy, conversation demo, three-step indicator, personal-voice section, profession links and contrasting waitlist section. Existing access, pricing and message-delivery claims remain tied to current behavior.
- Today queue and review pane from 1100px, with an additional contact column on wide desktops. Phones retain a modal review. Drafts survive pane switches and viewport changes. Opening the initial desktop pane preserves keyboard focus; pagination and filtering focus the new Today heading after streamed content becomes visible. Retained sheets stay closed when Suspense reveals an updated page.
- Desktop Mix library/detail/editor, compact mobile list, and person counts that include direct and group membership without counting assignments as individual people.
- Journey stage nodes sized by real populations, exclusive due-date rings, recorded 30-day stage movements, independent Mix touchpoints, selectable stage detail, real person dots, searching, timing filters, server-ordered pagination and existing manual stage moves. The database query is parameterized and workspace-scoped; tests cover membership, archived contacts, cross-workspace isolation, date boundaries and pagination beyond 50 people.
- Calendar agenda includes pending follow-ups that open Today for review. A date strip and desktop event editor accompany the existing event, conflict, appointment-plan and calendar-connection behavior.
- Contact lists/details, Quick Add, sheets, account/settings, authentication/onboarding, support, review/intake pages and staff screens inherit the same design foundation. Existing prior-session work was preserved.

## Verification

The initial implementation checks used an isolated local database with fictional fixtures and cleared provider-send credentials. The subsequent authorized production deployment and hosted verification are recorded in [the production release report](DESIGN_DEPLOYMENT_2026-09-19.md). No real customer messages were sent by these tests.

- Production Next.js build and TypeScript checking pass.
- 53 focused unit/integration checks pass across the Journey, configuration, authorization, design-accessibility and UI-readiness suites.
- [Route audit](DESIGN_ROUTE_AUDIT_2026-09-19.md): 188 light/dark checks over 93 URLs, including a representative record for every dynamic page template. No recorded WCAG A/AA violations, horizontal overflow, browser exceptions or server failures. Intentional missing-page fixtures return 404.
- 12 further visual/accessibility checks cover Today at 834/1194/1440/1920, Quick Add at phone/desktop sizes, Journey overview and stage detail, Mix editing and Calendar. Screenshot inspection caught and fixed a hover-positioning defect that automated overflow scans alone missed.
- 28 browser scenarios pass across the final workflow run and a focused resize recheck. Coverage includes appearance persistence and storage failures, the homepage demo, responsive review, draft saving/conflicts, Mix creation/setup, sheet focus, Today pagination beyond 300 records, undo/recovery and native 200%/400% zoom. The final run passed 27 scenarios; the remaining resize assertion was changed to wait for the browser's media-query event and passed on recheck, without changing its expected behavior.

Local evidence is under `.artifacts/design-adoption-20260919/` (ignored by Git). `routes.json` and `final-visual.json` contain the scan results; `final-*.png` contains representative screenshots. Environment/session files there are private. Public-policy checks use explicitly fictional local operator details. The self-hosted Help variation and populated customer/staff ticket detail were exercised; hosted email-provider delivery was not part of this design task.

Final verification logs: `build-sheet-reveal.log`, `unit-final.log`, `workflows-accepted.log` and `resize-accepted.log`. The earlier diagnostic runs in that directory document failures that were subsequently corrected; use these final logs with the route and visual results above.

These are implementation checks, not measured customer outcomes, a claim of complete accessibility, or production deployment evidence.

## Decisions needing the owner's answer

- **Appearance:** currently remembered in this browser, rather than stored on the account across devices.
- **Touchpoints:** currently independent existing Mixes, rather than a new automation entity.
- **“After 60 quiet days”:** not implemented as an inactivity trigger. Decide whether completed follow-ups, any recorded interaction, or another event should restart the clock before adding that behavior. Existing date/manual/appointment triggers continue to work.

The implementation uses the first two as explicit working assumptions. The inactivity behavior is intentionally an open product decision; the design alone does not define a reliable trigger.
