# Device Contact Picker and Quick Add

Quick Add is the low-friction Contact acquisition lane for a person the user has just met or already has in their mobile address book.

## User flow

The Contacts **+ Add** menu now exposes four complementary lanes:

1. **New Contact** — the ordinary compact manual form.
2. **Pick from device** — the native Contact Picker when the browser exposes it.
3. **Import CSV / VCF** — the reviewed batch-import workflow.
4. **Google Contacts** — the ongoing one-way cloud synchronization workflow.

The browser checks capability after hydration. On a supported secure-context browser, selecting **Pick from device** opens the operating-system address book and lets the user choose one or more Contacts. The browser grants only the fields the user explicitly selects.

When the API is unavailable, the same acquisition slot becomes **Quick Add** and routes directly to the manual Contact form. The unsupported browser never sees a broken or inert native-picker button.

## Supported device data

Quick Add requests only:

- Display name.
- Email addresses.
- Telephone numbers.
- Structured postal addresses.

It does not request or store device contact photos. The server accepts no browser-supplied workspace or user identity.

The selection boundary is 50 Contacts. Larger migrations belong in CSV / VCF import, where mapping and side-by-side duplicate review are available.

## Normalization and matching

The device path reuses the established Contact import services:

- Email is trimmed and normalized case-insensitively.
- Phone values are normalized through the existing 7–15 digit boundary.
- Repeated emails, phones, and addresses in one selected Contact are deduplicated.
- The first usable email, phone, and address is primary.
- Exact workspace-scoped email or phone matches merge without overwriting existing primary values.
- Ambiguous exact matches and conservative fuzzy matches are left unchanged.
- A summary tells the user how many Contacts were created, merged, held for review, or failed.

No fuzzy match is silently merged.

## Plan and security boundary

Before any write, the server:

- Requires an authenticated workspace session.
- Rejects view-only administrator support sessions.
- Applies persistent workspace/user/IP throttling.
- Parses a strict JSON schema.
- Calculates how many selected records would create new Contacts.
- Rejects the complete selection before writing when it would exceed Contact capacity.
- Reuses row-level idempotency so a retried request cannot create duplicate Contacts.
- Queues normal Jump reconciliation for every created or merged Contact.
- Writes a workspace audit summary for the device-picker operation.

## Voice-to-notes fallback

The manual **Add a contact** form exposes a Dictate action beside Public Notes when the browser supports the Web Speech recognition surface.

Voice transcription is initiated only after a user gesture. The recognized text is inserted into the local form and is not saved until the user submits the Contact. Unsupported browsers simply omit the control and retain the normal textarea.

Private Notes intentionally do not expose browser dictation because they may contain sensitive call context.

## Browser qualification

Production qualification should cover:

- Android Chrome with a populated address book.
- Selecting one Contact and multiple Contacts.
- User cancellation and permission denial.
- Exact email and phone merges.
- Ambiguous duplicate preservation.
- Contact-plan capacity rejection before partial writes.
- Unsupported iOS/Safari and desktop fallback behavior.
- Secure-context enforcement.
- Voice dictation permission denial and successful transcript insertion.

The Contact Picker is a progressive enhancement. Manual entry, CSV / VCF import, and Google Contacts remain available independently.
