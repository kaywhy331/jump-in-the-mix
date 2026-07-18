# Help and Support Center

Jump in the Mix provides one self-service Help page and one durable support conversation model. The FAQ appears before the contact form, and every ticket remains scoped to the requesting user and workspace.

## User experience

Primary navigation includes **Help**.

`/help` provides:

- Instant client-side FAQ search.
- Topic filtering.
- Questions collapsed by default.
- Guidance covering Contacts, Groups, Jumps, Mixes, Jump Dates, Templates, AI, billing, imports, Google Contacts, privacy, security, and troubleshooting.
- A support form below the FAQ.
- Recent ticket links.

A submitted ticket redirects to:

```text
/account/tickets/<ticket-id>
```

The user can:

- Read the complete timestamped conversation.
- See category, priority, and status.
- Reply to an open, waiting, or resolved ticket.
- Reopen a resolved ticket.
- Open a new ticket when the previous ticket is permanently Closed.

The My Account page also displays recent support conversations and direct Help/new-ticket actions.

## Administrator experience

Platform administrators use:

```text
/admin/support
/admin/support/<ticket-id>
```

The queue supports:

- Search by ticket reference, title, requester name/email, or workspace.
- Status, category, and priority filters.
- Waiting, urgent, and email-failure counts.
- Requester, workspace, plan, and subscription context.
- Contact, active Mix, incomplete Jump, and integration counts.
- Category and priority triage.
- Prepared response templates.
- Resolve, reopen, and close actions.
- Per-response email state and retry controls.

Administrator responses are labeled exactly:

```text
Jump in the Mix Response
```

Every create, reply, reopen, triage, status, and administrator-response action writes an audit record. The real administrator remains the actor.

## Email behavior

An administrator response is committed to PostgreSQL before email delivery is attempted. Email failure therefore never removes the response from the customer conversation.

The notification includes:

- Ticket reference.
- Ticket title.
- A branded **Jump in the Mix Response** heading.
- Proper HTML paragraphs and separators.
- The complete response.
- A direct route to the ticket.
- A Jump in the Mix Support footer.
- A plain-text alternative.

Delivery state is stored on the response as:

```text
PENDING
SENT
PREVIEWED
FAILED
```

`PREVIEWED` is used in local development when transactional email is intentionally not configured. `FAILED` records a bounded provider error and exposes an administrator retry action.

Production email uses the existing Resend configuration:

```text
APP_URL=https://YOUR_HOST
RESEND_API_KEY=re_...
EMAIL_FROM=Jump in the Mix <support@YOUR_VERIFIED_DOMAIN>
EMAIL_REPLY_TO=support@YOUR_DOMAIN
```

## Privacy and security

- Browser-supplied workspace or requester IDs are never accepted by user ticket actions.
- Reads and replies require the authenticated requester plus the active workspace.
- Administrator queue and mutations require platform-administrator authorization.
- View-only administrator support sessions cannot submit or reply to tickets.
- Ticket creation and user replies use persistent database-backed rate limits.
- Ticket text must not contain passwords, card details, provider tokens, API keys, or webhook signing secrets.
- Ticket content is not sent to the AI Mix provider.

## Staging smoke test

1. Sign in as a normal user and confirm **Help** appears in primary navigation.
2. Search the FAQ and confirm typing does not lose focus.
3. Open and close multiple FAQ questions without navigation or layout shifts.
4. Submit a ticket and confirm it redirects to the private conversation.
5. Confirm the ticket appears in My Account and Admin · Support.
6. Attempt to open the ticket as another user/workspace and confirm access is denied.
7. As an administrator, change category and priority.
8. Send a response and confirm the user thread shows **Jump in the Mix Response** with a timestamp.
9. Confirm the email contains the ticket title, formatted response, and direct ticket link.
10. Temporarily break the email configuration and confirm the reply remains in the thread with a Failed email state.
11. Restore email configuration and retry the failed email.
12. Resolve the ticket, then reopen it as the user and confirm it returns to the support queue.
13. Close the ticket and confirm the user is directed to open a new conversation.
14. Start a view-only administrator support session and confirm all support mutations are blocked.
