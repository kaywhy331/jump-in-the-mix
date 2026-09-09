# Sales plan library — September 5, 2026

The ready-made library adds 20 original plans: 10 adaptable plans and 10 industry examples. Users can filter by business type, goal, and sales approach, or search by an author's name. Industry filters include the adaptable plans. Each plan includes an audience, a starting condition, preparation advice, message previews, and source attribution.

The selection combines established discovery methods with more recent work on buyer indecision, positioning, and transparent buyer education. Public primary sources were checked on September 5, 2026. The precise messages, channel choices, and day offsets are original editorial adaptations. They have not been validated as optimal cadences by the cited authors, and the library makes no conversion-rate or neuroscience claims.

## Approaches and sources

| Approach | Author / organization | Applied principle | Primary source |
| --- | --- | --- | --- |
| NEPQ | Jeremy Miner / 7th Level | Explore the customer's situation and reasons for change with calm questions before proposing a solution. | [Our methodology](https://7thlevelhq.com/our-methodology/) |
| SPIN Selling | Neil Rackham / Huthwaite International | Connect a relevant problem, its consequences, and the value the buyer places on improvement. Research known facts before asking. | [SPIN Selling](https://www.huthwaiteinternational.com/sales-training/spin-selling), [complete guide](https://www.huthwaiteinternational.com/blog/complete-guide-to-spin-selling) |
| Sandler | David Sandler / Sandler | Agree on the purpose of a conversation, test fit, understand resources and decision roles, and make next steps mutual. | [Sandler Selling System](https://sandler.com/sandler-selling-system/) |
| The JOLT Effect | Matthew Dixon and Ted McKenna | Address a willing buyer's uncertainty about choosing or implementing; make a reasoned recommendation and explain real safeguards. | [About the book](https://www.jolteffect.com/about-the-book) |
| Tactical empathy | Chris Voss / The Black Swan Group | Listen, reflect the buyer's perspective tentatively, and use open questions to understand concerns. | [Tactical empathy resources](https://www.blackswanltd.com/newsletter/topic/tactical-empathy) |
| Sales Pitch / positioning | April Dunford | Compare realistic alternatives against the buyer's priorities and verify the differences that matter. | [Books](https://www.aprildunford.com/books), [positioning practice](https://www.aprildunford.com/) |
| They Ask, You Answer / Endless Customers | Marcus Sheridan / IMPACT | Make buying easier through accurate answers about price, alternatives, limitations, and expectations. Includes the 2025 Endless Customers evolution. | [Endless Customers](https://www.endlesscustomers.com/), [They Ask, You Answer](https://www.impactplus.com/what-is-they-ask-you-answer) |

These methods are not all drip-campaign frameworks. The application adapts their conversation and evaluation principles into follow-up reminders; more involved discovery remains a live conversation. Dunford's work focuses on B2B technology, so its consumer examples are explicitly presented as adaptations.

## Plan inventory

Day 0 is the first activation day for a new manual-start draft, not the day it was imported or necessarily the original inquiry or estimate date. Each plan's starting guidance explains when to begin. Resuming a paused plan retains its existing schedule. Times use the account's scheduling and timezone rules.

| Plan | Business type | Approach | Days |
| --- | --- | --- | --- |
| New inquiry: understand what matters | Any business | NEPQ | 0, 2, 4, 7, 12 |
| Estimate sent: explore the decision | Any business | NEPQ | 0, 3, 7, 12 |
| Discovery: connect the problem to value | Any business | SPIN | 0, 2, 5, 9, 14 |
| First conversation: agree on mutual fit | Any business | Sandler | 0, 2, 5, 9 |
| Not now: a respectful restart | Any business | Sandler | 0, 7, 21 |
| Ready but unsure: make the choice clearer | Any business | JOLT | 0, 2, 5, 9 |
| A concern comes up: listen before answering | Any business | Tactical empathy | 0, 2, 5, 10 |
| A conversation goes quiet: reopen gently | Any business | Tactical empathy | 0, 4, 10, 21 |
| Researching a purchase: answer the hard questions | Any business | Transparent buyer education | 0, 3, 7, 12 |
| Comparing options: find the right fit | Any business | Positioning | 0, 3, 6, 10 |
| Home-service estimate: scope, timing, confidence | Home services | NEPQ | 0, 3, 6, 11 |
| Home buyer: priorities before property lists | Real estate | SPIN | 0, 2, 5, 10 |
| Renewal: understand the choices | Insurance & finance | JOLT | 0, 3, 7, 14 |
| Professional-services proposal: agree on the next step | Professional services | Sandler | 0, 3, 7, 12 |
| After a demo: resolve the buying uncertainty | B2B & technology | JOLT | 0, 3, 6, 10, 15 |
| Vendor shortlist: compare against the real alternatives | B2B & technology | Positioning | 0, 3, 7, 12 |
| A considered purchase: price, fit, and aftercare | Retail & ecommerce | Transparent buyer education | 0, 3, 7, 12 |
| Auto repair estimate: understand the hesitation | Automotive | Tactical empathy | 0, 2, 5, 9 |
| Wellness inquiry: goals, comfort, and fit | Health & wellness | NEPQ | 0, 3, 6, 11 |
| Home seller: compare the paths forward | Real estate | Positioning | 0, 3, 7, 12 |

## Using and maintaining the plans

- Select the relevant audience and starting moment. These are primarily warm-inquiry, existing-conversation, or client-review plans.
- Import as a draft, review the prepared content, and adapt it to the business's actual offer and the person's situation. SMS and email use supported name and signature placeholders. No message requires an invented statistic, testimonial, deadline, or missing document link.
- Remove questions already answered. When someone replies, books, declines, or opts out, stop the plan for that person from their contact page and agree on a suitable next step. The app does not detect inbound replies or branch a sequence automatically.
- An active plan follows the account's automatic-sending settings if those are enabled. Phone calls stay manual. Merely publishing or importing a draft does not send messages.
- Industry examples keep sensitive details in an appropriate conversation and ask owners to verify relevant terms, prices, capabilities, and claims before use.
- `publishReadyMadePlans` updates library originals by stable ID and increments their version on a change. Re-running with identical content is a no-op. A customer's imported plan and message versions remain independent.

Catalog source: `src/lib/sales-plan-library.ts`. Approach summaries and primary-source links: `src/lib/sales-approaches.ts`.
