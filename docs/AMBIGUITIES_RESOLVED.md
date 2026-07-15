# Ambiguities Resolved

These decisions are intentionally explicit because unresolved terminology and behavior would otherwise create inconsistent code and confusing user experiences.

## Outreach delivery

**Decision:** The MVP opens native SMS, email, phone, and WhatsApp applications. It does not automatically send contact outreach.

**Reason:** Automated sending introduces sender registration, consent, opt-out, delivery-state, template approval, and per-message cost requirements. Native actions provide value while reducing launch risk.

## Important Date versus Jump Date

**Decision:** The UI says **Important Date**. The internal model remains `JumpDate`.

**Reason:** “Jump Date” is branded but unclear to a new user. “Important Date” explains the field immediately.

## Date Type

**Decision:** Keep the model name `DateType`, but ask the user, **“What is this date for?”**

## Recurrence

**Decision:** Recurrence belongs to an Important Date, not a Mix.

A Mix is a sequence. The trigger may recur monthly or yearly, causing the sequence to repeat around each occurrence.

## Mix trigger modes

Only three modes exist:

1. `DATE_TRIGGERED`
2. `MANUAL_START`
3. `BROADCAST`

No other trigger mode should be added without defining generation and reconciliation behavior.

## Group assignments

**Decision:** Assigning a Group creates a snapshot of current Contacts.

Future members are not automatically added. A dynamic mode exists in the data model for later use but is not exposed by default.

## Public Notes

**Decision:** Public Notes are reference data and are excluded from built-in and AI-generated template assumptions.

Users are not required to write notes in a prescribed format.

## Custom fields

`My Custom 1–3` are workspace/user values. They are not Contact fields. Structured Contact custom fields have separate definitions and values.

## Address

`{{Address}}` always means the Contact’s address. It must never represent a listing, venue, project, event, or service address.

## Contact sync direction

**Decision:** Google and Microsoft are source-to-app imports with incremental refresh.

The MVP does not write edited records back to providers. Two-way sync requires explicit field ownership and conflict-resolution rules.

## Duplicate matching

Order of authority:

1. Provider external ID
2. Exact normalized email
3. Exact normalized phone
4. Manual review for name/company similarity

The application does not silently merge Contacts based only on a similar name.

## AI writes

**Decision:** AI creates a draft. Multi-entity changes require confirmation.

## Teams

**Decision:** The schema uses workspaces and memberships from the beginning, but MVP UI exposes a single owner. Team invitations and seat billing are deferred.

## Drops

**Decision:** “Drop” is excluded from the MVP because it overlaps with Step, Jump, and Broadcast.

A future Drop may be defined as a one-time outreach action not attached to a recurring Mix, but it should not be added until its behavior is distinct.

## Sent versus delivered

For native deep links, `SENT` is user-confirmed. It is not provider-confirmed delivery. Future automated providers should add separate delivery states.

## Plan limits

Only non-archived Contacts count toward contact limits. A downgrade never deletes data; creation is restricted until usage is brought within the plan.

## Monthly dates on the 29th–31st

The occurrence moves to the final valid day in shorter months.

## Annual February 29 dates

In non-leap years, the occurrence moves to February 28.

## Referrals

The MVP displays one primary referrer through `referredByContactId`. The architecture should later evolve to a full referral-event history when reporting requirements are defined.

## WhatsApp roles

The WhatsApp **assistant channel** is for a user controlling their Jump in the Mix account. It is separate from outreach sent to that user’s Contacts.

## Third-party sales frameworks

The UI uses neutral names such as **Question-Led Discovery** unless permission to market a third-party trademark or imply endorsement has been confirmed.
