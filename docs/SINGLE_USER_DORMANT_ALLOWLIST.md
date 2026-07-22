# Dormant internal structures

The structure-first application does not expose or execute billing, provider, team, invitation, role-management, ownership-transfer, referral-reward, community-publishing, or external generation workflows.

The following historical implementation areas remain in the repository only to avoid destructive schema or migration churn and to preserve the existing qualification branches:

- Prisma fields and committed migrations for plan tiers, subscriptions, provider connections, shared workspaces, memberships, invitations, roles, referrals, shared Mix publishing, and generated Mix drafts.
- Server modules used only by the denied billing, provider, referral, community-sharing, generated-Mix, and platform-operations routes.
- Route source beneath denied paths. `src/proxy.ts` returns 404 before these handlers execute.
- Platform support-access and audit models. They are not linked from ordinary user navigation and do not create a multi-user product experience.

Dormant records are still included in account deletion and operational retention where required for safe cleanup. They are not presented as current product capabilities.

Reintroduction requires a separate product decision, removal from the denied-route list, new user-facing scope documentation, and exact-head validation.

Provider, commercial, entitlement, and referral qualification suites remain in `tests/` for the preserved branches but are explicitly excluded from the structure-first default Vitest run. The default suite replaces them with single-user terminology, navigation, route-denial, worker-task, and no-tier-enforcement assertions in `tests/single-user-scope.test.ts`.
