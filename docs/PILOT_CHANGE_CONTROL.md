# Private pilot change control

Broad feature development is frozen during the private pilot.

## Allowed changes

- focused P0 hotfixes
- focused P1 workflow fixes
- frequently observed P2 friction fixes
- small accessibility fixes
- documentation corrections
- backup and operational corrections

## Deferred changes

- billing, subscriptions, or pricing tiers
- teams, invitations, organizations, or multiple workspaces
- provider integrations
- speculative AI
- referral rewards
- large visual redesigns
- unrelated architectural rewrites

## Distribution gate

Every distributed pilot update must:

1. Branch from current `main`.
2. Limit the diff to the observed defect or operational correction.
3. Include a regression test where practical.
4. Preserve migration compatibility and existing data.
5. Pass exact-head CI, Docker, and Security workflows.
6. Pass relevant local and physical-device regression checks.
7. Create and verify an encrypted pre-upgrade backup.
8. Receive a new immutable RC tag.
9. Include upgrade, rollback, and backup notes.

Never move an existing RC tag. A P0 or P1 found on `v0.1.0-rc.2` requires a focused PR and a new candidate such as `v0.1.0-rc.3` before affected participants continue.
