# Customer journeys, calendars, and lead connections

Jump in the Mix can adapt to different sales and service workflows. Owners choose their stages, decide which recorded events move a person forward, and connect the tools they already use.

## Set up a journey

Open **Settings → Customer journey** and choose **Use this starting journey**. The starting stages are Lead, Prospect, Client, and Retention. Rename them, move them earlier or later, add stages such as Proposal or Past customer, and change each stage’s rules.

The defaults move a lead to Prospect after a conversation or booked meeting, move a lead or prospect to Client after a confirmed sale, and move completed work to Retention. A sale can enter directly at Client; a person does not have to visit every stage. Sending a message alone does not confirm a sale.

Rules can use an incoming inquiry, a conversation, a booked meeting, a confirmed sale, completed work, elapsed days, or completion of the plan assigned by the stage. Each stage has one destination per trigger. Use **Edit rule** to start from its saved values, or **Add or change a rule** to choose another trigger. The preview explains the destination and whether entry can start a plan. Stage order organizes the journey and chooses the entry stage for new contacts; explicit rules can skip stages or return to an earlier one for repeat business. Owners can choose an active plan to start when a person enters a stage. Changing that plan affects future entries; people already in the stage keep their current assignment.

Saving a rule leaves people in their current stages. Timed rules count from each person’s stage-entry time, so someone already past the threshold can move on the next automatic check. A plan-completion rule can likewise become eligible immediately when the stage’s own plan is already finished. A rule save that fails keeps its entries. If the saved rule changed in another tab, review and load its latest values before saving again; removing a rule also checks for newer edits.

Existing contacts stay unassigned until an explicit milestone or stage choice. Newly added contacts enter automatically after setup; background processing picks up newly imported contacts. Contact pages show each automatic destination and expose a manual move and a per-person pause. The pause explanation distinguishes a paused business journey from an individual pause and points to the appropriate control. Pausing transitions keeps already-running plans in place.

Stage changes stop only the previous stage’s managed plan. Independently assigned plans, manual stops, and Do not contact preferences remain effective. Every transition is explained in the contact timeline. Retiring a stage requires moving its people first.

## Make room in your calendar

Open **More → Calendar** or **Schedule a meeting** from a contact. Meetings and time blocks reserve time, check for overlaps, and use the selected timezone. An intentional overlap requires an explicit checkbox. A linked meeting can trigger a journey rule; saving it does not send an invitation. Edit or cancel it from the agenda and download its .ics file to use with a preferred calendar provider.

Calendar connections support two directions:

| Direction | How it works |
| --- | --- |
| Another calendar → Jump in the Mix | Add its HTTPS/webcal iCalendar subscription URL for refreshed busy time, or import an .ics file for a snapshot. Edit those events in the original calendar. |
| Jump in the Mix → another calendar | Create a private subscription link and use the provider’s “Add calendar from URL” feature. The provider controls its refresh timing. An .ics download is a one-time copy. |

Google Calendar, Outlook, Apple Calendar, and other iCalendar providers can use these shared formats, subject to their sharing settings. Native OAuth and real-time two-way editing are not part of these connections. Connected availability shows the last successful refresh and reports failures while retaining the previous snapshot. Incoming feeds are eligible for refresh after 15 minutes while the worker runs; workload and provider response times can delay a refresh.

Imports cover the past month and next year, including recurring events, exclusions, timezone changes, and all-day busy time. Limits are 900 KB for an uploaded file, 1 MB for a remote feed, 1,000 event series, and 2,000 occurrences. Recurrences more frequent than daily, multiple times within one daily recurrence, and series starting more than 20 years ago require a smaller export. Transparent and canceled events do not reserve time. Refresh replaces only that external calendar’s availability.

Private subscription links reveal event titles and times to anyone who has the link. Replacing or disabling the link revokes the old URL. Calendar secrets are encrypted at rest and excluded from account exports.

## Receive inquiries from your channels

Open **Settings → Lead connections**. A shareable lead form works immediately after creation. Other source types provide an endpoint, private key, field example, and setup instructions for the source tool’s automation, Zapier, Make, n8n, or a custom backend.

| Source | Connection method |
| --- | --- |
| Website, social bio, shared link, QR code | Link to a hosted lead form, or connect an existing website form through its backend. |
| Email | Map a new-inquiry event using the email provider or an email parser. |
| Text, WhatsApp, phone call, voicemail | Map an incoming event from the messaging or phone provider. |
| Social DMs and comments | Use a platform-approved connector with the required account permissions. |
| Another CRM | Map people and trusted business milestones from its events. |
| RFID or a scanning device | Send its stable person/card identifier through a device integration. |
| CSV list, shared contact, vCard | Use Contacts → Import; the device contact picker is in Contacts → More. A QR code that opens a vCard can supply that file for import. |
| Another tool | Send an authenticated JSON request using the same endpoint. |

Choosing a source type creates its connection recipe. Access to an inbox, social account, phone system, or CRM is configured in the source or connector, according to that provider’s supported triggers and permissions.

### Connector contract

POST to `/api/webhooks/intake/{connectionId}` with `Content-Type: application/json` and the connection’s `X-JITM-Key` header. Keep the key in the backend or automation tool; use the hosted form for a directly shared browser form.

```json
{
  "eventId": "unique-source-event-id",
  "externalId": "stable-source-person-id",
  "displayName": "Sample person",
  "email": "sample@example.com",
  "phone": "+14155550123",
  "company": "Sample business",
  "message": "Interested in learning more",
  "eventType": "CONTACT_RECEIVED"
}
```

`eventId` and at least one of `email`, `phone`, or `externalId` are required. Omit unavailable fields. `firstName` and `lastName` are also supported. Use a country code for phones when possible. `eventType` defaults to `CONTACT_RECEIVED`; trusted sources may also provide `CONVERSATION_STARTED`, `MEETING_SCHEDULED`, `SALE_CONFIRMED`, or `WORK_COMPLETED`.

Use the same event ID and payload for retries. A different inquiry or milestone needs a new event ID. IDs can contain up to 180 characters; messages can contain up to 4,000 characters. Request bodies are limited to 24 KB and connections to 60 requests per minute.

| Response | Meaning |
| --- | --- |
| 201 | Saved successfully. |
| 200 | The identical event was already saved. |
| 202 | Saved for review because identities conflict or match an archived contact. |
| 400 / 415 | Correct the fields, size, JSON, or content type. |
| 401 | The connection/key is invalid, paused, or replaced. |
| 409 | The event ID was reused with different details. |
| 429 | Wait for `Retry-After`, then retry the same event. |
| 503 | Retry later using the same event ID. |

Matching uses exact normalized email, phone, or an external ID scoped to its connection. Names alone never merge people. Conflicting matches wait under **Needs a person’s eye**. Owners can link an inquiry to a matching active person, create a separate contact, or ignore it. Incoming data preserves existing contact details and permissions; submitted details remain available in receipts and the timeline. Public forms cannot issue privileged milestones and do not reveal whether an email or phone matches an existing customer.

Account JSON exports include journey rules/history, calendar entries and connection status, and lead receipts/identities. Account deletion removes the new data through workspace cascades. Contact merges preserve source identities, receipts, calendar links, and journey history.

## Private test site

The existing private gateway remains active on `https://jump-in-the-mix-test.netlify.app`. External connectors must provide its Basic authentication in addition to `X-JITM-Key`. Calendar providers that cannot authenticate through the gateway can use .ics downloads for testing. No gateway bypass was added for lead forms, webhooks, or calendar subscriptions.

The test site's background timer has long delays. Recorded milestones can move a person immediately, but time-based transitions and calendar refreshes may run late. See the current [worker qualification notes](NETLIFY_DEPLOYMENT.md#runtime) before relying on scheduled timing.

Using the app or submitting an inquiry now also requests pending preparation, so saved changes can be picked up without waiting for that timer. This does not guarantee timed processing while the installation is idle.
