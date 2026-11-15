# Jump in the Mix — Design Roadmap

_Last reviewed: 2026-07-19 against merged `main` after PR #3._

## Objective

Evolve the current capable beta into a calmer, more coherent relationship-action product centered on one outcome:

> Help users see who needs attention and complete the next meaningful action quickly.

## Design principle

> Calm by default. Urgent only when necessary. One obvious next action. Details available, never forced.

## Current assessment

| Area | Assessment |
|---|---:|
| Core visual foundation | 7.5/10 |
| Daily Jump workflow | 6.5/10 |
| Contact-management UX | 7/10 |
| Information architecture | 6/10 |
| Mobile experience | 5.5/10 |
| Brand distinctiveness | 5.5/10 |
| Accessibility foundation | 6.5/10 |
| Marketing/conversion design | 5.5/10 |
| Overall design maturity | 6.5/10 |

The main remaining design problem is complexity management. The product has gained substantial capability, but some screens still reflect multiple implementation phases rather than one unified hierarchy.

## Tracking

- Master roadmap: [#5](../issues/5)
- Phase 1 — Navigation, Today, Quick Add, and Jump cards: [#6](../issues/6)
- Phase 2 — Contacts and Mix hierarchy: [#7](../issues/7)
- Phase 3 — Settings and Account architecture: [#8](../issues/8)
- Phase 4 — Design-system consolidation: [#9](../issues/9)
- Phase 5 — Public-site redesign: [#10](../issues/10)

## Phase 1 — Navigation and daily action UX

### Mobile navigation

Replace the six-entry mobile navigation with five positions:

```text
Today | Contacts | + | Mixes | More
```

The center Quick Add should expose natural-language capture, a new Contact, an Important/Jump Date, a one-time Jump, a new Mix, and contact import. Settings, Help, Account, Library/Templates, referrals, and Admin should move under More or the profile menu.

### Today as the product center

Rename Home to Today and make the dashboard an operating view rather than a generic summary. It should surface:

- overdue
- due today
- due this week
- one highest-priority next action
- today’s queue
- upcoming moments
- relationships going quiet
- recently completed actions

The onboarding checklist should disappear or collapse after activation.

### Jump cards

Each Jump card should expose one dominant outreach action with a visible label such as Email, Text, or Call. Completion should use a clear Done/checkbox interaction after outreach rather than a visually dominant status block. Secondary actions should move into a compact overflow menu.

Overdue, Today, and Completed today should be separate sections. Urgency must be expressed in text, not only color. Snooze should be first class, with presets for later today, tomorrow, next Monday, next week, and a custom date/time.

## Phase 2 — Contacts and Mix hierarchy

### Contacts

Simplify the Contact-page header to title, Add Contact, search, group filter, filters, and overflow. Import, Export, Manage Groups, Custom Fields, and Select All belong in overflow; bulk actions should appear only after selection.

Contact rows should emphasize relationship state:

- last meaningful interaction
- next Jump
- overdue state
- relationship type
- preferred channel
- key group
- optional priority/value

Raw email and phone should be secondary in the default list.

Use transitional helper text for Jump Date:

> An important date that triggers follow-up.

### Mixes

A Mix card should communicate name, lifecycle state, trigger, cadence, audience, channel sequence, and a primary Edit action. Duplicate, Share, Pause, and Archive belong in overflow. Community moderation belongs in sharing surfaces.

Replace implementation-heavy labels with user-centered language:

```text
Starts when: Follow-up Date occurs
Audience: 14 Contacts
Timing: 3 actions over 9 days
```

Replace the page-header action cluster with search, status filter, and one New Mix menu containing template, manual, AI, and starter paths.

## Phase 3 — Settings and Account architecture

Split Settings into:

- Profile
- Messaging
- Jump Defaults
- Integrations
- Community
- Billing
- Security
- Data & Privacy

The Settings landing page should be a simple hub, not a hub plus a long profile form.

Replace numbered Product/Service and custom-value fields with repeatable, user-named records. Replace the US-only timezone selector with a searchable global picker and confirm automatic detection during onboarding.

Divide My Account into Overview, Billing, Connections, Security, Referrals, Support, and Data & Privacy. Account deletion belongs in Data & Privacy. Dense downgrade behavior should move into an expandable explanation.

Replace scattered Account, Referral, Admin, Help, and Sign-out controls with one profile menu. Keep support-impersonation exit controls separate and prominent.

## Phase 4 — Design-system consolidation

Consolidate `globals.css` and temporary `prd-*` overrides into a formal design system with tokens for:

- spacing
- typography
- radii
- shadows
- borders
- z-index
- motion
- status colors
- breakpoints

Replace Unicode symbols with a coherent SVG icon system. Use a real variable font or standard system weights of 400, 500, 600, and 700. Reduce nested-card visual noise by using whitespace and dividers for secondary content.

Replace destructive `<details>` pseudo-popovers with accessible dialogs supporting focus trapping, Escape-to-close, background inertness, and focus restoration. Keep `<details>` for non-modal progressive disclosure.

Add reduced-motion, increased-contrast, and forced-colors behavior, and verify focus order, keyboard operation, and screen-reader announcements.

## Phase 5 — Public-site redesign

Replace the simulated product preview with real screenshots or short video showing the Today queue, Contact timeline, Mix builder, mobile Jump action, and Quick Add.

Improve pricing with a monthly/annual toggle, visible annual savings, the five most important plan differences, a buyer profile for each plan, and a full accessible comparison. Preserve selected-plan intent through registration and checkout.

Add trust and education covering:

- why this is not another complicated CRM
- privacy and data controls
- native-send versus automated-send behavior
- target-user examples
- integration availability
- FAQs
- current limitations
- real pilot evidence when available

## Implementation order

1. Navigation and daily action UX
2. Contacts and Mix hierarchy
3. Settings and Account architecture
4. Design-system consolidation
5. Public-site redesign

Keep each phase in a separate, reviewable pull request. Avoid mixing information-architecture changes, visual-system replacement, and major backend behavior unless they are inseparable.

## Cross-phase acceptance criteria

- The Today view makes the next action obvious within five seconds.
- Mobile navigation contains no wrapping or hidden primary destinations.
- A user can capture a follow-up from any primary screen.
- Jump cards expose one dominant action and no more than two visible secondary actions.
- Overdue and current-day work are visually distinct.
- Contacts communicate relationship state, not only stored fields.
- Mix cards communicate purpose, timing, and audience without expansion.
- Settings and Account no longer require excessive mixed-purpose scrolling.
- Destructive workflows use accessible dialogs.
- Reduced-motion and high-contrast modes are supported.
- Real product imagery replaces the simulated marketing preview.
- Desktop, tablet, and mobile Playwright coverage protects revised primary flows.

## Out of scope

This roadmap does not require a full rebrand. The focus is interaction hierarchy, information architecture, mobile usability, accessibility, and consistency while preserving the current product model and capabilities.
