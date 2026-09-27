# Invite page redesign — September 27, 2026

Live at **https://jumpinthemix.com/** as of 2026-09-27 15:45 UTC. This is a code-only release of PR #88, requested by the owner: no migration and no configuration change.

| Release | Value |
| --- | --- |
| Previous production commit | `a70e60c540e09a68737afcc31c0fd7d21579453f` (tag `prod-2026-09-27-a70e60c`) |
| Application commit | `1da264fe4b696ae1ad0c49c45872262261251f19` (merge of PR #88 into `main`; tag `prod-2026-09-27-1da264f`) |
| Worker deploy | `dep-dasjht0473hc738joeb0`, live 2026-09-27 15:42:02 UTC |
| Web deploy | `dep-dasjiogjo6nc73c2tthg`, live 2026-09-27 15:45:43 UTC, build `GDw7WqS0BAEbA_Pkz4HBv` |
| Final check | 2026-09-27 15:47:06 UTC |

## What changed

The owner found that the invite page (`/mixes/system`) did not follow the app's design. They asked for one field per person (name, email, or phone), up to three people, and fields narrower than the section.

- **Heading.** "Invite people" replaces the internal "Jump in the Mix System Mix". The allowance reads "N of 3 invitations remaining", with three dots.
- **One field per person.** Each numbered row has a single "Name, email, or phone" field.
  - Typing a name suggests saved contacts, one option per email or number. Keyboard selection works.
  - A chosen contact shows as a violet box with the name and address.
  - Typing an email or phone number marks a new contact, and an optional "Their name" field appears beside it.
  - Text that is neither a contact nor an address is stopped before submission, with a message.
- **Layout.** The form is capped at 640 px and the invitations list at 760 px. There is one shared "Preview invitation", an "Add another person" link and a normal-width submit button (full width on phones).
- **Your invitations.** Flat rows with a status pill, "Open in Today" and a smaller "Revoke invitation…".
- **Removed.** The "Go to Today" header button and the separate "Find a saved recipient" search.
- **Unchanged.** The server action, the confirmation dialog, single-use links and the rule that revoking does not restore a slot.

## Verification

GitHub Actions is still blocked by account billing, so the CI jobs ran on TrixBot with CI's environment:
- **Vitest (`test:isolated`):** 2,112 passed, 0 failed.
- **Static checks:** `validate:static` and the typecheck are clean; the production build passed.
- **Dependency audit:** passed at the high threshold, with 1 moderate finding that was already there. No dependencies changed.
- **gitleaks:** no leaks.
- **Playwright** against a production build, desktop and phone: `onboarding-invitations`, `invitation-prompts` and `system-mix-administration` (with `SYSTEM_MIX_E2E=1`), 12 of 12 passed.
  - The main invitation test now also runs axe in light and dark on the invite page and checks for horizontal scroll.
  - Its Today step skipped the phone Review click when the cards had not rendered yet. It now waits for them; this was the "known flaky" phone failure in the previous release.
- **Not run:** the full browser suite. The new styles are scoped to this page (`src/styles/invitations.css`), and their class names were checked for collisions.

## Release

Scripts `.artifacts/market-live-20260924/inv-*.mjs` (copied from the previous release's scripts). Every step passed on the first run:
- **Preflight:** the pushed commit matched and the diff touched no schema, dependencies or runtime configuration. The 71 migrations matched, the database was ready and the runtime boundary held.
- **Worker deploy:** passed, with its queue probe; the synthetic job was removed.
- **Web deploy:** passed.
- **Postflight:** 18 public checks passed, 7 release files and 20 served assets were hashed on the live instance, and the database was ready.
- **Live smoke (16 checks) with a synthetic owner, removed afterwards.** Beyond the previous release's checks, the invite page:
  - showed "Invite people" and "3 of 3 invitations remaining";
  - recognised a typed email as a new contact and offered the name field;
  - kept the form within 640 px;
  - created no invitation;
  - passed axe and reflow on a phone in both themes.
- **Final check:** record counts were unchanged since the preflight. No synthetic rows, failed jobs or rate-limit blocks remained; health was 200 and both services were on the release commit with auto-deploy off.

## Rollback

Redeploy `a70e60c` (worker, then web). Nothing needs undoing.

## Not run

Physical devices.

## Follow-up: invitations wait in Today to be sent (PR #90)

Live since 2026-09-27 17:13 UTC as `231374880716af77036963fb7b658bb411cbe16f` (merge of PR #90; tag `prod-2026-09-27-2313748`). This is a code-only release, with `1da264f` as the previous production commit.

| Release | Value |
| --- | --- |
| Worker deploy | `dep-daskqfm0tbcc73fs4spg`, live 2026-09-27 17:08:44 UTC |
| Web deploy | `dep-daskrpl9fdbs73dtfmk0`, live 2026-09-27 17:13:20 UTC, build `zcrUG09OrNpXeE8L06mAU` |
| Final check | 2026-09-27 17:15:45 UTC |

**Why.** The owner prepared an invitation and expected it to reach the recipient's inbox. Member invitations are always delivered by the member (`manualDelivery: true`): the app adds a reminder to Today, and the member sends the message from their own email or text app. The interface did not make that clear. Delivery behavior did not change.

**What changed.**
- **Invite page.** It now says "Invitations aren't emailed for you", followed by three steps: add people, open each one in Today, send it from your email or text app. The footnote reads "Next, you'll go to Today to send them."
- **Confirmation.** "Add N invitations to Today for …?", starting "Nothing is emailed yet", with the button **Add to Today**.
- **Today.** While any prepared invitation is unsent, a panel shows "N invitations ready to send". It has a **Review and send** button per person, which opens that invitation's review.
- **Your invitations.** Unsent invitations show "Ready to send · not sent yet" and a **Send now** button.

**Verification.** CI jobs ran on TrixBot because GitHub Actions is still blocked:
- **Vitest:** 2,112 passed, 0 failed.
- **Static checks:** typecheck, `validate:static`, the build and gitleaks are clean.
- **Playwright** on a production build, desktop and phone: 84 passed and 0 failed across 10 specs (the invitation, Today, core-flow, accessibility and design specs); 10 were skipped by the specs' own conditions.

**Release.** Scripts `.artifacts/market-live-20260924/snd-*.mjs`; every step passed on the first run:
- **Preflight:** passed; 71 migrations matched and no schema or dependency changes.
- **Worker deploy:** passed, with its queue probe.
- **Web deploy:** passed.
- **Postflight:** 18 public checks passed; 7 release files and 20 assets were hashed on the live instance.
- **Live smoke:** 17 checks passed, including the new "aren't emailed" wording and the three steps. The synthetic data was removed.
- **Final check:** counts were unchanged and health was 200.

**Rollback.** Redeploy `1da264f` (worker, then web). Nothing needs undoing.
