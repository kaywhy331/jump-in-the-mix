# Integration Setup Roadmap

> **Current status:** This document is the implementation contract for the next build phase. The present runnable core starter does not yet expose these OAuth, webhook, Checkout, or sync routes. Environment variables and database entities are reserved so the integrations can be added without redesigning the core product.

Implement and security-test one provider at a time in staging before enabling it for customer data.

## Stripe

### Dashboard

Create two Products:

- Jump in the Mix Plus
- Jump in the Mix Pro

Create monthly and annual recurring Prices for each Product, then populate the four Price ID environment variables.

### Customer Portal

Enable:

- Invoice history
- Payment method updates
- Subscription switching between the four approved Prices
- Cancellation at period end
- Return URL to `/app/settings/billing`

### Webhook

Endpoint:

```text
https://YOUR_DOMAIN/api/webhooks/stripe
```

Events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.

### Local testing

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Use the temporary `whsec_...` value printed by the CLI.

## Google Contacts

1. Create a Google Cloud project.
2. Enable the People API.
3. Configure the OAuth consent screen.
4. Create a Web Application OAuth client.
5. Add the redirect URI:

```text
http://localhost:3000/api/integrations/google/callback
```

Production:

```text
https://YOUR_DOMAIN/api/integrations/google/callback
```

6. Configure:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
```

The application requests read-only Contacts access and stores an encrypted refresh token plus sync cursor. Incremental sync is queued through the worker.

## Microsoft / Outlook Contacts

1. Register an application in Microsoft Entra.
2. Select account types appropriate for personal Microsoft and/or organizational accounts.
3. Add delegated permissions:

```text
openid
profile
offline_access
Contacts.Read
```

4. Add the redirect URI:

```text
http://localhost:3000/api/integrations/microsoft/callback
```

5. Create a client secret and configure:

```text
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
MICROSOFT_REDIRECT_URI
```

The MVP synchronizes the signed-in user’s default Outlook Contacts folder. Microsoft exposes contact delta per folder, so the integration discovers that folder from the first default-folder contact, then stores the complete Graph `@odata.deltaLink`. It requests immutable Outlook contact IDs to avoid identity changes when a contact is moved. When the default folder is empty, synchronization completes cleanly and retries folder discovery on a later run.

## WhatsApp Cloud API Assistant

Use a dedicated WhatsApp Business number for Jump in the Mix.

Configure:

```text
META_APP_SECRET
META_GRAPH_API_VERSION=v25.0
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN
WHATSAPP_PUBLIC_NUMBER
```

Webhook URL:

```text
https://YOUR_DOMAIN/api/webhooks/whatsapp
```

The GET handler performs Meta verification. The POST handler validates `X-Hub-Signature-256` before processing. `META_GRAPH_API_VERSION` is configurable so the application can be upgraded without a code change when Meta retires an API version.

### Linking flow

1. Plus/Pro user presses **Link WhatsApp**.
2. The app creates a short-lived code and opens WhatsApp with a prefilled `LINK` message.
3. The inbound webhook validates and connects the sender identity to the workspace.
4. New messages create structured capture drafts.
5. The user replies `CONFIRM <code>` to apply a proposed change.

A personal Google Voice number cannot replace this integration because the application needs supported programmatic webhooks and identity verification.

## Website and automation webhook

Plus/Pro users can create a signed inbound endpoint under Settings → Integrations.

Endpoint format:

```text
https://YOUR_DOMAIN/api/webhooks/website/CONNECTION_ID
```

Send JSON with header:

```text
X-JITM-Secret: CONNECTION_SECRET
```

Example:

```json
{
  "contact": {
    "firstName": "Sarah",
    "lastName": "Chen",
    "company": "BrightPath",
    "email": "sarah@example.com",
    "phone": "+15551234567"
  },
  "importantDate": {
    "dateType": "Follow-up",
    "date": "2026-08-01",
    "label": "Website inquiry"
  },
  "context": "Interested in consulting services"
}
```

Because this is a structured, secret-authenticated connection explicitly configured by the user, the endpoint applies a validated Contact/Important Date upsert immediately and records an idempotent webhook event. Natural-language AI channels still require confirmation. This endpoint can be used by website forms, Zapier, Make, or custom systems.
