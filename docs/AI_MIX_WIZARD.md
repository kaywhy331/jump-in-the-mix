# AI Mix Wizard

The AI Mix Wizard is a review-first Plus/Pro workflow for creating an editable Mix Draft from four focused decisions:

1. outcome and strategic approach
2. trigger and audience
3. timing and intensity
4. channels and My Info context

The wizard never activates a Mix automatically. Generation creates an expiring `AiMixDraft`; a user must review its metadata and every prepared Jump before publishing it into the ordinary Mix editor.

## Generation modes

### Built-in strategist

No external configuration is required. Deterministic generation produces a valid, editable sequence using approved placeholders and the selected objective, cadence, channels, product placeholder, and industry context.

Preset refinements also work without an external provider. Custom free-form refinement requires a configured provider and otherwise leaves the saved draft unchanged with a visible warning.

### Provider-backed structured generation

Configure:

```text
AI_PROVIDER=openai
AI_API_KEY=<server-side API key>
AI_MODEL=gpt-5.6-luna
AI_BASE_URL=https://api.openai.com/v1
```

The server calls the Responses API with `store: false` and a strict JSON Schema response format. Provider output must pass the same application validation as built-in output. Any provider timeout, error, malformed response, unsupported placeholder, disallowed channel, or invalid content falls back to the built-in strategist instead of blocking the user.

The browser never receives the provider key.

## Privacy boundary

The provider payload can contain:

- objective, tone, framework, cadence, channels, and timeline
- selected Contact Group names as audience labels
- the selected My Product value and placeholder
- My Industry or user-entered market context
- optional user-entered campaign context
- workspace quiet-hour values

The provider payload does not contain:

- Contact rows or Contact IDs
- names, email addresses, phone numbers, addresses, or private notes
- Jump history
- Group membership lists
- provider credentials

## Content validation

Every generated, manually edited, or refined draft is validated before persistence and again before publication.

Validation requires:

- one to seven Jumps
- only channels selected during preflight
- offsets inside the selected timeline
- email subject and body
- SMS, WhatsApp, phone, and voicemail content appropriate to the channel
- approved dynamic placeholders only
- Private Notes only in Phone Call Jumps
- no automated-marketing phrases such as `Reply STOP`, `text STOP`, or unsubscribe language in SMS content

The optional SMS opt-out checkbox sets delivery metadata only. It does not insert opt-out copy into the message.

## Persistence and publication

`AiMixDraft` records expire after 48 hours. A review draft is workspace-scoped and may be published once.

Publication is one PostgreSQL transaction that:

- claims the review draft
- creates a normal `Mix` with `DRAFT` status and source `AI_WIZARD`
- creates reusable `StepTemplate` rows
- creates immutable version-1 `StepVersion` rows
- creates ordered `MixStep` rows
- persists the selected broadcast schedule when applicable
- creates Group or all-active-Contact dynamic assignments
- writes an audit event
- queues normal Jump reconciliation
- marks the AI review draft as published

If any operation fails, no partial Mix is left behind.

## Rate limits

Generation is limited to 12 requests per workspace/user per hour. Refinement is limited to 30 requests per workspace/user per hour. Repeated excess requests receive an actionable retry message.

## Smoke test

1. Sign in to a Plus or Pro workspace.
2. Create at least one Contact Group or have one active Contact.
3. Open **Mixes → Create with AI**.
4. Complete all four preflight sections.
5. Generate the review draft.
6. Confirm the preview includes the requested number of Jumps and selected channels.
7. Edit one message and save.
8. Apply a preset refinement.
9. Confirm no SMS contains `Reply STOP` or unsubscribe language.
10. Create the editable Mix Draft.
11. Confirm the ordinary Mix editor opens with the trigger, audience, metadata, and sequence populated.
12. Activate only after manually reviewing the final schedule and content.

## Provider-failure smoke test

1. Leave `AI_API_KEY` blank or temporarily configure an invalid key.
2. Generate a review draft.
3. Confirm a valid built-in draft is produced with a visible provider warning.
4. Apply a preset refinement and confirm the workflow remains usable.
