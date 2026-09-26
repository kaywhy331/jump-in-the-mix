# Full application audit — 2026-09-24

Nine read-only reviews of the live code (commit d70ec54 / e26fdd4 on https://jumpinthemix.com), each with file-level evidence, failure scenarios, proposed fixes and tests. The consolidated ranking, the two-model deliberation and the release decision are in [FULL_AUDIT_2026-09-24.md](../FULL_AUDIT_2026-09-24.md).

| Report | Scope |
| --- | --- |
| [funnel-auth-onboarding.md](funnel-auth-onboarding.md) | Public pages, registration, sign-in, invitations, verification, onboarding |
| [today-followups-calendar.md](today-followups-calendar.md) | Today queue, review, drafts, outcomes, automatic delivery, Quick Add, Calendar, push |
| [contacts.md](contacts.md) | Contacts directory, profile, import, duplicates, merge, archive, referrals |
| [mixes-journey-marketplace.md](mixes-journey-marketplace.md) | Mix editor, Mega-Mixes, export/import, Journey numbering and rules, Marketplace |
| [security-privacy.md](security-privacy.md) | Tenant isolation, sessions, CSRF, rate limits, staff control plane, exports, docs vs code |
| [design-a11y-responsive.md](design-a11y-responsive.md) | Fidelity to the design export, contrast, touch targets, keyboard, reflow |
| [ops-reliability-performance.md](ops-reliability-performance.md) | Worker, jobs, health, recovery, email, queries and indexes, Render configuration |
| [account-settings-support-admin.md](account-settings-support-admin.md) | Account, preferences, settings effectiveness, support, staff workflows |
| [tests-quality-process.md](tests-quality-process.md) | Test inventory, stale specs, CI and branch state, release process, docs drift |
| [FINDINGS_TABLE.md](FINDINGS_TABLE.md) | All 125 findings ranked by severity |

Method: static code review of the worktree plus computed checks (contrast ratios, DST arithmetic, numbering probes). No file in the repository was changed by the reviewers. Claims are marked VERIFIED (code path read end to end) or SUSPECTED.
