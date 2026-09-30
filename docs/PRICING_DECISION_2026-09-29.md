# Plans and prices — owner decision, September 29, 2026

Kevin set the plans and prices for Jump in the Mix and decided how charging starts. The public pages may now state the prices. Charging stays off until he chooses a start date.

## What Kevin decided

The 9f967bc release report asked whether the approved FAQ sentence "Prices after the beta haven't been set." should stay. Kevin answered on 2026-09-29: "we can identify the prices up front right now and incorporate it with the payment terminal." His answers to the follow-up questions the same day:

| Question | Kevin's choice |
| --- | --- |
| Which prices should the FAQ and pricing page show? | Free $0; Plus $15 a month or $144 a year; Pro $29 a month or $288 a year. Pro + Assistant ($49.99) stays off because there is no assistant. |
| When should people start paying? | "Build now, charge later." The FAQ shows the prices now. Checkout is built and tested in Stripe's test mode, and stays off until Kevin picks a date. Beta accounts stay free until then. |
| What should separate Free, Plus and Pro? | Only limits the app can enforce: people with follow-ups on, 100 / 1,000 / 5,000; active Mixes, 3 / 25 / 100. The proposal's other extras (AI, contact sync, bookings, file storage) are not built, so the pricing page does not list them. |
| How does a Mega-Mix count toward the active-Mix limit? | "A Mega-Mix counts as one." |
| Is there a Stripe account to test against? | Yes. Kevin adds the test keys himself, to a private file on TrixBot, never in chat. |

The prices come from Kevin's local-only proposal, `assets/Jump_in_the_Mix_Brand_price_freatures.md` §7. The counting rules come from the same proposal's §8:
- a person counts once, however many Mixes they are in;
- a reusable Mix counts once, whatever its audience;
- stored contacts don't count until follow-up is on for them;
- reaching a limit restricts new additions, never access to what the account already has.

**Payment provider.** The charging question named Stripe's hosted checkout, which the launch plan already prefers (`docs/PRODUCTION_LAUNCH_PLAN.md:23,90`). Stripe's fees, from https://stripe.com/pricing, checked 2026-09-29: 2.9% + 30¢ per successful domestic card payment, plus 0.7% of Billing volume for subscriptions. There are no setup or monthly fees. Stripe Tax, if chosen later, costs 0.5% per transaction or $90 a month.

## What it changes

- The standards: JITM-01 §2.9, §2.20, §2.22, §4 and §6; JITM-02 §2.16, §2.18 and §6; WF-03; the `jitm-copy` skill.
- Public copy: the FAQ cost answer states the plans, and a new pricing page (`/pricing`) lists them.
- The O8 question in JITM-02 §6 is answered: "Prices after the beta haven't been set." is replaced by the prices.
- Later changes, each switched off until Kevin chooses the start date:
  - Stripe checkout, the billing portal and plan records;
  - the limits.

## Still open before charging starts

- The start date.
- What happens to beta accounts when charging starts: they could stay free, move to Free with its limits, or get a grace period.
- Sales tax.
- Refunds, cancellation timing, the grace period after a failed payment, and deleting an account that has a paid plan.
- Activating Stripe for live payments: business details, payouts and receipts.

## Public copy in this change, for Kevin's approval

**FAQ, "Does it cost anything to join?"** (`src/app/faq/page.tsx`)
- Before: "Not during the beta. Joining the waitlist and creating your account are free, and no card is required. Prices after the beta haven't been set."
- After: "Not during the beta. Joining the waitlist and creating your account are free, and no card is required. Paid plans haven't started yet. When they do, the plans are Free ($0), Plus ($15 a month) and Pro ($29 a month), and you're charged only if you choose a paid plan. See the plans." The last sentence links to `/pricing`.

**Pricing page** (`src/app/pricing/page.tsx`; the plans themselves are in `src/lib/plans.ts`)
- Title and heading: "Plans and pricing". Description: "Jump in the Mix is free during the beta, with no card required. When paid plans start: Free at $0, Plus at $15 a month and Pro at $29 a month."
- Opening: "Free during the beta, with no card required. Paid plans haven't started yet; these are the plans when they do."
- The plans:
  - Free: "$0", "No card needed", "Start with a small group of people.", "Up to 100 people with follow-ups", "Up to 3 active Mixes".
  - Plus: "$15 a month", "or $144 a year", "For a growing list of clients.", "Up to 1,000 people with follow-ups", "Up to 25 active Mixes".
  - Pro: "$29 a month", "or $288 a year", "For a large book of clients and many Mixes.", "Up to 5,000 people with follow-ups", "Up to 100 active Mixes".
- Under the plans: "Prices are in US dollars. You're charged only if you choose a paid plan."
- "Every plan includes":
  - "Today: who to contact next, with each message prepared for you to review and send yourself."
  - "Contacts with notes, saved dates and file import."
  - "Mixes with text, email and call versions of every Beat."
  - "Ready-made Mixes, Mega-Mixes and the Marketplace."
  - "The Journey map and the Calendar."
  - "Quick Add, typed or spoken."
  - "Exporting your data or deleting your account."
- "How the limits count":
  - "A person counts once, however many Mixes they're in."
  - "A Mega-Mix counts as one Mix."
  - "Contacts without a follow-up don't count, so importing your address book uses none of your limit."
  - "Reaching a limit never removes anything. Your contacts, Mixes and history stay; you can add more once you're under the limit or on a larger plan."
- Closing: "Free beta. No card required." with "Join the waitlist", and a link to the FAQ.
- The public footer adds "Pricing" after "Questions".

**Claims ledger (JITM-04 §2.26, §2.28)**

| Claim | Type | Proof | Status |
| --- | --- | --- | --- |
| The three plans, their prices and yearly prices | Price | Kevin's choices above | Decided by Kevin; the wording awaits his approval |
| The limits and how they count, including "a Mega-Mix counts as one Mix" | Price and product | Kevin's choices; his proposal §8 | Decided; enforced only once charging starts, in a later change |
| "Paid plans haven't started yet" | Price | Nothing can be bought: there is no checkout in production | Verified |
| "You're charged only if you choose a paid plan"; "No card needed" for Free | Price | Charging will need a checkout the owner completes for a paid plan; Free needs none | Design of the checkout change; needs Kevin's approval |
| "Reaching a limit never removes anything…" | Product promise | Kevin's proposal §8: limits restrict new additions, never access | Needs Kevin's approval; implemented with the limits |
| "Every plan includes" items | Product | Shipped features in JITM-01 §2.22 | Verified |
| "Free beta. No card required." | Access | JITM-02 §2.16, §2.18, D28 | Verified |

The page describes no offers in structured data, keeps prices out of the social card, and names no start date, trial, discount or treatment of beta accounts.

**This change:** branch `copy/show-prices-20260929`, pull request #103, stacked on #98.
