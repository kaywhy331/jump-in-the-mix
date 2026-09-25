# Audit release C-1 — September 25, 2026

Release C-1 is the first part of the [2026-09-24 full audit](FULL_AUDIT_2026-09-24.md)'s scale work (§5, "Release C"), after Releases A, A2, B and B11. An independent review of the Release C plan split it into four releases; C-1 holds the items that change the request path and need no migration:

- C9: one session and display-preference read per page render
- C6: a bounded push reminder pass, with one summary push for a backlog
- C5: a streamed personal-data export
- C2 (with MIX-F10): Marketplace facts refreshed when an author saves and hourly, never on list reads
- C8: contact imports under a per-workspace lock instead of the global one

Nothing here should be visible to users except in speed, with two small exceptions stated below. It is code only: nothing in `prisma/`, `package.json`, the lockfile, `render.yaml` or `next.config.ts` changes, so rolling back is a redeploy of Release B11 (`f511984`).

| Release | Value |
| --- | --- |
| Branch | `feat/audit-release-c1-20260925` (based on Release B11, `f511984`, and its record) |
| Previous production commit | `f511984a4867a98c5d97b6a2a4a16e6266105dc0` (tag `prod-2026-09-25-f511984`) |
| Application commit | the commit that adds this record |

## What changed

| Area | Commit | Changes |
| --- | --- | --- |
| One read per render (C9) | `f031654` | `getCurrentSession` and `displayPreferencesForUser` are React `cache()` wrappers, so a page render reads the session and the display preferences once instead of once per layout and page. Server actions, route handlers and the worker are unaffected (`cache` does nothing outside a render), so an action always reads its own writes. The recovery-hold check stays uncached, as the runbook promises. A source test fails if a render mutates the shared session or preference objects. |
| Push reminders (C6) | `0adee5d` | The minute pass finds due reminders in SQL, with the same rules as before, and counts them (capped at 1,000) instead of loading every due follow-up with its receipts. Up to 100 due keep today's path. Above that, one statement claims them all and the device gets one push ("N follow-ups are ready…") instead of one push per 100 each minute. The recheck reads ids in chunks instead of one long `OR`. |
| Personal-data export (C5) | `f12a639` | The JSON export streams section by section, in today's order, reading pages of at most 500 rows (fewer for heavy rows) with a unique tie-break, and pages nested lists per parent, so memory no longer grows with the account. Shared workflow definitions are written after the instances, as before. If a read fails after the download starts, the download fails instead of saving a truncated file, and the page says "The download stopped before it finished. Try again." The spreadsheet bundle is unchanged. `docs/ACCOUNT_EXPORT_INVENTORY_2026-09-22.md` says the sections are read page by page, not as one snapshot. |
| Marketplace (C2, MIX-F10) | `ee5bb4f` | List rows render from the stored listing facts, and update notices compare stored fingerprints, so browsing the Marketplace no longer exports anything or writes. An author's Mix or Mega-Mix save refreshes its shares after it commits; the opened listing and the staff review queue still refresh when read; the worker walks the remaining live shares hourly, oldest first. A refresh no longer overwrites facts that a newer save wrote. The Mega-Mix export reads only the saved Journey configuration instead of every Mix in the workspace (the fingerprint is unchanged). |
| Import locks (C8) | `7e0030f` | Contact import rows and their bookkeeping take a lock of their own workspace (class 814734) instead of the global access lock, so an import no longer delays sign-ins, invitations or other workspaces' imports. Queueing, cancelling, suspension and account deletion take the affected workspace keys after the access lock, in key order, and wait for the row in progress; System Mix invitations, which may create a contact, take it too. One order everywhere: staff lock, access lock, workspace import key, job rows, batch rows. |

## Decisions taken while building

1. **Marketplace staleness (audit F2, owner decision recorded here):** list facts are current after an author's save in the Mix editor or on a Mega-Mix. Other changes (date-type renames, Journey edits, connection toggles, archiving or restoring a member Mix), and update notices for them, catch up within an hour, or at once when the listing is opened. The hourly pass takes up to 200 live shares per run.
2. **The staff review queue keeps refreshing on read:** it is rarely opened, and a restore needs the live wording's fingerprint.
3. **Export order columns:** sections keep today's order column (for example follow-ups by scheduled time), with a unique tie-break added, rather than switching to creation time, so the document is unchanged. A draft saved during a download can appear twice or not at all (drafts are ordered by last save); this is documented.
4. **A backlog push counts up to 1,000:** with more due, a device gets one push per 1,000 per pass.
5. **Deploy order:** the worker deploys first, as always. For the few minutes before the web deploy, the old web's suspension or deletion takes only the global lock, so it does not wait for a worker import row: at most one row can commit after a suspension, and a deletion that meets a running import row may be refused once as a deadlock and must be retried. Production has one workspace and no import running during releases.

## Verification

All checks ran on TrixBot (3.8 GB), one heavy job at a time, against the `jitm_design_market` database.

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run validate:static` | clean |
| `vitest run`, with the push database suites enabled (`RUN_PUSH_DATABASE_TESTS=true`) | 2,092 passed, 72 skipped by environment. Failures: the three `staff-access` bootstrap tests (they need an empty staff table and pass 9/9 in an isolated database), and one `beforeAll` in `automatic-delivery-recipient` that timed out under the full parallel load; that file passes 4/4 alone. |
| New tests | request cache guard (5), push backlog and SQL-vs-JavaScript parity (5 new cases), streamed export parity, page bounds, mid-stream failure and cancel (6), Marketplace refresh on save, hourly pass and race (7), import locks across workspaces, sign-in, suspension, deletion and cancel (6) |
| `npm run build` | passed, no warnings |
| Playwright, desktop project, all 79 spec files | 365 passed; every failure below also fails on the live build |

**Method.** Release B11's production build (`f511984`) served on port 3101 and the C-1 candidate on port 3102, both with CI's synthetic environment. Every spec file ran against the candidate in batches of five; each failure was run again on both builds.

- **Failing identically on the live build.** Late on 2026-09-25 the shared demo workspace had nothing due and nothing done yet for its new day, after a day of test runs:
  - `visual-fitment` ×2 look for a pending follow-up on Today and find none (test data).
  - `design-adoption` "desktop review…" expects the first due follow-up to open with a message field (test data).
  - `a2-css-checks` "Today rows…": the test's pending card overflows its 320 px row by 8 px.
  - `accessibility` `/jumps`: with nothing done yet today, the "Done 0" summary and the "View completed follow-ups" link are closer together than the 24 px target size (a real product problem, listed under Follow-ups).
- **Passed when run again on both builds:** `journey-connections` "delete an individual branch…".
- The phone project was not run: C-1 changes no layout except the export's failure sentence.

## Release

Pending. The code-only pipeline (`.artifacts/market-live-20260924/c1-*.mjs`) runs after this record is committed and pushed: preflight, worker deploy with a queue probe, web deploy, postflight, live smoke (now also: the synthetic owner downloads the streamed JSON export and it parses), final check.

## Rollback

Deploy `f511984a4867a98c5d97b6a2a4a16e6266105dc0` to the web service, then to the worker. C-1 writes nothing the previous code cannot read: push receipts are the same rows (a backlog's receipts are ordinary receipts), Marketplace facts are the same columns, and the export writes nothing.

## Follow-ups

- Today, with nothing done yet that day: the "Done 0" summary and the "View completed follow-ups" link are too close for a 24 px target, and a pending card can overflow a 320 px row by 8 px. Both reproduce on the live build.
- C-2 (workflow definitions stored once, by content hash, with batched admission) and C-3 (due-time-driven workflow checks with a 15-minute floor and explicit wake-ups) are optional at one workspace; they change the scheduling core and wait for the owner.
- C-4 (caching public pages at Cloudflare) needs the owner's decision on reusing a page's CSP nonce across visitors, a Cloudflare cache rule, and a purge on every deploy and rollback.
- `FollowUpPushDelivery` has no retention: about 0.5 KB per device per due follow-up occurrence. The finalize updates filter on `lockedBy`, which has no index. Both are small now; add retention and the index together.
- Some export keysets have no matching index (contacts, workflow instances and Journey events by workspace; memberships and push receipts by creation time); each page re-sorts that set. It needs a migration.
- Two audit scale items remain without a release: the five-minute reconciliation that visits every workspace, and the Journey page's full scan of every workflow instance.
- The schema comment on `MarketplaceListing` and `docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md` still describe read-time refresh.
