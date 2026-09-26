| ID | Sev | Status | Finding | Effort | Migration | Owner decision |
|---|---|---|---|---|---|---|
| ACC-F1 | P0 | VERIFIED | Account deletion leaves imported contact rows, customer review feedback, push keys and delivery/preference records behind | M | no | yes |
| PRO-F1 | P0 | VERIFIED | Nothing on the last 65 commits and 5 production releases has been through CI | S | - | yes |
| PRO-F2 | P0 | VERIFIED | The customer site runs code that only one unmerged branch references; `main` is 14 days and 1,098 files behind | S | - | yes |
| ACC-F2 | P1 | VERIFIED | Deleting a staff member's own account erases their replies from other customers' support tickets | S | no | yes |
| ACC-F3 | P1 | VERIFIED | Staff-only accounts have no reachable account page (sessions, password, sign out everywhere) | M | no | yes |
| ACC-F4 | P1 | VERIFIED | Ticket page offers "Check acceptance receipt" to support staff who are not allowed to run it | S | no | yes |
| CON-F1 | P1 | VERIFIED | Merging duplicates drops the merged person's Mix stops, so a stopped Mix resumes for the survivor | S | no | no |
| CON-F2 | P1 | VERIFIED | Import silently drops phones and emails from Google Contacts, Outlook and common spreadsheet headers, and never shows the "no phone or email" warning | M | no | no |
| CON-F3 | P1 | VERIFIED | Phone numbers are normalised by format, not by number, so the same person is not detected as a duplicate across the form, device picker, import and lead form | L | yes | yes |
| CON-F4 | P1 | VERIFIED | Bulk archive deactivates Mix assignments (single archive does not), has no Undo, and Restore cannot bring the plans back | M | no | yes |
| CON-F5 | P1 | VERIFIED | Searching by phone number only matches the digits exactly as they were typed when the contact was saved | S | no | no |
| CON-F6 | P1 | VERIFIED | The contact form blocks on a number that belongs to an archived person and never says who has it | S | no | yes |
| CON-F7 | P1 | VERIFIED | Two devices editing one contact: the last save silently wins (prior audit item 6) | M | no | no |
| CON-F8 | P1 | VERIFIED | Errors are not tied to fields and the wrong control gets focus (prior audit item 11) | M | no | no |
| CON-F9 | P1 | VERIFIED | Desktop 3-pane: selecting a person leaves keyboard focus in the list (prior audit item 12) | S | no | no |
| DES-F1 | P1 | VERIFIED | The single-key "N" shortcut cannot be turned off or remapped (WCAG 2.1.4, Level A) | S–M | - | yes |
| DES-F2 | P1 | VERIFIED | Phone controls that are still under 44px after the 09-23 target fix | S | - | no |
| DES-F3 | P1 | VERIFIED | Today queue rows: 14px names, 32px/11px avatars and uppercase group headers where the export uses 16px, 40px/14px and sentence case | S | - | no |
| FUN-F1 | P1 | VERIFIED | New accounts default to UTC and onboarding never detects the phone's timezone, so Today, due times and the default follow-up date are computed in the wrong zone | S | no | no |
| FUN-F2 | P1 | SUSPECTED | The session cookie is `SameSite=Strict`, but sign-in happens on GET links opened from email and on OAuth callbacks, so the browser may drop the just-created session and land the person on /login | S | no | yes |
| FUN-F3 | P1 | VERIFIED | Deep-gap item 3 is still open: invitees cannot use Google/Apple, `/register` has no social option, and the resulting error tells them to open the link they already opened | M | yes | yes |
| FUN-F4 | P1 | VERIFIED | Deep-gap item 4 is still open: the invited email is not shown or prefilled, a mismatch reports "unavailable or already used", and an unverified account cannot correct a typo | M | no | yes |
| MIX-F1 | P1 | VERIFIED | Imported, copied and Marketplace-added date-based Mixes bind to a fresh duplicate date type and never start | S | no | no |
| MIX-F2 | P1 | VERIFIED | Staff "Restore share" republishes a listing the author already withdrew | S | no | no |
| MIX-F3 | P1 | VERIFIED | Removing a Mega-Mix silently deletes its Marketplace share and every report on it — a two-click way out of a hidden listing | S | no | yes |
| MIX-F4 | P1 | VERIFIED | Mix editor: two tabs, last save wins (gap-audit item 6 still open) | M | no | no |
| OPS-F1 | P1 | VERIFIED | Every workflow instance stores the whole workspace Mix content as JSON, and Today, the digest, the Journey page and the account export load all of it per view | M | no | no |
| OPS-F2 | P1 | VERIFIED | Marketplace list and detail views re-export every listed author's live Mix content on each page view, and write on GET | M | no | yes |
| OPS-F3 | P1 | VERIFIED | Whole-workspace follow-up reconciliation every 5 minutes: a race that cancels freshly created follow-ups, and sequential admission lookups per contact | M | no | no |
| OPS-F4 | P1 | VERIFIED | Every ACTIVE workflow instance is re-evaluated every minute regardless of whether anything is due, capped at 50 per pass | M | no | no |
| PRO-F3 | P1 | VERIFIED | The production release procedure is not in version control | M | - | yes |
| PRO-F4 | P1 | cause **VERIFIED**;  | The 09-24 release record claims a pass that no saved run shows; root cause of the `journey-connections` seeding failure | S | - | no |
| PRO-F5 | P1 | SUSPECTED | Browser specs assert UI copy that the redesigns removed; 63 of 73 specs have no run evidence since 09-17 | M | - | no |
| PRO-F6 | P1 | VERIFIED | No repo-tracked smoke can target production; the documented staging gate no longer matches practice | S–M | - | yes |
| PRO-F7 | P1 | VERIFIED | Open audit items 3, 4, 6, 11, 12 and the P2 list have neither implementation nor automated check | M | - | yes |
| SEC-F1 | P1 | VERIFIED | Rate limits and audit IPs trust the first `X-Forwarded-For` hop, which the client controls | M | no | yes |
| SEC-F2 | P1 | VERIFIED | Any account can hide a competitor's Marketplace share instantly with one report | M | no | yes |
| TOD-F1 | P1 | VERIFIED | A failed automatic delivery is silent, never retried, and Today keeps implying it will send | M | no | yes |
| TOD-F2 | P1 | VERIFIED | Automatic-sending state and its send time are invisible on Today at every width | M | no | yes |
| TOD-F3 | P1 | VERIFIED | A new request id per attempt turns a lost response into a false "no longer pending" failure | S | no | no |
| ACC-F5 | P2 | VERIFIED | Automatic-sending preview lists messages the worker would never send | S | no | no |
| ACC-F6 | P2 | VERIFIED | Settings and More forms stay live during a view-only support session and fail with a bare 403 | M | no | no |
| ACC-F7 | P2 | VERIFIED | `{{My Address}}` and `{{My Custom 1–3}}` placeholders can never be filled | S | no | yes |
| ACC-F8 | P2 | VERIFIED | Locale is stored without validation; an invalid tag breaks date formatting everywhere for that user | S | no | no |
| ACC-F9 | P2 | VERIFIED | Copy that no longer matches the preferences page after journey setup, and a deletion promise with no mechanism | S | no | yes |
| ACC-F10 | P2 | VERIFIED | Personal-data export is unthrottled and fully buffered | S | no | no |
| ACC-F11 | P2 | VERIFIED | Staff-owner deletion guard surfaces as a generic error and leaves the audit row `STARTED` | S | no | no |
| CON-F10 | P2 | VERIFIED | Merge leaves appointment bindings, review requests and access invites pointing at the archived record | S | no | no |
| CON-F11 | P2 | VERIFIED | Deleting a tag cascades away the Mix assignments that target it, but the dialog says nothing changes for people | S | no | yes |
| CON-F12 | P2 | VERIFIED | On phones, every Contacts list load also renders the hidden profile of the first person | M | no | yes |
| CON-F13 | P2 | VERIFIED | Import: one bad email fails the whole row, and duplicates inside the same file are only discovered as failures after queueing | M | no | yes |
| CON-F14 | P2 | VERIFIED | Creating a contact has no idempotency key (prior audit P2 still open) | S | no | no |
| CON-F15 | P2 | VERIFIED | Opening an archived contact's link returns 404 instead of an archived state with Restore | S | no | no |
| CON-F16 | P2 | VERIFIED | Undo and Restore can be submitted twice; the second submit shows an error that hides the success | S | no | no |
| CON-F17 | P2 | VERIFIED | Two prior P2 navigation items are still open: Add contact's Back drops the Mix context; returning to Today after an edit shows no confirmation | S | no | no |
| CON-F18 | P2 | SUSPECTED | Search text containing `%` or `_` may over-match | S | no | no |
| CON-F19 | P2 | SUSPECTED | The private review page marks a request "opened" on any GET, so link scanners can produce a false "Opened the private review check-in" entry | S | no | yes |
| CON-F20 | P2 | SUSPECTED | A public lead-form submission that matches one existing customer is auto-attached and fires a journey event on that customer | M | no | yes |
| CON-F21 | P2 | SUSPECTED | The duplicates page renders every pair for a shared value, so a shared office number produces a wall of cards | S | no | no |
| DES-F4 | P2 | VERIFIED | The docked Today review has no maximum width; the composer stretches to ~900px | S | - | yes |
| DES-F5 | P2 | VERIFIED | The compact rail (901–1279px) sets navigation labels at 10px | S | - | no |
| DES-F6 | P2 | VERIFIED | Text below the 13px floor remains on Today, Calendar, the Mix editor and Journey | S | - | no |
| DES-F7 | P2 | VERIFIED | Confirmations and Quick Add bubbles do not use the export's toast/bubble language | S–M | - | yes |
| DES-F8 | P2 | VERIFIED | Mix library rows omit the export's rhythm track | M | - | no |
| DES-F9 | P2 | VERIFIED | Journey connection lines and labels dimmed to 16–22% opacity fall to ~1.2:1 | S | - | yes |
| DES-F10 | P2 | VERIFIED | Marketplace report badge: white on `--late` is 2.29:1 in dark mode | S | - | no |
| DES-F11 | P2 | VERIFIED | The waitlist band hardcodes colors and inverts the dark-mode input | S | - | no |
| DES-F12 | P2 | VERIFIED | Sheets place initial focus on the Close control | S–M | - | no |
| DES-F13 | P2 | VERIFIED | Repeated per-item buttons share one accessible name | S | - | no |
| DES-F14 | P2 | VERIFIED | Profile initial link is named "Open profile menu" but navigates to More | S | - | no |
| DES-F15 | P2 | VERIFIED | Portrait tablets (768–900px) get a sticky top header the export does not have | S | - | yes |
| DES-F16 | P2 | VERIFIED | Landing typography runs a step below the export at every width | S | - | yes |
| DES-F17 | P2 | VERIFIED | Horizontal scrollers: the contact Journey track is not keyboard reachable, and none show an affordance | S | - | no |
| DES-F18 | P2 | SUSPECTED | Merge-field chips never wrap | S | - | no |
| DES-F19 | P2 | SUSPECTED | Fixed heights that will clip at 200% text | S | - | no |
| DES-F20 | P2 | SUSPECTED | No print stylesheet | S | - | yes |
| DES-F21 | P2 | VERIFIED | Required fields have no visible marker and the convention is unstated | S | - | no |
| FUN-F5 | P2 | SUSPECTED | Verification and magic-link tokens are consumed by a plain GET, so link scanners can burn them, and a consumed verification link is reported as an error even though the person is now verified | S–M | no | no |
| FUN-F6 | P2 | VERIFIED | Registration rate limit counts invalid attempts and the lock message reads "about 1440 minutes" (deep-gap "Registration details", still open) | S | no | no |
| FUN-F7 | P2 | VERIFIED | Sessions expire 14 days after sign-in with no sliding renewal, so a phone-first daily tool signs its user out every two weeks | S | no | yes |
| FUN-F8 | P2 | VERIFIED | Re-running onboarding creates duplicates; `?verified=1` is ignored; signed-in visitors get "Sign in" instead of "Open app" (deep-gap "Onboarding and access", still open) | S–M | no | no |
| FUN-F9 | P2 | VERIFIED | Sign-up copy contradicts behaviour (deep-gap "Copy in the sign-up flow", still open) plus two silent no-ops | S | no | yes |
| FUN-F10 | P2 | SUSPECTED | In the one-person path "Import contacts from a file" opens a new tab, which loses the session in iOS home-screen installs (deep-gap "One-person path", still open) | S | no | no |
| MIX-F5 | P2 | VERIFIED | The privacy check skips wording the Marketplace shows publicly: connection names, path labels and outcomes | S | no | no |
| MIX-F6 | P2 | VERIFIED | Import validation is looser than the editor: files can create Beats the editor would refuse, and some files fail with a raw database message | S–M | no | no |
| MIX-F7 | P2 | VERIFIED | Numbering edge cases: repeat-limited forward paths, disabled connections, track order, and join gaps | S–M | no | yes |
| MIX-F8 | P2 | VERIFIED | Popularity counters include the author's own favorites and adds; an author can add their own listing repeatedly | S | no | yes |
| MIX-F9 | P2 | VERIFIED | A shared Mix that becomes unavailable stays LIVE, skews counts, and its own page shows the generic empty state | S–M | no | yes |
| MIX-F10 | P2 | SUSPECTED | Listing reads do a full live export per row, loading the author's entire workspace graph each time | M | no | no |
| MIX-F11 | P2 | VERIFIED | Journey wait field still shows "05" after clearing and rounds small values to 0 (gap-audit P2, unchanged) | S | no | no |
| MIX-F12 | P2 | VERIFIED | Add contact Back link drops the Mix context (gap-audit P2, unchanged; outside this dimension, noted because the brief named it) | S | no | no |
| MIX-F13 | P2 | VERIFIED | After staff uphold a report the author has no in-product way back | M | yes | yes |
| OPS-F5 | P2 | SUSPECTED | Worker redeploys: no shutdown grace configured, signal path through `npm run` + `tsx` unverified, and long jobs are not interruptible | S–M | no | no |
| OPS-F6 | P2 | VERIFIED | Job claim polling scans the whole job history because the index leads on `runAt` | S | yes | no |
| OPS-F7 | P2 | VERIFIED | Every signed-in request pays a recovery-hold catalog read through a 2-connection pool, plus duplicated session and preference lookups | S | no | yes |
| OPS-F8 | P2 | VERIFIED | Personal data export builds the whole workspace in memory with unbounded queries | M–L | no | yes |
| OPS-F9 | P2 | VERIFIED | Push reminder pass reads every overdue follow-up each minute and notifies backlogs 100 at a time | S–M | no | no |
| OPS-F10 | P2 | SUSPECTED | The readiness endpoint doubles as the runtime health check, so a transient database error can restart a healthy web instance | S | no | yes |
| OPS-F11 | P2 | VERIFIED | The contact import route's 12 MB body cap only checks `Content-Length`, so chunked uploads bypass it | S | no | no |
| OPS-F12 | P2 | VERIFIED | Public pages cannot be cached by Cloudflare, so every marketing hit is a server render on 0.5 CPU | S | no | yes |
| OPS-F13 | P2 | VERIFIED | One global advisory lock serializes sign-in, import commits, waitlist and webhook processing across all workspaces | S | no | no |
| OPS-F14 | P2 | VERIFIED | Interactive email sends retry three times with 15 s timeouts inside request handlers | S | no | no |
| PRO-F8 | P2 | VERIFIED | Quality gates are thinner than they look: no linter/formatter, `.mjs` never type-checked, `check` omits e2e | M | - | no |
| PRO-F9 | P2 | VERIFIED | Dead code, duplicates and repository hygiene | S | - | no |
| PRO-F10 | P2 | VERIFIED | Environment and documentation tell the July/Netlify story to a September/Render product | S | - | yes |
| SEC-F3 | P2 | VERIFIED | Fifty-one pages render arbitrary URL text inside the product's error banner | M | no | no |
| SEC-F4 | P2 | VERIFIED | Per-email auth throttles let anyone lock password sign-in and mail-bomb a target | M | no | yes |
| SEC-F5 | P2 | VERIFIED | Anonymous lead-form submissions append text to existing contacts and drive their journey | S–M | no | yes |
| SEC-F6 | P2 | VERIFIED | Imported and Marketplace content bypasses the editor's placeholder rules and lands as ACTIVE | S | no | yes |
| SEC-F7 | P2 | VERIFIED | Support "view-only" sessions can still download the customer's Mix and Mega-Mix files | S | no | no |
| SEC-F8 | P2 | VERIFIED | Magic-link and verification tokens are consumed by a GET | ? | - | no |
| SEC-F9 | P2 | VERIFIED | Redirect targets for the support-view endpoints are built from `X-Forwarded-Host` | ? | - | no |
| SEC-F10 | P2 | VERIFIED | Unbounded anonymous row creation on OAuth start and push subscriptions | ? | - | no |
| TOD-F4 | P2 | VERIFIED | Handoff links are built from the display phone and rely on `?body=` | S | no | yes |
| TOD-F5 | P2 | VERIFIED | "won't send automatically" appears before the hold exists | S | no | no |
| TOD-F6 | P2 | VERIFIED | Skip has no confirmation; the Done list's "Undo" is unbounded and reopens automatically sent follow-ups | S | no | yes |
| TOD-F7 | P2 | VERIFIED | Discarding a saved draft has no confirmation and no undo | S | no | no |
| TOD-F8 | P2 | VERIFIED | No "Contact saved" confirmation when returning to Today from "Add phone/email" | S | no | no |
| TOD-F9 | P2 | VERIFIED | Archive and archive-Undo double submit turn a success into an error (contacts scope, verified as requested) | S | no | no |
| TOD-F10 | P2 | VERIFIED | Merge-field chips: `{{ }}` renders an empty chip and every chip claims "Filled in automatically" | S | no | no |
| TOD-F11 | P2 | VERIFIED | Visible 11px text on Today outside the design's use of it | S | no | no |
| TOD-F12 | P2 | VERIFIED | "N days overdue" is off by one across a daylight-saving change | S | no | no |
| TOD-F13 | P2 | SUSPECTED | Race between an automatic send in flight and the owner marking the same follow-up | M | no | yes |
| TOD-F14 | P2 | SUSPECTED | Unbounded reads on two hot paths | M–L | yes | no |
| TOD-F15 | P2 | VERIFIED | Small honesty gaps in labels | S | no | yes |
