# Customer journey, scheduling, and incoming leads

The September 5 request extends the interface audit: businesses need configurable stages (for example Lead → Prospect → Client → Retention), automatic transitions, calendar/time-block support, and convenient lead intake across forms, email, messages, calls, social, CRM systems, CSV, shared contacts, RFID, and vCard/QR. The user prefers compatibility across providers.

## Implementation direction

1. Add configurable journey stages and event rules. Advance on recorded business events, with optional elapsed-time rules. Assign a chosen follow-up plan on entry and stop only the plan managed by the previous stage. Keep an explanation in the contact timeline, tenant isolation, idempotency, and a manual override. Existing contacts must not be silently reclassified as leads.
2. Add a scheduling view for meetings and protected time blocks, linked to contacts. Enforce conflicts and timezone handling. Use iCalendar import/export/subscription for broad Google, Outlook, Apple, and other calendar compatibility; describe the direction and freshness of sync accurately.
3. Add a connection hub: a hosted lead form and authenticated, idempotent intake endpoints with an easy connection recipe for external services. Normalize and deduplicate contact methods, hold ambiguous matches for review, and preserve source attribution. Generic connector support must not be presented as an already configured native provider connection. Retain CSV/vCard/device-contact import.
4. Validate transitions, retries, conflicts, tenant boundaries, incoming contact deduplication, browser flows, accessibility, and production build. Deploy only to the existing authorized Netlify test site.

No real invitations, customer messages, support messages, or campaigns are sent during implementation. Fixture mutations use the isolated local database. No images are viewed. Earlier notification, sales-plan, and design-refresh work stays intact.

## Follow-up preparation and browser continuation

1. Distinguish saved changes awaiting preparation from an empty schedule on Today and contact details. Read preparation before follow-ups, scope status to the authorized business/contact, and keep error details private.
2. Use bounded polling and an input-preserving route refresh, with clear delay, session-expiry, manual-check and retry controls. Keep owner drafts while updating untouched prepared messages.
3. Preserve failed receipts during guarded, deduplicated retries. Retain successful preparation evidence as long as failed receipts, so routine cleanup cannot revive repaired failures.
4. Qualify preparation, customer journeys and onboarding in Chromium, Firefox and WebKit using isolated fixtures, DOM, keyboard, geometry and axe. Run regression/static/type/build checks, then publish to the authorized test site and verify data preservation.

Unattended worker cadence, actual provider account connections, physical device handoffs and visual/owner-usability qualification remain separate quality gates.
