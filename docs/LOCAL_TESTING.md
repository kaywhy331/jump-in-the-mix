# Local MVP Test Guide

## 1. Start through the supported launcher

Follow [START_HERE.md](../START_HERE.md).

Windows:

```text
start-local.cmd
```

macOS:

```text
start-local.command
```

Linux/macOS terminal:

```bash
./start-local.sh
```

Do not manually create secrets for the normal Docker path. The launcher handles that automatically.

## 2. Confirm installation readiness

The launcher should report:

```text
Jump in the Mix is ready
```

Then verify:

- `http://localhost:3000/api/health/live` returns `status: ok`
- `http://localhost:3000/api/health/ready` returns `status: ready`
- The browser opens the sign-in page

If the app does not become ready, run:

```bash
./doctor.sh
```

or on Windows:

```powershell
.\doctor.ps1
```

## 3. Guided demo smoke test

1. Click **Open the guided demo**.
2. Confirm the Dashboard shows sample contacts, an active Mix, and Jumps.
3. Open **Contacts** and search for a sample contact.
4. Open the contact detail page.
5. Add an Important Date and leave **Use a matching follow-up Mix automatically** selected.
6. Confirm the app reports that the matching Mix was assigned automatically.
7. Open **Jumps** and switch between Today, Upcoming, Past, and Completed.
8. Use a message/call action. The operating system should open the relevant native app when the contact has that communication method.
9. Mark a Jump Done or Skipped.
10. Open **Mixes → AI Mix Wizard**, generate a draft, and confirm it appears under Mixes.

The demo workspace uses the Plus plan so the Wizard can be evaluated without editing the database.

## 4. New-user journey test

1. Sign out of the demo.
2. Create a new account.
3. Complete the one-screen setup, or use **Skip for now**.
4. Confirm the Dashboard explains the next action.
5. Confirm a simple starter Mix was created automatically.
6. Add one contact.
7. Add a **Follow-up** Important Date and keep automatic Mix assignment selected.
8. Wait a few seconds for the worker and refresh Jumps.
9. Confirm a Jump appears without requiring a separate Mix-assignment screen.

The journey should remain understandable without consulting documentation.

## 5. Persistence test

1. Add or change a record.
2. Stop the app:

   ```bash
   ./stop-local.sh
   ```

3. Start it again.
4. Confirm the change remains.

## 6. Reset test

Run:

```bash
./reset-local.sh
```

Type `RESET` when prompted. Confirm the clean guided demo returns. This permanently deletes only the local Docker database volume.

## 7. Code-quality checks

For native developer validation:

```bash
npm install
npm run db:generate
npm run validate:static
npm run typecheck
npm test
npm run build
```

All checks should pass before merging a change.

## 8. Integration testing status

Stripe and Google Contacts are implemented and have deterministic boundary/integration coverage; live provider credentials are still required for their external sandbox matrices. Resend is implemented with live delivery pending. Microsoft Contacts and WhatsApp/Meta assistant behavior are boundary/scaffolding only, while Twilio and the website webhook are planned. See `docs/INTEGRATIONS.md` for the exact status of each provider.

Account deletion browser coverage creates a dedicated synthetic owner, verifies wrong-password and wrong-phrase rejection, deletes the account, and checks database residue. Provider revocation failures are deterministic mocks; never place live tokens in test fixtures or reports.
