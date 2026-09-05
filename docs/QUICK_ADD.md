# Quick Add and device contacts

Quick Add is the global capture surface for a name, note, and next follow-up. It accepts phrases such as “Text Maria Friday about the estimate,” previews the interpretation as the user types, and carries recognized name, phone, email, date, and reason into the contact form.

Supported dates include today, tomorrow, next week, bare or abbreviated weekdays, “in N days/weeks,” month names, and numeric month/day values. The browser speech API adds an optional user-initiated dictation button; unsupported browsers simply omit it.

The fallback choices are intentionally limited to:

- Add a person.
- Log what happened.

Contacts also supports the browser Contact Picker where a secure-context browser exposes it, plus reviewed CSV/VCF import. The picker requests only name, email, telephone, and postal address. It never requests photos and accepts at most 50 selected people per operation.

All acquisition paths normalize email and phone identities, merge only unambiguous exact matches, preserve existing primary methods, enforce the authenticated workspace boundary, and use idempotency for retry safety. Ambiguous matches are held for review rather than silently merged.

Physical qualification must cover Android Contact Picker permission, cancellation, single and multiple selection, exact-match merge, ambiguous-match preservation, and the iPhone/manual fallback. See [Android Contact Picker qualification](ANDROID_CONTACT_PICKER_QUALIFICATION.md).
