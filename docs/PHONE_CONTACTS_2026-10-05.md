# Adding people from a phone — 2026-10-05

Kevin asked for "an easy way for the user to be able to add a contact that is saved in their phone into the webapp", and chose options 1, 2 and 3 of the recommendation (D32 in `docs/standards-audit-2026-09-28/OWNER_DECISIONS.md`). Base: `9b3f949`.

## What the platforms allow

- **No continuous sync from a web page.** No browser lets a website read or watch the address book in the background. Sync needs an account connection (Google Contacts) or an App Store app. Both are deferred until beta users ask for them (D32).
- **Android.** Chrome on Android has the Contact Picker. The person ticks contacts in the phone's own list, and only those are returned. The app has used it since the Quick Add work; this change makes it easy to find.
- **iPhone.** Safari ships the Contact Picker switched off behind a developer setting, through iOS 26.5. Websites can't appear in the iPhone share sheet. The Contacts app can share a contact card (a vCard) to a shortcut or save it to Files.

## What was built

| Part | Where | Behavior |
|---|---|---|
| 1. Picker on Add a contact | `src/components/DeviceContactQuickAdd.tsx`, `src/app/(app)/contacts/new/page.tsx` | Android Chrome: "Add from phone contacts" opens the picker directly. iPhone: "Add from iPhone contacts" opens Add from your phone. Computers: nothing on Add a contact. It is hidden when Add a contact was opened from a Journey Mix. The Contacts tools sheet links to Add from your phone where the picker is unavailable. |
| Add from your phone | `src/app/(app)/contacts/from-phone/page.tsx` | Phones see only their own steps, read from the user agent. iPads and computers see both. Import contacts links here. |
| 2. iPhone shortcut | `src/app/api/webhooks/phone-contacts/route.ts`, `src/lib/contact-share-keys.ts`, `src/lib/contact-share-key-actions.ts`, `src/components/ContactShareKeyPanel.tsx`, `prisma/contact-share-keys.prisma` | The owner makes a personal key, shown once with Copy. The shortcut POSTs the shared vCard with `X-JITM-Key`, and the answer is one plain sentence that the shortcut shows as its notification. A new key replaces the old one; Turn off removes it. |
| 3. Saved card | same page | Share Contact → Save to Files → Import contacts (the existing vCard import with its review). For several people: touch and hold a list in Contacts → Export. |

### How a shared card is added

- The shortcut endpoint reads each card (`parseVcardDeviceContacts`) into the picker's shape: name, company, emails, phones and addresses. Notes, birthdays and other dates, and photos are not taken, because nothing reviews them before saving. A birthday could otherwise start a date-triggered Mix.
- It then runs the picker's `quickAddDeviceContacts`:
  - no match: the person is created;
  - one exact email or phone match: the card is merged without overwriting primary values;
  - an ambiguous or fuzzy match: nothing changes, and the answer says to check Contacts.
- The audit source is `contacts.phone-share`.
- A share is limited to 50 cards and a 2 MB body. A repeat of the same body within 10 minutes (a double tap or a retry) returns the first answer through the import idempotency keys.
- It is owner-only, like Quick Add and import (`commitContactImportBatch` checks the owner).

### Key security

- **Format:** 32 random bytes, base64url, the same shape as a lead connection key. Only the SHA-256 hash is stored (`ContactShareKey.tokenHash`, unique). There is one key per owner per workspace.
- **When a key works:** only while its user owns the workspace, is not suspended, and has a verified email where sign-in requires one.
- **Rate limits:** 120 requests per hour per client address, checked before the key lookup, and 120 per hour per key.
- **Path:** the endpoint lives under `/api/webhooks/`, the only path the origin check exempts, because Shortcuts sends no browser Origin (JITM-11 §2.38). It uses no cookies and never logs the body.
- **Ending a key:** Make a new key or Turn off ends the old key at once. Account or workspace deletion cascades.

### Configuration

`IPHONE_CONTACTS_SHORTCUT_URL` is optional and goes on the web service only. Its value must be `https://www.icloud.com/shortcuts/<id>`, and readiness refuses any other value.

Until it is set, iPhone users see only the saved-card steps. `/contacts/from-phone?setup=shortcut` shows the key steps without the link, for building the shortcut.

Migration `20261005120000_contact_share_keys` is additive (one new table); the previous release never reads it.

## Building the shortcut (Kevin, once, on an iPhone)

Apple installs only shortcuts that were shared from an iPhone or Mac, so this has to be made in the Shortcuts app. It takes about five minutes, after the release is live.

1. **Get a key.** On jumpinthemix.com, open `https://jumpinthemix.com/contacts/from-phone?setup=shortcut`, tap Make my key, then Copy key.
2. **Create the shortcut.** In the Shortcuts app, tap **+**. Rename it exactly **Add to Jump in the Mix**; the page tells people to tap that name.
3. **Add a Text action.** Add **Text** as the first action and paste your key into it. Step 8 turns this into the question new users answer.
4. **Accept shared contacts.** Tap the shortcut's settings (ⓘ) and turn on **Show in Share Sheet**.
   - At the top, set it to receive **Contacts** and **Files** only, from the Share Sheet.
   - If there's no input, choose **Ask For** → **Contacts**, if offered; otherwise **Stop and Respond**.
5. **Handle each item.** Add **Repeat with Each** over **Shortcut Input**.
6. **Send the card.** Inside the repeat, add **Get Contents of URL**:
   - URL: `https://jumpinthemix.com/api/webhooks/phone-contacts`
   - Method: **POST**
   - Headers: add `X-JITM-Key`, with the value set to the **Text** variable from step 3.
   - Request Body: **File**, set to **Repeat Item**.
7. **Show the answer.** After **End Repeat**, add **Show Notification** with **Repeat Results**.
8. **Ask new users for their key.** In the shortcut's details, open **Setup** → **Add New Question**, choose the Text action's text, and enter the question: "Paste your key from Jump in the Mix."
9. **Test it.**
   - In Contacts, open a test person, tap **Share Contact**, then **Add to Jump in the Mix**. The notification should read "Added <name> to Jump in the Mix."
   - Then export a small list (touch and hold a list → Export → Add to Jump in the Mix).
   - If the notification says "Share a contact from Contacts to add it.", the shortcut didn't send the card as a file. Tell the agent; the endpoint or the recipe needs a change.
10. **Share it.**
    - Back on the website, tap **Turn off the shortcut**, so the key inside your copy stops working before you share it.
    - In Shortcuts, touch and hold the shortcut → Share → **Copy iCloud Link**.
    - Give the link to the agent, who sets `IPHONE_CONTACTS_SHORTCUT_URL` on the web service. Get the shortcut then appears for everyone.

## Verification

- **VERIFIED:**
  - Typecheck and `validate:static`.
  - `standards:check`.
  - Unit tests: `tests/phone-contact-share.test.ts`, plus the existing import, picker and env suites.
  - Database tests: `tests/phone-contact-share.integration.test.ts` and the Quick Add integration suite. They run on a fresh local database with every migration applied. They cover adding, merging, the double-tap repeat, unknown, replaced, removed, non-owner and suspended keys, empty bodies and more than 50 cards.
  - The migration matches the schema; the only diff is the known hand-written search indexes.
  - Production build.
  - `e2e/phone-contacts.spec.ts` on the Android, iPhone and desktop profiles.
  - Screenshots at 390, 412 and 1440 wide in both themes, in `.artifacts/phone-contacts-20261005/` (local).
- **INFERRED:** the iPhone Contacts and Shortcuts behavior (share sheet input, the vCard file body, import questions). It comes from Apple's documentation and was not run on a device.
- **NOT RUN:**
  - A real iPhone: the shortcut, Share Contact, Save to Files, list export.
  - A real Android phone: the picker; `docs/ANDROID_CONTACT_PICKER_QUALIFICATION.md` is still blocked.
  - The full browser suite.

Browser tests block the service worker. The worker re-requests pages without the emulated phone's user agent, so the server would otherwise see a desktop browser; real phones send their own user agent.
