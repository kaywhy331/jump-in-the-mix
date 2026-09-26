# Three-Beat public demo correction

The owner clarified that every demo situation should imitate the app with a fictional contact and three scheduled Beats: SMS today, email tomorrow, and a phone call in one week. The previous demo instead used edit, preview, and reminder selection as its three steps.

## Implementation

- The homepage and all five profession routes now use the same compact Today workspace, with the full three-Beat schedule and a contact’s context. All 19 situations have SMS, email with a subject, and call notes.
- Each channel has an editable draft and a distinct Messages, Email, or Phone preview. Previewing an upcoming Beat retains its original due label. Recording an outcome is explicitly simulated and separate from previewing; Not yet and Undo keep the draft intact.
- Switching situations preserves each situation’s edits, subject, selected Beat and progress during the visit. Reset affects only the selected situation. Nothing is sent, called, written to an account, or passed into the waitlist besides its existing allowlisted situation identifier.
- The supplied landing and Today/review layouts govern the typography, palette, contact avatar, Beat timeline, draft bubble and controls. The owner’s new three-Beat contract supersedes the export’s edit/preview/record sequence. Original exports and real starter Mix schedules are preserved.
- The asset index, five fictional ICP introductions, supplied copywriting/marketing guidance, homepage roadmap and current handoff/outcome behavior informed the copy. These examples are illustrations, not customer evidence or measured conversion improvements.

## Verification and release

Evidence is recorded in `.artifacts/demo-workspace-20260919/`:

- Production build, TypeScript, schema/syntax/import validation and 14 focused unit tests passed. The isolated checkout initially lacked the generated Prisma client; running the normal `db:generate` prerequisite fixed that build setup failure.
- All 10 demo browser tests passed on desktop Chromium and Pixel 7 emulation. They cover every situation, both themes, 320/390/834/1440px reflow, keyboard focus, empty-draft blocking, editing and subjects, previews, Not yet, outcomes, Undo, reset isolation, no-JavaScript reading and no outgoing requests.
- Ten applicable public/design regression checks passed, including analytics privacy. The profession-grid test still expected the old six-column design; its assertion now matches the supplied two-column desktop and one-column phone layout. The initial no-JavaScript assertion used Playwright’s text matcher, which excludes `noscript`; direct DOM text and link assertions verify the actual fallback.
- The optimized build passed all 19 situations in both phone/dark and desktop/light layouts: 38 completed situations, 114 channel previews, six automated accessibility scans, zero mutations and zero browser errors. Screenshots of the initial editor and all three previews were visually reviewed.
- The stable test site published deploy `6aaf605b6991408d5ea808c9`. All 15 fetched assets matched the local package. The same 38 situations and 114 previews passed, with zero mutations and six clean accessibility scans. Its pre-existing database readiness failure and React 418 hydration warnings remain; staging is not claimed as fully healthy.

The implementation commit is `2c2fc68eacb6d6065d9037a612d3fea3ad72068c`, on `fix/demo-workspace-20260919`, based on the previously published Contacts release. There are five runtime file changes, no schema or dependency changes, and no changes to the worker, real sending or authenticated app. Only the web service was deployed; the worker remains on `72c2be51b5991f3cba7f3a8c0b28c58471f917d5` with identical worker source. Production deploy `dep-danm2kh42hec73euljbg` is live on https://jumpinthemix.com/#sample. Postflight matched all 665 manifest source files and 19 public assets against the running service. All 11 public/health probes returned 200, including database and worker readiness.

The production browser run passed all 19 situations in phone/dark and desktop/light layouts: 38 completed situations and 114 previews, six clean accessibility scans, working no-JavaScript content, zero write requests, and zero browser errors. Production screenshots were reviewed against the accepted optimized previews. These are engineering checks, not customer comprehension or conversion results.

Rollback, if needed: redeploy only the Render web service `srv-dagt93lbedkc738552o0` to `72c2be51b5991f3cba7f3a8c0b28c58471f917d5`. No database rollback or worker change is required.

The pre-existing Netlify test database outage and stable-domain hydration warnings are tracked separately in the Contacts implementation record; a successful public asset publish does not establish database readiness.
