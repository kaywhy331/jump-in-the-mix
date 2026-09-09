**Jump in the Mix homepage: design and conversion audit — September 7, 2026**

The homepage has a promising identity and a useful interactive sample, but its current composition needs another design pass. It adapts to different widths without horizontal overflow; it does not yet use the available space effectively. The strongest opportunities are navigation spacing, hero proportions, a shorter route to trying the sample, consistent audience messaging, and evidence that makes signup feel worthwhile.

“Award winning” is a subjective design ambition. “High converting” requires visitor and activation data. This audit establishes observable usability issues and testable conversion hypotheses; it does not assign an invented conversion score or predict a percentage uplift.

The live target was https://jump-in-the-mix-test.netlify.app/. Measurements came from authenticated Chromium sessions, rendered DOM geometry, keyboard interaction, axe, browser performance APIs, and the corresponding source. There were no screenshots, videos, or performance traces. This is not a screenshot-based art-direction review, physical-device certification, or a study of actual customer behavior. The private test banner adds 37px at the representative phone and desktop sizes below. Its authentication gate and `noindex, nofollow` response are intentional test-site protections.

**What is already worth keeping**

- “Build relationships. Keep them strong.” expresses the intended outcome and includes business, networking, and personal relationships.
- The editable sample demonstrates something visitors can actually do. Its text, email, and call actions are more concrete than a feature list.
- The fictional Alex Example contact, non-working email domain, obvious fake phone number, and solo-professional voice match the intended experience. Both call steps have four short reminder bullets.
- The underlying palette, shared controls, rounded surfaces, and restrained background create a coherent foundation. Light and dark modes are supported.
- The page loads reasonably quickly in the measured conditions. It does not need a large decorative video or animation to explain its value.

**Measured layout**

Positions are CSS pixels from the document top on a fresh visit, with the default Lead sample and its plan overview collapsed. “Hero signup” means the Start free button beside/before the demo; a separate Create account button remains available in the header.

| Viewport | Header height, excluding banner | Hero signup top | Sample top / height | Open text app top | How it works begins |
| --- | ---: | ---: | ---: | ---: | ---: |
| 320 × 568 | 154 | 701 | 915 / 1,157 | 1,770 | 2,120 |
| 390 × 844 | 154 | 646 | 859 / 1,062 | 1,639 | 1,969 |
| 768 × 1,024 | 82 | 459 | 591 / 967 | 1,359 | 1,646 |
| 1,024 × 768 | 88 | 872 | 189 / 1,000 | 953 | 1,277 |
| 1,280 × 800 | 88 | 894 | 189 / 982 | 953 | 1,259 |
| 1,440 × 900 | 88 | 896 | 189 / 982 | 953 | 1,259 |

No document-level horizontal overflow was found at 12 widths: 320, 360, 390, 430, 600, 768, 900, 1000, 1024, 1280, 1440, and 1920px. The full page is approximately 4,223px tall at 390px width and 2,736px tall at 1440px. Length alone is not a defect; the concern is how much of that length visitors must traverse before reaching a useful interaction or another signup opportunity.

**Priorities and recommendations**

| Priority | Finding | Recommended change | Confidence |
| --- | --- | --- | --- |
| First | Header links run together; phone header wraps awkwardly | Give public navigation an explicit responsive layout and spacing | Directly measured |
| First | Desktop hero CTA falls below common first viewports | Top-align hero copy and rebalance heading size against column width | Directly measured; browser experiment supports fix |
| First | Demo requires extensive scrolling; secondary CTA skips it | Present a compact first interaction, retain deeper plan exploration, and link directly to the sample | Placement measured; conversion benefit to test |
| Next | Broad hero promise becomes business-only content | Carry business, networking, and personal examples through the next sections | Direct content finding |
| Next | Little reassurance or evidence near signup | Clarify the actual offer and sending behavior; add authentic product/customer evidence | Content finding; effect to test |
| Next | Conversion is not being demonstrated by available data | Measure signup and first useful follow-up, including the demo's role | No first-party funnel instrumentation found in reviewed source |
| Polish | Repeated card treatment and incomplete sharing metadata | Establish a more distinctive product story and deliberate public metadata | Design judgment and source findings |

**1. Fix the public header as a component.**

The homepage `<nav>` has no class or matching layout rule. The stylesheet defines `.public-nav`, but this element does not use it. In the live browser the navigation is `display: block` with a normal gap; the “How it works” link ends at exactly the x-coordinate where “Features” begins. At 390px the brand shrinks to about 98px wide and wraps, while the navigation occupies several rows. The resulting 154px header takes substantial space before visitors reach the headline.

On desktop, use deliberate gaps and aligned navigation controls. On phones, give the brand sufficient room and choose a compact composition with one prominent signup action and an accessible route to Sign in and section links. Simply applying the existing class is insufficient: its current mobile rule hides it entirely. Keep touch targets comfortably sized; 44px is a useful design target here. WCAG 2.2's AA target minimum is 24 × 24 CSS pixels with exceptions, so the observed 22px inline links should not be presented as an automatic conformance failure. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

Relevant source: [homepage header](../src/app/page.tsx), [public navigation CSS](../src/styles/base.css).

**2. Rebalance the hero without replacing the relationship headline.**

At 1440px, the heading is 75.2px in a 538px column and breaks into four lines: “Build / relationships. / Keep them / strong.” It occupies about 313px vertically. The neighboring demo is about 982px tall, and the hero vertically centers the copy against it. Consequently, the headline starts around y=423 and the Start free button starts around y=896, with its bottom at y=940. At 1280 × 800 and 1024 × 768 the hero signup button is entirely below the initial viewport.

A temporary browser-only experiment top-aligned the copy and used a 60px desktop heading. With the same wording, the heading took two lines and the signup button moved to approximately y=525, ending around y=569. This demonstrates a practical direction; it is not a finished responsive specification or a deployed change. Tune the heading, column proportions, and spacing together at the 1000/1024px transition, where the layout currently switches abruptly from stacked to side by side.

On mobile, shorten the supporting paragraph and avoid repeating the same audience promise immediately below it. Preserve readable body text and comfortable buttons. A possible shorter supporting paragraph is: “Keep your contacts, thoughtful follow-ups, and next steps in one simple daily list. Make time for the people who matter to you and your business.”

Relevant source: [hero composition](../src/app/page.tsx), [hero alignment](../src/styles/base.css), [responsive heading and columns](../src/styles/product.css).

**3. Make the interactive sample easier to discover and finish.**

At 390 × 844, the demo begins just below the first screen at y=859. Its first native-app action is at y=1639. The control sequence includes the sample heading, contact details, phase choices, phase description, step selector, previous/next navigation, step heading, message editor, and then the app action. These are useful capabilities, but exposing them all at once makes a small demonstration feel like a full form.

Keep the requested Lead, Quote, and Completion scenarios and all 13 steps. Show one ready-to-try contact, message, and channel action immediately; make step navigation and the full sequence a clearly labeled expansion. The existing full-plan disclosure provides a starting point. Calls should retain their short visible reminder bullets. Avoid making the whole mobile card an independently scrolling panel.

The hero's “See how it works” link currently scrolls to the explanatory section *after* the entire sample. Change its destination and wording to make the interactive experience discoverable, such as “Try the sample,” while retaining a separate How it works section link. Add a contextual signup invitation after the sample, such as “Create your first follow-up.” The current next main-content signup appears near y=3890 on the representative phone.

Keep the native app handoffs and copy fallback. Provide an obvious path back into signup for visitors who return from their messaging app. An app-opening request is a demo interaction, not evidence that a message was sent or that the visitor converted.

Relevant source: [demo component](../src/components/ProductDemo.tsx), [sample content and action URLs](../src/lib/product-demo.ts).

**4. Carry the audience promise through the entire page.**

The hero and registration page include business, personal connections, and networking. The homepage then asks visitors to “Add a customer,” introduces estimates and finished jobs, and says “Be the business people remember.” The business demo can remain a detailed solo-professional example; the surrounding page should make the other use cases equally understandable.

Use three short parallel examples: following up on a customer inquiry, continuing a conversation after an introduction, and checking in with someone personally important. Then explain the shared mechanism: one contact, a thoughtful next step, and a reminder in Today. “Be someone people remember” is one possible replacement for the business-only section heading. Test whether visitors can explain both who this is for and what the product actually does after a brief visit.

The core differentiator also needs stronger evidence. A contact list is familiar; the valuable part is seeing who needs attention, having the context, and knowing what to say next. A compact, accurate representation of Today would help connect the message demo to the actual daily workflow.

**5. Make signup feel justified and predictable.**

There are currently no customer testimonials, case examples with demonstrated outcomes, or visible FAQ on the homepage. The section styled as `trust-grid` contains feature claims, not independent proof. There is also no public privacy/terms link in the homepage footer. For a product that holds relationship details, a plain-language explanation of data handling and user control would help visitors assess it.

Add authentic evidence as it becomes available: a real pilot user's specific experience, a clearly identified founder explanation, or a concrete walkthrough of the product doing the promised work. Keep fictional demo content clearly distinct from customer evidence. Do not manufacture endorsements, usage numbers, or results.

Use consistent signup language across the header, hero, and closing section. Clarify what “Start free” actually includes once the offer is established. The observed registration page requests name, email, and password; this alone does not establish ongoing free-plan terms. A small FAQ can answer whether messages send automatically, whether personal/networking use is supported, how people bring in existing contacts, and what happens after signup. Replace “When available” automation wording with a precise statement of current availability when confirmed.

**6. Aim for a distinctive, coherent product story.**

The present page relies on a large headline, rounded sample card, three explanatory cards, and three benefit cards. It is coherent, but the repeated treatment gives limited visual emphasis to the product's unique value. The most useful design refinement would connect the relationship promise to a recognizable Today workflow and the interactive contact. Use a consistent spacing rhythm and deliberate line breaks; give each section a clear role.

Recommended reading order: compact navigation; relationship headline and signup; immediately useful sample; business/personal/networking examples; the contact-to-Today workflow; authentic proof and practical questions; final signup invitation. On desktop, the first sample can sit beside the hero. On mobile, its compact first interaction should follow the hero, with deeper exploration available on demand. Extra animation should serve comprehension and respect reduced-motion settings.

**Technical and accessibility evidence**

| Check | Result | Interpretation |
| --- | --- | --- |
| Responsive layout | No horizontal overflow at 12 widths, 320–1920px | Good width fit; vertical composition still needs work |
| Automated accessibility | Zero violations across 12 full-page axe scans: 390/1440px × light/dark × text/email/call samples | Useful baseline; gradient text contrast was flagged for manual review |
| Keyboard | Fourteen sequential focus stops checked; settled focus remained visible with a 3px outline, including the radio's visible label | Basic default-sample navigation works |
| Reduced motion | Smooth scrolling disabled and transitions reduced when requested | Preference is respected |
| Demo contents | All 13 steps expose the expected `sms:`, `mailto:`, or `tel:` link; fictional recipients retained; both calls have four reminders | Native OS apps were not launched and no messages were sent |
| Signup destination | Live registration form available; no horizontal overflow at 390px | Form was inspected, not submitted |
| Runtime | No uncaught page errors in the main layout/a11y session | Not a claim that every network or application workflow is healthy |

The audit does not certify screen-reader behavior, actual browser zoom, mobile keyboard behavior, or Safari/Firefox rendering. Narrow-width reflow is useful evidence, but it is not a substitute for those checks. Formal accessibility also needs manual checks beyond automated rules. [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [text resizing guidance](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

**Performance measurements**

Three fresh browser contexts per profile, HTTP cache disabled, service workers blocked, private-site authentication enabled. Desktop used 1440 × 900 with no artificial slowdown. The mobile profile used 390 × 844, touch/mobile emulation, 4× CPU slowdown, 150ms configured latency, approximately 1.6Mbps download and 750Kbps upload. These are synthetic lab conditions on the test environment.

| Metric | Desktop | Simulated mobile |
| --- | ---: | ---: |
| Median largest contentful paint | 0.892s | 1.380s |
| LCP range over three runs | 0.888–0.988s | 1.360–1.440s |
| Median time to first byte | 0.494s | 0.524s |
| Median observed demo-ready time | 1.151s | 2.311s |
| Observed load layout shift, excluding recent input | ~0.000014 | 0 |
| Largest recorded sample interaction duration | 48ms | 104ms |
| Median navigation + measured resource transfer | ~181KB | ~181KB |

The heading was the LCP element in every run. The first run in each profile transferred approximately 142KB of encoded JavaScript and 27KB of encoded CSS. Mobile startup included a long task as large as 264ms. The later demo-ready time and startup work are worth monitoring, but these measurements do not make loading speed the leading redesign priority.

Google's good-experience thresholds are LCP ≤2.5s, INP ≤200ms, and CLS ≤0.1, evaluated at the 75th percentile of real visits. The observed sample interaction durations are **not field INP**. Short load-window layout observations and six synthetic page loads do not establish a Core Web Vitals pass for the customer population. [Google Web Vitals guidance](https://web.dev/articles/vitals)

**Discovery, sharing, and measurement**

The live page has the generic title “Jump in the Mix,” a small-business-only meta description, and no observed canonical, Open Graph, or Twitter-card metadata. Before a public launch, define a useful homepage title, an audience-consistent description, the intended public canonical URL, and a branded sharing image. Preserve the private test site's indexing protections. Relevant source: [root metadata](../src/app/layout.tsx).

No first-party homepage funnel or Web Vitals reporting was found in the reviewed source. No external analytics account or real conversion dataset was supplied, so an external deployment-level analytics setup cannot be ruled out. Establish a baseline for homepage visit → signup start → account creation → first contact and useful follow-up. Treat the final step as activation; raw signup count alone can reward low-quality traffic.

Record sample engagement and native-handoff requests separately, without recording edited message content or contact details. Compare engaged visitors' eventual signup and activation with the rest of the funnel, while recognizing that engagement correlations do not prove causation. Test the compact hero/demo against the current experience when traffic supports a meaningful comparison. Segment mobile and desktop; do not assume an improvement on one transfers to the other. Small moderated usability sessions across solo business owners, networking users, and personal-use visitors can uncover comprehension issues before an A/B test has enough traffic.

**Suggested acceptance criteria for the next design pass**

- Distinct, spaced public navigation at every breakpoint; brand and signup action remain legible.
- Hero signup visible without scrolling at representative 390 × 844, 1280 × 800, and 1440 × 900 viewports, without reducing body readability.
- No horizontal overflow at 320–1920px; verify browser zoom, keyboard, mobile keyboard, and at least one real iOS and Android device separately.
- A direct route to the sample, an immediately understandable first interaction, and a clear signup invitation after it; all three scenarios and native actions retained.
- Business, personal, and networking visitors each see a relevant example before the final CTA.
- Offer details and trust claims are accurate; any customer evidence is authentic.
- Baseline signup/activation measurement and real-user performance data are in place before claiming conversion success.

Raw local evidence and reproducible audit scripts are in `.artifacts/homepage-audit-2026-09-07/`: `audit.json`, `interactions.json`, `audit.mjs`, and `interaction-checks.mjs`. Those scripts use the existing private test credentials without embedding them in this report. This work added the audit document; proposed page changes remain recommendations.
