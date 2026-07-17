# Google Contacts Integration Runbook

The application implements a one-way Google-to-Jump-in-the-Mix Contacts integration for Plus and Pro workspaces.

## Product behavior

- The user connects a Google account from **My Account → Google Contacts**.
- Jump in the Mix requests read-only Google Contacts access.
- The user may import all Google Contacts or only selected Google labels/groups.
- The user previews new, exact/linked, ambiguous/fuzzy, and deleted records before the first import.
- Exact normalized email or phone matches may merge automatically when enabled.
- Fuzzy and ambiguous matches are held for review and are not silently merged.
- Existing primary email, phone, and address selections remain unchanged during a merge.
- Google removals retire the provider link; they do not delete the local Contact.
- The first completed import stores a Google sync token. The worker performs incremental refreshes thereafter.
- An expired Google sync token triggers a new full read rather than permanently failing the integration.
- Successful creates and updates queue normal Jump reconciliation.

## Required Google Cloud configuration

1. Create or select a Google Cloud project.
2. Enable the **Google People API**.
3. Configure the OAuth consent screen and publishing/test-user state appropriate for the environment.
4. Create an OAuth 2.0 **Web application** client.
5. Add the exact callback URI for each deployed environment. The callback route is:

   ```text
   https://YOUR_HOST/api/integrations/google/callback
   ```

6. Add the exact application origin where Google requires an authorized JavaScript origin.
7. Configure the environment variables below with the credentials from that same OAuth client.

Redirect URIs must match exactly, including protocol, host, path, and trailing-slash behavior.

## Required environment variables

```text
APP_URL=https://app.example.com
DATA_ENCRYPTION_KEY=<unique high-entropy secret>
GOOGLE_CLIENT_ID=<OAuth web client ID>
GOOGLE_CLIENT_SECRET=<OAuth web client secret>
GOOGLE_REDIRECT_URI=https://app.example.com/api/integrations/google/callback
GOOGLE_SYNC_HOURS=24
```

Requirements:

- `DATA_ENCRYPTION_KEY` must be unique per environment and stored only in the hosting secret manager.
- Do not rotate `DATA_ENCRYPTION_KEY` without first decrypting and re-encrypting stored provider credentials, or requiring every connected user to reconnect.
- `GOOGLE_REDIRECT_URI` must be identical to an authorized redirect URI on the Google OAuth client.
- Preview, staging, and production should use separate OAuth clients where practical.
- Never log an access token, refresh token, client secret, authorization code, or unredacted provider response.

## OAuth and credential controls

- OAuth `state` is random, short-lived, one-time, and stored only as a SHA-256 hash.
- Authorization codes are bound to the initiating request with an S256 PKCE verifier and challenge.
- Tokens are encrypted with AES-256-GCM before database storage.
- The account status route never returns encrypted credentials or decrypted tokens.
- Access tokens are refreshed server-side.
- A revoked or invalid refresh token changes the connection state and requires the user to reconnect.
- Connecting a different Google account retires earlier Google provider links and cancels active sync jobs while preserving local Contacts.
- Disconnect attempts Google revocation, clears locally stored credentials, stops scheduled work, and preserves local Contacts.

## Worker requirement

The web application can authorize, preview, and queue a sync. The background worker must also be running:

```bash
npm run worker
```

The worker:

- claims `sync-google-contacts` jobs,
- runs the initial or incremental sync,
- writes `SyncRun` history,
- schedules future due connections,
- refreshes access tokens when needed,
- and queues Jump reconciliation for changed Contacts.

A production deployment that runs only the web process will leave queued syncs pending.

## Initial test checklist

Use a dedicated Google test account with a small, known address book.

1. Add the exact callback URI to Google Cloud.
2. Set all required environment variables.
3. Start the web application, worker, and PostgreSQL.
4. Sign in to a Plus or Pro workspace.
5. Open My Account and select **Connect Google**.
6. Confirm the consent screen requests read-only Contacts access.
7. Return to My Account and load Google labels.
8. Select one label and run Preview.
9. Confirm the preview counts and sample records match the Google account.
10. Confirm fuzzy/ambiguous records are marked for review rather than merged.
11. Run the import.
12. Confirm created and updated counts in Sync History.
13. Confirm `ExternalContactLink` records exist for imported Contacts.
14. Confirm Birthdays and Anniversaries are stored as logical Jump Dates.
15. Confirm Private Notes were not written.
16. Modify a Google Contact and run Sync again.
17. Confirm the local Contact updates without creating a duplicate.
18. Delete a Google Contact and sync again.
19. Confirm the local Contact remains and only its provider link is retired.
20. Disconnect Google and confirm local Contacts remain available.

## Operational checks

Monitor:

- `IntegrationConnection.status`, `lastError`, `lastSyncAt`, and `nextSyncAt`;
- recent `SyncRun` status and counts;
- failed `sync-google-contacts` jobs;
- Google OAuth error rates;
- access-token refresh failures;
- Contact-limit failures;
- unusually high creation or review counts;
- and Jump reconciliation failures after a sync.

Recommended alerts:

- repeated `REVOKED` or `ERROR` connections,
- queued/running syncs older than the normal worker window,
- multiple failed runs for the same connection,
- and a large deviation between selected Google contacts and imported Contacts.

## Data and privacy notes

- This release is one-way: it reads Google Contacts and does not update Google.
- Imported Public Notes include source provenance when appended.
- Private Notes are never imported.
- Google profile photos are not imported in this release.
- A remote deletion never silently deletes the user's local Contact.
- Users may disconnect the provider without deleting their local data.
- Data export/deletion policy and retention language must be reviewed before production launch.

## Troubleshooting

### `redirect_uri_mismatch`

Compare `GOOGLE_REDIRECT_URI` with the OAuth client's authorized redirect URI character-for-character. Check protocol, subdomain, path, port, and trailing slash.

### No refresh token returned

Google may omit a refresh token after prior consent. The application preserves an existing refresh token on reconnect. For a new connection that has none, revoke the application's access in the Google account and reconnect with consent enabled.

### Sync remains queued

Confirm the background worker is running and can reach PostgreSQL and Google's APIs. Inspect the `Job` record for `lastError`.

### Connection becomes revoked

The refresh token was rejected or removed. Reconnect the Google account from My Account.

### Incremental sync fails with an expired token

The service automatically retries as a full sync and stores a replacement sync token. Verify all sync request parameters remain unchanged between the initial and incremental requests.

### Selected label appears empty

Confirm the Google Contact still belongs to that label and that the label's resource name is present in the Person membership data returned by the People API.
