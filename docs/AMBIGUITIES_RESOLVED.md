# Superseded Product Decisions

This file is retained so older links do not break. The active implementation decisions now live in:

- [`CANONICAL_PRODUCT_DECISIONS.md`](CANONICAL_PRODUCT_DECISIONS.md)
- the approved Master PRD

The earlier independent-MVP decisions in this file predated the forensic Base44 review and are no longer authoritative where they conflict with those documents.

Key superseding decisions include:

- Customer-facing reusable communication content is called **Jumps**, while the scheduled execution area is **Jump**.
- Internal `StepTemplate`, `StepVersion`, and `MixStep` models remain compatibility boundaries rather than being renamed repeatedly.
- The first authenticated destination is the Jump action queue.
- The primary task states are Pending, Done, and Skipped; composer/copy actions are not completion states.
- Jump generation is automatic and reconciles obsolete pending work; there is no user-facing Sync button.
- Plan limits are defined centrally in `src/lib/plans.ts` and the Master PRD.
- Workspace IDs, not email addresses, are the authorization boundary.
- Production integrations must be live and verified or clearly unavailable; simulated integrations are prohibited.
