# Deep UI/UX gap audit — September 23, 2026

This is a second-pass review of the live release `3f85c77`. It builds on the [workflow and icon audit](UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md) and does not repeat what that release fixed. Three read-only reviews covered:

- the path from a stranger to first value
- accessibility and touch ergonomics
- data safety, status honesty and edge states

**Method.** Code review of `3f85c77`, plus contrast ratios calculated from `design-tokens.css`. Two findings were re-verified in the code: the Enter-key behaviour in onboarding, and the contact form's missing error handling. No browser, screen-reader or device testing was done for this pass, so treat the layout findings as risks until someone checks them on a phone.

**No P0 issues.** There is no cross-workspace data leak. Nothing destroys data on the server without the user asking, and every sign-up path ends somewhere.

## P1: fix next

### Sign-up and first value

| # | Gap | Evidence | Fix |
|---|---|---|---|
| 1 | Pressing **Enter** in any onboarding field quietly triggers "Save answers and finish later". The user leaves the page with no mega-mix installed. | `MegaMixSetup.tsx:22`: the first submit in the form is `formNoValidate` "finish later"; "Review my setup" is `type="button"` (`:33`) | Make "finish later" an explicit click handler, or add a harmless default submit at the start of the form |
| 2 | The welcome notice always says "Tap Review to begin", even when there is nothing to review. This happens after Skip, or when the first person has no phone or email. | `jumps/page.tsx:351` | Show "Tap Review" only when a first follow-up is ready; otherwise link to Add contact or Edit contact |
| 3 | Google and Apple sign-in fail for new people, including invitees. They land back on login with an invitation error. | `social-auth.ts:161`, `referral-access.ts:84`; `/register` has no social option | Carry the invite through OAuth state and show social buttons on `/register?invite=`, or label the login buttons "existing accounts" |
| 4 | An invite used with a different email says "unavailable or already used". An email typo on a text-message invite strands the account, because the pending page can't change the email. | `referral-access.ts:87-88`, `register/page.tsx:26-45`, `verify-email/pending/page.tsx:36` | Prefill the invited email; add a confirm-email field for phone invites; let an unverified account correct its email |

### Data safety

| # | Gap | Evidence | Fix |
|---|---|---|---|
| 5 | A failed save on a weak phone connection can wipe the **Contact form, Calendar form or Mix editor**. The error goes to the error page and everything typed is lost. | `ContactForm.tsx:81` and `CalendarEntryForm.tsx:31` have no catch; `MixEditor.tsx:157` posts directly; `contact-actions.ts:290` throws inside a transaction | Wrap them like `ActionForm` does and return `{ error }` so the entries stay put |
| 6 | Two tabs editing the same Mix or contact: **the last save silently wins**. It can remove Beats or phone numbers added in the other tab. | `mix-editor-actions.ts` ~305; `contact-actions.ts` 268-316 | Send a hidden revision and refuse stale saves with "Changed on another device. Reload to compare." |
| 7 | After the session expires, a message draft shows "Trying again…" forever and never explains why. | `EditableFollowUpAction.tsx` ~190-210 | On 401, stop and say "Signed out. Copy your message, then sign in." |

### Accessibility and touch

| # | Gap | Evidence | Fix |
|---|---|---|---|
| 8 | Many phone touch targets are **under 44px**. Global overrides load after the phone rules and shrink them again. | Today queue buttons 36px (`design-workspaces.css:318`); the new "…" is 44×36 (`phone-icons.css:20`); calendar event actions 32px; contact Edit/Back 32px (`contacts-workspace.css:53`); stage chip 30px; note menu 36×24; Journey canvas controls 32–40px | One `@media (max-width:900px)` block at the end of `phone-icons.css` setting min 44×44, with 8px gaps |
| 9 | Input borders fail non-text contrast. Fields on white only have a 1.56:1 border, 2.49:1 in dark. | `--border` in `design-tokens.css`; `base.css:165` | Add a `--field-border` token of at least 3:1 (≈#8C8AA3 light, #7A7799 dark) |
| 10 | Screen readers can't tell tag toggles apart: each is labelled only "On" or "Off". The tag name, tag note and date-type name inputs use a placeholder as their only label. | `ContactsBulkWorkspace.tsx:157-165`; `settings/jump-date-types/page.tsx:59` | Name the checkbox after its tag and give each input a visible label |
| 11 | Errors aren't tied to their fields (no `aria-invalid` or `aria-describedby` in the signed-in app). Server errors appear only as page banners. | e.g. `ContactTimeline.tsx:155`, `ContactProfile.tsx:150` | Return field keys from the actions, mark the field invalid and focus it |
| 12 | On desktop Contacts (3-pane), choosing a person leaves keyboard focus in the list. | `ContactsBulkWorkspace.tsx:199` | Move focus to the profile heading after it loads; the layout is unchanged |

## P2: polish and trust

**Honesty of status**
- **Premature "won't send automatically".** The message appears as soon as someone types, before the draft that creates the hold is saved (`EditableFollowUpAction.tsx`, `automatic-delivery.ts:152`). Show "Saving to hold this follow-up…" until it is saved.
- **False failure after a lost response.** Retrying an outcome whose response was lost shows "no longer pending", because each click gets a new request id (`JumpWorkflow.tsx:44,66`). Keep one id per attempt.
- **Error text from the URL.** Error banners render raw text from the URL on 48 pages. React escapes it, but a crafted link can still show any message in a trusted style. Switch to error codes or a flash cookie.
- **Mega-mix preview times and channels.** The preview ignores the account's locale, always showing US-style times, and labels WhatsApp steps "Phone call" (`MegaMixPreview.tsx:18`). Decide which timezone governs staff in other zones: the owner's or each user's own.
- **Merge-field chips.** They claim "Filled in automatically" even when the contact has no value, and `{{ }}` renders an empty chip (`MergeFieldText.tsx`).

**Destructive actions and double submits**
- **Double-tap errors.** Archive and the archive Undo can be submitted twice. The second request errors and hides the successful result. Use `FormSubmitButton`, or make restore idempotent.
- **Skip beat.** Skip has no confirmation. Its Undo doesn't reverse a connected Mix that has already started, about 10 seconds later (`mix-workflow.ts:80`).
- **Other destructive actions.**
  - Bulk archive has no Undo.
  - Discarding a saved draft asks for no confirmation.
  - Creating a contact has no idempotency key, so a retry after a lost response makes a duplicate.

**Onboarding and access**
- **The recommended path asks a lot up front.** About 17 controls, a review step and a checkbox come before anything happens. Keeping the mega-mix as the recommended path was your call. Consider sensible defaults with an "Adjust timing" option.
- **Re-running onboarding.**
  - `/onboarding` doesn't redirect people who have finished setup, so they can create duplicates.
  - The public header never offers "Open app" to signed-in users.
  - `?verified=1` is ignored, so there is no "Email verified" confirmation.
- **Copy in the sign-up flow.**
  - The first verify screen calls its link a "new" link.
  - The waitlist confirmation page is still titled "Join the waitlist".
  - Pilot installs send the owner to the waitlist.
  - Register and the waitlist tell two different stories about how access works.
- **Registration details.**
  - The rate limit counts invalid attempts (3 a day, then a 24-hour lock).
  - "Account already exists" doesn't link to sign-in or password reset.
- **One-person path.**
  - The required text signature field is hidden inside a collapsed section.
  - The file import opens in a new tab, which breaks for home-screen installs on iOS.

**Accessibility details**
- **Label mismatches.** Accessible names that don't match the visible label: the profile initial, "Later", and the archived search field, which is named "Find a calendar contact".
- **Hidden status.** Today hides the automatic/held status at every width.
- **Tag delete names.** Each tag's "Delete…" button has no context-specific name.
- **Contrast.**
  - Journey lines drawn at .16 opacity fall below 3:1.
  - Dark-mode `--text-3` on `--selected` is 4.15:1.
  - `--accent` has no dark value.
- **Reflow and scrolling.**
  - The contacts list uses `100vh`, which collapses on phones when the keyboard is open.
  - Merge chips don't wrap at 320px.
  - Horizontal scrollers have no scroll affordance or keyboard focus.
  - Some Today text is set at 11px.
- **Focus in sheets.** Modal sheets focus Close first, and the docked desktop review isn't announced.
- **Current page.** Desktop marks both Journey and More as the current page.
- **Other controls.**
  - The single-key "N" shortcut can't be turned off.
  - Required fields have no visible marker.

**Small follow-ups from the last release**
- **Journey wait field.** The days/hours field shows "05" after clearing, and tiny values show as 0. Keep the typed text and commit it on blur.
- **Add contact Back.** The Back link on Add contact drops the Mix context it came from. Use `returnTo`.
- **No save confirmation.** Returning to Today after editing a contact shows no "Contact saved" confirmation.

## Checked and fine

- **Security of the new Undo and return paths.**
  - Restoring a contact is scoped to the workspace, so a crafted Undo link for someone else's contact just says "not found".
  - Undo brings back the follow-ups that archiving cancelled.
  - The return-to-Today redirect accepts only in-app paths.
  - All Back links point to static parent pages and respect unsaved-changes guards.
- **Existing protections.** Workflow rules, message drafts and snooze already guard against stale saves.
- **Focus.** The skip link and focus-visible outlines are present. Nested confirm dialogs inside sheets stack correctly.
- **New styles.** The chip, active-tab and glossary colours pass contrast in both themes.
- **Marketing.** The copy consistently says "you send it yourself" and makes no pricing or integration claims beyond "free, no card".

## Suggested order

1. **Items 1, 5 and 8.** The Enter-key trap, forms that lose input, and 44px phone targets. These are small, contained changes with a large effect.
2. **Items 2, 7 and 9–12.** Honest welcome copy, the expired-session draft, field borders, and labels, errors and focus.
3. **Items 3, 4 and 6.** Social sign-up for invitees, invite email handling, and stale-save protection. These need product or auth decisions.
4. **The P2 list**, grouped by screen.

## Status — first fixes (branch `fix/ux-gaps-20260923`)

Implemented and verified in an isolated production build with a disposable database. Nothing was sent.

- **Item 1: Enter in onboarding.** An enabled, hidden default button that cancels its own click now comes first in the setup form. Browsers skip a *disabled* default and fall through to the next submit button. A test page confirmed this: in the old setup, Enter on the review checkbox triggered "finish later". Now:
  - Enter in a preference field opens the review step.
  - Enter on the review checkbox submits nothing.
  - No mega-mix is installed until the explicit button is pressed.
- **Item 5: Forms keep entries when a save fails.** The Contact form, the Calendar form and the Mix editor now catch a request that fails in flight and show "We couldn’t confirm this save. Your entries are kept." Next.js redirects still pass through.
  - Contact updates: concurrent address removals and duplicate email/phone conflicts return friendly errors instead of crashing the page.
  - Verified with the server-action request aborted mid-save: all three forms kept the typed values, and the Mix was not changed in the database.
- **Item 8: 44px phone targets.** One block at ≤900px, loaded last, restores a 44px minimum and 8px spacing, plus matching rules in the Contact timeline and Journey CSS modules. Desktop sizing is unchanged.
  - Measured at 390px: all 18 Today Review/"…" controls, contact Back/Edit/stage controls and calendar week navigation were ≥44px, with no horizontal scroll.

Checks: typecheck clean. Unit suite 1,413 passed; the one failure (`shared-mix-boundary`) is the same failure live production already has.
