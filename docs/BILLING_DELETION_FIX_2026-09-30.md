# Account deletion closes the right billing (BIL-01) — fix record, September 30, 2026

The WF-05 review of the pricing and billing release found that deleting an account closed Stripe billing for the workspace the session opened (`requireWorkspace()`, the person's first membership), while the deletion removes the workspaces the person *owns*. With billing on, a member deleting their account could close the owner's paid plan, and an owner of several workspaces could keep being charged for the others. Kevin chose to release with billing off and fix it before billing is switched on ([release record](PRICING_REALTOR_BILLING_RELEASE_2026-09-30.md), Follow-ups). It had no effect in production: billing is off, so no billing row exists.

**Status:** pull request open; not released. The release is a separate task (WF-06). It is code-only, with no migration.

| Item | Value |
| --- | --- |
| Branch | `fix/billing-account-deletion-20260930` |
| Base | `origin/main` at `5c02e8d` |
| Decision | Kevin, 2026-09-30: release now, fix before billing. |
| Workflow | WF-01, then WF-04 with WF-08; skills `jitm-feature`, `jitm-standards-update` |

## What changed

- `closeBillingForDeletion` (`src/lib/billing-deletion.ts`) takes the person's user id and deletes the Stripe customer of every workspace they own. A workspace they only belong to is never touched. A customer Stripe already deleted is skipped, so a retry after a partial failure closes the rest.
- The deletion action (`src/lib/account-deletion-actions.ts`) passes the user id, not the session's workspace.
- The last-active-staff-owner refusal now runs before any billing is closed (`assertNotLastActiveOwner` in `src/lib/account-deletion.ts`). Before, that refusal came from inside the deletion transaction, after the Stripe customer was already gone, so a blocked deletion could still end the plan. The transaction keeps the same check under the staff lock.
- JITM-11 §2.57 (1.1.1) and `docs/BILLING.md` say which workspaces are closed.

## Verification

- `tests/stripe-billing.integration.test.ts`: a member of a paid workspace closes nothing; an owner of two paid workspaces closes both; a retry skips the customer already deleted. The new test fails against the code on `origin/main`.
- `tests/account-deletion-action.test.ts`: billing is closed by user id, and the last-owner refusal comes before billing is touched.
- Static checks, typecheck and `standards:check` pass. Full Vitest: 2,154 passed, 1 failed (`journey-scheduling.integration.test.ts` timed out at 5 s under load and passes alone; untouched code).

## NOT RUN

- Browser tests: the deletion form and its copy are unchanged.
- A real Stripe test-mode deletion: it needs Kevin's test keys.
