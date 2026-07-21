# UX workflow optimization roadmap

This roadmap turns the current product workflow review into mergeable phases. The guiding interaction rule is:

> State the desired outcome, collect only missing information, confirm once, and land on the result.

## Phase 1 — core friction reduction

Implemented in the first workflow-optimization pull request:

- [x] Keep **Mark done** visible on mobile Jump cards.
- [x] Carry Quick Add person, date, reason, and note into Contact creation.
- [x] Save a Contact, first Important Date, and matching active Mix assignment in one form submission.
- [x] Redirect a newly created Contact to its detail page instead of the general Contacts list.
- [x] Store first and last names separately during onboarding.
- [x] Add direct Text, Email, Call, and Important Date actions to Contact details.
- [x] Make Contact selection available directly beside search and filters.
- [x] Remove the redundant Contact-row View button because the row body already opens the Contact.
- [x] Validate the production Docker target in GitHub Actions.

## Phase 2 — daily execution and continuity

- [ ] Add a return-from-composer tray with Done, Not sent, Snooze, and Edit note.
- [ ] Keep the next Jump in place after completion instead of forcing list reorientation.
- [ ] Autosave Quick Add, Contact, Mix, and AI draft work.
- [ ] Add Undo for reversible actions such as Done, Skip, Snooze, Pause, and Stop Mix.
- [ ] Restore filters, scroll position, expanded sections, and tabs after detail navigation.
- [ ] Show Jump reconciliation as a live outcome with a direct result link.

## Phase 3 — Mix creation consolidation

- [ ] Let users write action content directly inside the Mix builder.
- [ ] Replace the four-way New Mix menu with one goal-led creator.
- [ ] Turn template import into a one-screen **Use this template** setup.
- [ ] Let AI review activate the Mix directly instead of creating another draft handoff.
- [ ] Hide trigger, audience, and content fields that do not apply to the selected path.
- [ ] Require explicit audience confirmation and show projected recipient and Jump counts.

## Phase 4 — search, import, and information architecture

- [ ] Auto-apply filter selections and debounce search fields.
- [ ] Compress Contact import into Choose file, Review issues, and Results.
- [ ] Consolidate Settings, My Account, and Mix Templates into one coherent hierarchy.
- [ ] Add a command palette for Contacts, Mixes, settings destinations, and capture commands.
- [ ] Support range selection and select-all-matching for bulk Contact work.
- [ ] Standardize customer-facing terms: follow-up action, message/call template, and follow-up plan.

## Interaction budgets

| Core task | Target |
|---|---:|
| Complete a prepared Jump | One in-app action before the native composer and one confirmation after returning |
| Add an Important Date to an existing Contact | One overlay, no page transition |
| Add a Contact and schedule the first follow-up | One form submission |
| Use a Mix template | One setup screen plus activation |
| Apply a search or filter | No Apply button |
| Pause, snooze, skip, or stop reversible work | One action plus optional Undo |
| Find an object just created | Zero searching; navigate directly to it |
| Resume unfinished input | Restore the draft automatically |
