# Canonical Product Decisions

**Status:** Active implementation contract  
**Effective:** July 15, 2026  
**Authority:** the approved Master PRD

This file freezes the decisions required to extend the independent application without repeating the entity-renaming and routing regressions recorded in the Base44 history.

## 1. Product language

Customer-facing language is:

- **Jump** — the action queue and one scheduled relationship action.
- **Jumps** — reusable SMS, email, phone-call, or voicemail content.
- **Mix** — an ordered sequence of reusable Jumps.
- **Jump Date Type** — a trigger classification such as Birthday or Renewal.
- **Jump Date** — a Contact-specific trigger date.
- **Mix Template** — a reusable complete Mix and its Jumps.
- **My Info** — personalization values and signatures.
- **My Account** — billing, plan, integrations, referrals, security, and support.

Do not introduce Campaign, Connect, Connected, or message-template terminology in customer-facing copy.

## 2. Stable internal models

Presentation terminology does not justify another broad physical database rename. The current technical models remain valid compatibility boundaries:

| Internal model | Presentation model |
|---|---|
| `StepTemplate` / `StepVersion` | reusable Jump definition |
| `MixStep` | Jump #n within a Mix |
| `Jump` | scheduled Jump instance |
| `JumpDate` | Jump Date |
| `DateType` | Jump Date Type |

New services and UI should expose canonical DTO names while migrations are introduced deliberately and with rollback notes.

## 3. Navigation and routing

The final primary information architecture is:

1. Jump
2. Contacts
3. Settings
4. AI Assistant
5. Help

Mixes, reusable Jumps, Templates, and My Info live under Settings. My Account is opened from the account menu. Legacy routes remain valid redirects until bookmarks and internal links have migrated.

The first authenticated destination is the Jump action queue.

## 4. Jump task states

Primary user-visible states are:

- Pending
- Done
- Skipped

Legacy `COPIED` and `SENT` records remain readable during migration. Copying, opening a composer, or starting a call is an action event, not completion of the task. Completed and skipped rendered snapshots are immutable.

## 5. Automatic reconciliation

A user never presses a Sync button. Event-driven jobs and a scheduled repair job reconcile the desired future schedule against pending database records.

Reconciliation must:

- create missing Jumps;
- update mutable pending content;
- reactivate a previously canceled occurrence when a paused Mix resumes;
- cancel obsolete pending occurrences;
- preserve Done and Skipped history;
- use a database uniqueness key to prevent concurrent duplicates.

## 6. Time and dates

A schedule is defined by:

- a logical local trigger date;
- a named IANA timezone;
- a local send time;
- a derived UTC execution timestamp.

Birthdays and other logical dates must not move because of UTC conversion. February 29 becomes February 28 in non-leap years. Monthly dates on the 29th–31st become the final valid day of shorter months.

## 7. Plan limits

| Feature | Free | Plus | Pro |
|---|---:|---:|---:|
| Contacts | 100 | 1,000 | 5,000 |
| Contact Groups | 3 | 10 | Unlimited |
| Custom Jump Date Types | 3 | 10 | Unlimited |
| Active Mixes | 3 | 10 | Unlimited |
| Shared Community Mixes | 0 | 3 | 10 |
| AI Mix Wizard | No | Yes | Yes |
| Google Contacts | No | Yes | Yes |
| Ringless voicemail | No | No | 50/month |

A downgrade never deletes records. Excess configurable records become inactive after the user selects which remain active.

## 8. Multi-tenancy

`workspaceId` is the authorization boundary. It is derived from the authenticated session and is never trusted from browser input. Email addresses may be metadata but never establish ownership. Background jobs, imports, AI writes, template copies, webhooks, and administrative tools must carry and verify workspace context.

## 9. Delivery policy

The launch product opens native SMS, email, phone, and supported messaging composers. It does not claim carrier-confirmed delivery and does not automatically send customer outreach. Automated delivery providers require separate consent, compliance, sender-registration, delivery-state, and cost controls.

## 10. Deferred launch features

Unless explicitly promoted in the Master PRD, the following remain post-core work:

- automated outbound messaging;
- ringless voicemail delivery;
- live AI voice calls;
- two-way contact synchronization;
- team invitations and seat billing;
- paid template marketplace;
- full analytics warehouse.
