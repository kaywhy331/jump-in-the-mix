# Product Requirements — Jump in the Mix MVP

## Goal

Jump in the Mix helps entrepreneurs and relationship-driven businesses prevent leads, clients, referrals, renewals, and important personal connections from being forgotten.

A user should reach the first useful outcome in about five minutes:

1. Create an account.
2. Add or import contacts.
3. Record an Important Date or explain what happened through Quick Capture.
4. Select or generate a Mix.
5. See the first actionable Jump.

## Core loop

```text
Business interaction
      ↓
Contact captured or matched
      ↓
Important Date recorded
      ↓
Mix assigned
      ↓
Jumps generated
      ↓
User completes outreach
```

## Product principles

1. **Adapt to the user.** Information may arrive through manual entry, CSV, Google, Microsoft, website forms, WhatsApp, or AI capture.
2. **Capture first, organize second.** A Contact may begin with only a name, email, or phone.
3. **Actions over database administration.** The app should answer who needs attention, why, what to say, and what to do next.
4. **Progressive disclosure.** New users see goals and plain language; advanced controls remain available without blocking setup.
5. **Human confirmation.** AI and integrations may propose changes, but uncertain or multi-record actions require confirmation.
6. **Historical integrity.** Completed Jumps preserve the exact message and Step version that existed when the action was due.

## Primary users

- Entrepreneurs
- Consultants and coaches
- Real-estate professionals
- Insurance and financial-service professionals
- Sales representatives
- Creative and event-service providers
- Contractors and local-service businesses
- Small agencies
- Small-to-medium relationship-driven businesses

## Main application navigation

```text
Home
Jumps
Contacts
Mixes
Library
Settings
```

A persistent Add action provides:

- Add a Contact
- Record an Important Date
- Quick Capture
- Create a Mix

## Functional modules

### Authentication and workspaces

- Email/password registration and login
- Secure cookie sessions
- One workspace automatically created at registration
- Owner role in the MVP
- Workspace data isolation
- Platform administrator flag for operational support

### Onboarding

- Ask the user’s primary goal
- Capture business, industry, product/service, and timezone
- Offer contact import
- Capture SMS and email signatures
- Recommend the first Mix
- Maintain a dismissible setup checklist

### Contacts

- Add, edit, archive, search, and export
- Multiple emails, phones, and addresses in the data model
- Groups and bulk assignment
- Referral relationships
- Public Notes stored as reference data, never assumed to follow a template format
- CSV import with mapping preview and duplicate-safe upserts
- Google and Microsoft imports

### Important Dates

- System types such as Birthday, Follow-up, Renewal, Referral, Anniversary, Appointment, and Event
- Workspace-specific custom types
- One-time, monthly, and yearly recurrence
- Birthday month/day without requiring a year
- Source and external identifier fields
- Automatic Jump reconciliation after changes

### Steps

- Channels: Email, SMS, Phone Call, Voicemail, WhatsApp
- Immutable versions
- Approved dynamic placeholders
- Validation that blocks unsupported placeholders and `{{Public Notes}}` in automated templates
- Optional SMS opt-out text

### Mixes

- Date-triggered
- Manual-start
- Broadcast
- Draft, Active, Paused, and Archived states
- Visual day-offset timeline
- Snapshot Contact/Group assignment
- Manual builder
- Shared template import
- Plus/Pro AI Mix Wizard

### AI Mix Wizard

The Wizard starts with a structured preflight questionnaire:

- Objective
- Framework
- Trigger
- Audience
- Start date or Important Date type
- Channels
- Duration
- Number of touches
- Tone
- Product placeholder
- SMS opt-out preference

The application first creates a deterministic structure, then optionally asks an AI provider to refine the copy. The user previews and edits every Step before publishing.

### Jumps

- Today, Upcoming, Past, and Completed
- Copy message
- Open SMS
- Open email
- Open WhatsApp
- Start phone call
- Mark Copied, Sent, Done, or Skipped
- Store template and rendered snapshots
- Generate within a rolling horizon
- Prevent duplicates with a deterministic uniqueness key

### Quick Capture

Natural-language examples:

```text
Sarah Chen at BrightPath was referred by John. Follow up Friday about consulting.

Change Maria's phone number to 555-123-4567.

Create a renewal Mix with email 30 days before, call 14 days before, and SMS seven days before.
```

The system returns a structured confirmation card before applying database changes.

### Shared Mix Library

Primary categories:

- Business
- Sales
- Client Success
- Events
- Personal
- Networking
- General

Industry is a secondary filter. Shared Mix data is sanitized so it never contains private Contacts, signatures, notes, filled placeholders, or internal IDs.

### Billing

- Free application state
- Plus monthly and annual
- Pro monthly and annual
- Stripe Checkout for a first subscription
- Stripe Customer Portal for existing subscriber changes
- Webhook and success-page reconciliation
- Server-side entitlements
- Preserve records after downgrade

### Administration

- User and workspace search
- Plan and usage visibility
- Integration health
- Failed job visibility
- Shared Mix moderation
- Audit history
- Plan-limit configuration in code for MVP

## Key UX flows

### First-time user

```text
Register
  → Goal
  → Business details
  → Add/import contacts
  → Signatures
  → Recommended Mix
  → Today's Jumps
```

### Referral capture

```text
Add new Contact
  → Select referrer
  → Choose first follow-up date
  → Optionally create thank-you date for referrer
  → Confirm
```

### AI Mix creation

```text
Preflight
  → Generate
  → Validate placeholders and SMS length
  → Editable timeline
  → Publish
  → Assign audience
  → Generate Jumps
```

### Website inquiry

```text
External form
  → Signed workspace webhook
  → Strict payload validation
  → Idempotent Contact upsert
  → Important Date creation
  → Jump reconciliation
```

### WhatsApp assistant

```text
Create short-lived link code in app
  → Send code to dedicated WhatsApp number
  → Verify link
  → Send natural-language command
  → Receive structured summary
  → Reply CONFIRM
```

## North-star metric

**Completed meaningful Jumps per active workspace per week.**

## Activation definition

A workspace is activated when it has:

- At least five Contacts
- At least one Important Date
- At least one active Mix
- At least one completed Jump

## MVP acceptance criteria

- Workspace isolation applies to every user-owned query.
- A new user can reach the first Jump without support.
- No duplicate Jump is generated for the same Contact, trigger, Mix Step, and scheduled time.
- Date changes preserve completed history and replace future pending actions.
- AI drafts contain only approved placeholders.
- Paid entitlements are enforced server-side.
- Stripe plan changes do not create duplicate subscriptions.
- Google and Microsoft sync can resume incrementally.
- Webhooks are verified and idempotent.
- Core workflows function at mobile width.
