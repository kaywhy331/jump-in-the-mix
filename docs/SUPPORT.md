# Customer support

Hosted accounts can open private support conversations from Help. Self-hosted installations instead show operator recovery, diagnostics, and sanitized public-reporting instructions; they never imply that an unconfigured support team or email service will respond.

Support categories use plain product language: account/access, customers/tags, Today/follow-ups, plans/scheduling, saved dates, ready-made plans, imports, privacy/security, bugs, and suggestions. FAQ answers avoid internal scheduling or database terminology.

Ticket titles and messages are bounded and rate limited. Users are repeatedly told not to include passwords, customer information, private keys, session tokens, or provider credentials. Email notifications are best effort and their status is recorded without exposing provider secrets.

Platform administrators need a current MFA step-up to triage and reply. View-only customer sessions require a documented reason and cannot submit forms or alter customer data. All support access and status changes are audited to the customer business.

For the Docker edition, password recovery is available with:

```bash
npm run pilot:reset-password -- owner@example.com
```

Public issues must contain only sanitized, synthetic information. Security vulnerabilities should use GitHub private vulnerability reporting when available.
