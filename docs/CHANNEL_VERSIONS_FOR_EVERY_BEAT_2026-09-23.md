# Text, email and call versions for every Beat — September 23, 2026

**Owner request:** every Beat should offer an alternative text, email or call version, with bulleted talking points for calls, so owners can quickly switch to the method a person prefers. The default gets a **Recommended** tag. With no email saved, only text and call are recommended; with no phone number, only email is. The other options stay visible but greyed out.

## Behavior

- **Every Beat offers all three versions.** Wording the owner writes (Mix editor → "Text, email and call versions") always wins. A version left blank is generated from the Beat's own wording (`src/lib/variant-generation.ts`). Generation is deterministic and runs locally; merge fields are kept as fields.
  - **Email from a text:** the subject is the message's first sentence (without the greeting). The body is laid out as greeting, message, then `{{Email Signature}}`.
  - **Text from an email:** the email body, compacted, with `{{SMS Signature}}`.
  - **Call from a text or email:** bulleted talking points. It opens with "Say hello and check it’s a good time to talk", then has one bullet per sentence, and closes with "Agree the next step before you hang up".
  - **Text or email from a call:** a short invitation to talk. Call notes are private preparation, so they are never quoted, and private-note fields are always removed.
- **Recommended** (`recommendedVariant`) picks, in order, the person's stated preferred method, then the owner's communication preference, then the Beat's own channel. It only picks among methods the person can receive, so a contact with no email never gets an email recommendation, and a contact with no phone gets only email. When the Beat would send automatically, its own channel stays recommended, because that is what automatic delivery uses unless the owner switches.
- **Today** opens on the recommended version unless the owner already chose one for that follow-up.
  - All three options are always visible, and the recommended one carries a **Recommended** tag.
  - An unavailable option is greyed out, with the reason in plain text (for example "Email: needs an email address"). An "Add …" link returns to the same follow-up afterwards.
  - Switching still never sends anything, never creates another follow-up, and keeps a separate draft for each version.
- **Mix editor.** Each Beat's "Text, email and call versions" section shows the generated wording as greyed placeholder text. "Edit the generated …" copies it into the field so the owner can adjust it.

## Implementation notes

- **No schema change, migration or data backfill.** `variantsOfSnapshot` completes a follow-up's authored variants with generated ones from the snapshot's primary wording and channel. As a result, Today, drafts (`jump-drafts`), send attempts (`jump-attempts`) and version selection (`jump-variants`) all accept generated versions without extra wiring.
- **Existing and future follow-ups** gain all three versions immediately. A version is stored only when the owner writes one in the Mix editor or saves a draft on Today.
- **Tests.**
  - The Slice 3 rule "authored alternatives only" was deliberately replaced. The unit and integration expectations that asserted it now assert the new rule.
  - New unit tests cover generation, private-note exclusion, owner-written precedence and every recommendation case.
- **Checks.**
  - Typecheck is clean.
  - The variant, draft, attempt and delivery-hold suites pass.
  - Browser checks in an isolated production build covered four cases:
    - A contact with phone and email who prefers email: Email is Recommended and open, and Call shows the talking points.
    - A contact with no email: Email is greyed out with the reason and an Add link.
    - A contact with no phone: only Email is available, and it is Recommended.
    - The Mix editor shows the generated placeholders and can edit them.
  - The phone layout at 390px has no horizontal scroll.
  - The final email layout and subject capitalization were fixed after the browser pass and are covered by exact unit tests.
