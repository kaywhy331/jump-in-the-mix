# Three-Beat public demo correction

The owner clarified that every demo situation should imitate the app with a fictional contact and three scheduled Beats: SMS today, email tomorrow, and a phone call in one week. The previous demo instead used edit, preview, and reminder selection as its three steps.

## Implementation

- The homepage and all five profession routes now use the same compact Today workspace, with the full three-Beat schedule and a contact’s context. All 19 situations have SMS, email with a subject, and call notes.
- Each channel has an editable draft and a distinct Messages, Email, or Phone preview. Previewing an upcoming Beat retains its original due label. Recording an outcome is explicitly simulated and separate from previewing; Not yet and Undo keep the draft intact.
- Switching situations preserves each situation’s edits, subject, selected Beat and progress during the visit. Reset affects only the selected situation. Nothing is sent, called, written to an account, or passed into the waitlist besides its existing allowlisted situation identifier.
- The supplied landing and Today/review layouts govern the typography, palette, contact avatar, Beat timeline, draft bubble and controls. The owner’s new three-Beat contract supersedes the export’s edit/preview/record sequence. Original exports and real starter Mix schedules are preserved.
- The asset index, five fictional ICP introductions, supplied copywriting/marketing guidance, homepage roadmap and current handoff/outcome behavior informed the copy. These examples are illustrations, not customer evidence or measured conversion improvements.

## Verification and release

Release checks and hosted verification are being recorded in `.artifacts/demo-workspace-20260919/`. Final deployment results will be added here after verification. There are no schema, dependency, worker, real sending, or authenticated-app changes in this release.

The pre-existing Netlify test database outage and stable-domain hydration warnings are tracked separately in the Contacts implementation record; a successful public asset publish does not establish database readiness.
