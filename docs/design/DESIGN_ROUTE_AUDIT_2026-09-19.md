# Design adoption route audit — 2026-09-19

Local synthetic data only. Each listed route was visited at 1440px/light and 320px/dark. Rows identify redirects and intentional missing-page fixtures. Automated checks covered WCAG 2 A/AA and 2.1 AA, horizontal overflow, HTTP failures and browser exceptions. A clean automated scan is not a guarantee of complete accessibility.

| Area | Requested URL | Landed / status | Result |
| --- | --- | --- | --- |
| customer | `/account` | 200 | Pass |
| customer | `/account/preferences` | 200 | Pass |
| customer | `/account/tickets` | 200 → /help | Pass |
| customer | `/account/tickets/design-support` | 200 | Pass |
| customer | `/calendar` | 200 | Pass |
| customer | `/contacts` | 200 | Pass |
| customer | `/contacts/archived` | 200 | Pass |
| customer | `/contacts/custom-fields` | 200 | Pass |
| customer | `/contacts/design-person-0` | 200 | Pass |
| customer | `/contacts/design-person-0/edit` | 200 | Pass |
| customer | `/contacts/duplicates` | 200 | Pass |
| customer | `/contacts/import` | 200 | Pass |
| customer | `/contacts/new` | 200 | Pass |
| customer | `/help` | 200 | Pass |
| customer | `/journey` | 200 | Pass |
| customer | `/journey?stage=cmu8l5xv60001dzl3oig3fa2z` | 200 | Pass |
| customer | `/jumps` | 200 | Pass |
| customer | `/mixes` | 200 | Pass |
| customer | `/mixes/demo_mix_relationship/edit` | 200 | Pass |
| customer | `/mixes/new` | 200 | Pass |
| customer | `/mixes/system` | 200 | Pass |
| customer | `/more` | 200 | Pass |
| customer | `/onboarding` | 200 | Pass |
| customer | `/settings` | 200 | Pass |
| customer | `/settings/business` | 200 | Pass |
| customer | `/settings/connections` | 200 | Pass |
| customer | `/settings/journey` | 200 | Pass |
| customer | `/settings/jump-date-types` | 200 | Pass |
| customer | `/settings/notifications` | 200 | Pass |
| customer | `/settings/sending` | 200 | Pass |
| customer | `/templates` | 200 | Pass |
| customer | `/templates/mix_relationship_next_verse/use` | 200 | Pass |
| customer | `/templates/plan_home_job_done/use` | 200 | Pass |
| public | `/` | 200 | Pass |
| public | `/account/deleted` | 200 | Pass |
| public | `/contact` | 200 | Pass |
| public | `/faq` | 200 | Pass |
| public | `/features/follow-up-reminders` | 200 | Pass |
| public | `/follow-up-templates` | 200 | Pass |
| public | `/follow-up-templates/estimate-follow-up` | 200 | Pass |
| public | `/follow-up-templates/proposal-follow-up` | 200 | Pass |
| public | `/for/consultants` | 200 | Pass |
| public | `/for/contractors` | 200 | Pass |
| public | `/for/independent-recruiters` | 200 | Pass |
| public | `/for/photographers` | 200 | Pass |
| public | `/for/real-estate-agents` | 200 | Pass |
| public | `/forgot-password` | 200 | Pass |
| public | `/lead/design-intake` | 200 | Pass |
| public | `/lead/missing` | 404 | Pass |
| public | `/login` | 200 | Pass |
| public | `/not-a-page` | 404 | Pass |
| public | `/offline` | 200 | Pass |
| public | `/onboarding` | 200 → /login | Pass |
| public | `/privacy` | 200 | Pass |
| public | `/register` | 200 | Pass |
| public | `/reset-password` | 200 | Pass |
| public | `/review/design-review-fixture` | 200 | Pass |
| public | `/review/missing` | 200 | Pass |
| public | `/signed-out` | 200 | Pass |
| public | `/staff/accept` | 200 | Pass |
| public | `/terms` | 200 | Pass |
| public | `/verify-email/pending` | 200 | Pass |
| public | `/waitlist` | 200 | Pass |
| public | `/waitlist/confirm` | 200 | Pass |
| public | `/waitlist/leave` | 200 | Pass |
| staff | `/account/admin-mfa` | 200 | Pass |
| staff | `/admin` | 200 | Pass |
| staff | `/admin/access` | 200 | Pass |
| staff | `/admin/access-denied` | 200 | Pass |
| staff | `/admin/access/design-invite` | 200 | Pass |
| staff | `/admin/admission` | 200 | Pass |
| staff | `/admin/audit` | 200 | Pass |
| staff | `/admin/email` | 200 | Pass |
| staff | `/admin/email/recovery` | 200 | Pass |
| staff | `/admin/email/recovery/design-delivery` | 200 | Pass |
| staff | `/admin/email/suppressions` | 200 | Pass |
| staff | `/admin/email/suppressions/design-suppression` | 200 | Pass |
| staff | `/admin/operations` | 200 | Pass |
| staff | `/admin/operations/alerts` | 200 | Pass |
| staff | `/admin/reports` | 200 | Pass |
| staff | `/admin/reports/exports` | 200 | Pass |
| staff | `/admin/reports/history` | 200 | Pass |
| staff | `/admin/reports/history/design-snapshot` | 200 | Pass |
| staff | `/admin/settings` | 200 | Pass |
| staff | `/admin/support` | 200 | Pass |
| staff | `/admin/support/design-support` | 200 | Pass |
| staff | `/admin/system-mix` | 200 | Pass |
| staff | `/admin/team` | 200 | Pass |
| staff | `/admin/templates` | 200 | Pass |
| staff | `/admin/templates/new` | 200 | Pass |
| staff | `/admin/templates/plan_home_job_done/edit` | 200 | Pass |
| staff | `/admin/users` | 200 | Pass |
| staff | `/admin/users/demo_user` | 200 | Pass |
| staff | `/admin/waitlist` | 200 | Pass |

The isolated installation runs in self-hosted mode. `/account/tickets` redirects to Help in that mode; the populated ticket detail and staff conversation were also exercised directly. Public policy pages use explicitly fictional local operator details. No production settings were changed.

All dynamic page templates have a representative route above. Authentication/verification invitation states reached through invalid or missing tokens are fallback checks, not evidence that every token lifecycle or email provider was exercised.
