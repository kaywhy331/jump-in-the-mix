# Android Contact Picker Qualification

**Status: blocked pending a physical supported Android device.** Repository boundary tests and Playwright API injection are not a substitute for this manual qualification.

## Supported test environment

- A currently supported physical Android phone or tablet with security updates applied.
- Current stable Chrome for Android, served from HTTPS (or the browser's trusted localhost exception).
- A test account and synthetic address-book entries only. Do not use customer or personal Contacts.
- Confirm `navigator.contacts`, `navigator.contacts.select`, and `navigator.contacts.getProperties` are present. Record device model, Android version, browser version, test URL, tester, and date.

## Privacy disclosure

Before opening the picker, verify the UI explains that selection is user initiated, only selected fields are returned, photos are not requested, data is written to the signed-in workspace, and exact email/phone matches may merge with an existing Contact. The application must not enumerate the address book in the background.

## Manual matrix

For each case, capture pass/fail, observed result, and a redacted screenshot where useful:

1. Permission flow: tap **Pick from device**, verify the native picker identifies the requesting origin, and grant only the requested access.
2. One Contact: select one synthetic Contact with name, email, phone, and address; verify preview/result and one correct database write.
3. Multiple Contacts: if the device/browser offers multi-select, select two and verify both. If it does not, record “not supported by this browser/device,” not a product failure.
4. Name only: verify a Contact is created with no fabricated email or phone.
5. Phone only: verify display fallback and normalized phone storage.
6. Email only: verify display fallback and lower-cased exact-match behavior.
7. Canceled picker: close without selection; verify no write and a non-alarming canceled state.
8. Denied permission: deny access; verify clear recovery guidance, manual entry remains available, and no write occurs.
9. Duplicate Contact: select a Contact with an email already in the workspace, then separately a phone already in the workspace; verify exact matches merge without duplicating unrelated data.
10. Invalid phone: select a malformed or extension-only number; verify normalization does not create a false exact match and the user receives a reviewable outcome.
11. Background/resume: open the picker, background the browser, resume, and finish or cancel; verify the page remains signed in and does not double-submit.
12. Database residue: inspect the test workspace and audit record; confirm only selected fields were stored, the source is correct, and no photo/raw picker payload was retained.

## Acceptance

Qualification passes only when all applicable cases pass on at least one supported physical device, permission/privacy text matches observed platform behavior, database writes are verified, and failures are reproducible or resolved. Record the evidence in the dated launch-readiness report. Until then the status remains **blocked**.
