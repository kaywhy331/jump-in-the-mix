# Jump in the Mix — Homepage UI/UX and Conversion Blueprint

Design proposal · September 10, 2026

## 1. The direction

**Creative concept: The Conversation Continues.**

Create a human, editorial website in which a recognizable work moment becomes an interactive follow-up. Do not build a conventional feature catalogue with a cinematic video added above it.

The persuasion sequence is:

Recognize a situation → see the relevant context → try one next action → understand the practical benefit → request access.

The homepage is the broad entry point. The profession pages enter the same experience with the appropriate situation already selected. The underlying interface stays consistent.

This document proposes experiences to build. It does not assert that profession-specific demos, state persistence, or the redesigned conversion flow already exist.

### Scope and content budget

Use five short chapters, plus a compact header and footer. Target approximately 250–350 visible marketing words along a default path, excluding editable sample messages and expanded questions. This is a design target, not a conversion benchmark. Do not remove material access, cost, or data-handling information to meet it.

Every section must earn its place by answering a different visitor question. Do not create additional sections merely because a template offers them.

## 2. Information architecture

| Route | Entry experience | Primary next action |
|---|---|---|
| `/` | Broad human story; one available default example; five visible audience choices | Try the demo |
| `/for/real-estate-agents` | Buyer who asked to reconnect later | Try the agent example |
| `/for/consultants` | Business discussion deferred until after hiring | Try the consultant example |
| `/for/photographers` | Pricing conversation interrupted by editing work | Try the photographer example |
| `/for/painting-contractors` | Open estimate interrupted by the next job | Try the estimate example |
| `/for/independent-recruiters` | Candidate who requested later contact | Try the recruiter example |

Use actual, shareable profession pages rather than relying exclusively on a homepage dropdown. Campaign traffic should go directly to its matching page. Visitors already on the homepage may change the example in place without another page load.

### Header

Logo and name at left. At right: Examples, Sign in, Join the waitlist. Examples moves to the demonstration area. Join the waitlist moves directly to the access form. Preserve a direct access-request path for people who do not want a tour.

Mobile: compact logo, Sign in or a clearly labeled menu, and a discoverable route to the waitlist. Do not turn the header into a permanent stack of navigation and banners.

### Footer

Small brand line, profession-page links under one compact grouping, Privacy, Terms, Contact, and Sign in. No invented customer logos or unused resource categories.

## 3. Visual system

### Proposed mood

Warm, capable, and observant. Real working environments, natural light, ordinary tools, and moments between responsibilities. Not corporate stock handshakes, luxury-business theatre, or portraits of distressed people failing at work.

Preserve the recognizable existing logo. The following palette is a proposal, not a statement about the current brand specification:

- Warm ivory: `#F5F2EA` for quiet reading surfaces.
- Deep green-black: `#182D28` for type and primary actions.
- Muted natural tones from the photography.
- A restrained light citrus accent: `#DCE99B` for selection or small emphasis, not pale body text.

Validate all actual text/background combinations and interactive states for contrast before release.

### Composition

Use wide cinematic media, large but readable headlines, generous negative space, and a small number of real interface surfaces. Avoid repeated equal-sized feature cards. Let the photograph occupy the frame instead of boxing every image inside a rounded rectangle.

Give each scene a single context label. The label can visually relate to the selected contact in the demo. It must be ordinary HTML text, not important information embedded only in video pixels.

### Typography and spacing targets

Use a distinctive, readable display face with a compatible interface face. Two families maximum. Suggested starting sizes: 64–88px desktop hero heading, 40–48px mobile hero heading, 18px supporting text, and comfortably readable demo text. These are responsive starting points, not fixed sizes that must fit every viewport.

Target 1120–1280px maximum reading/interface width on large displays, while selected photographs can extend wider. Use 20–24px mobile page padding. Let sections grow naturally rather than forcing every section into a full viewport.

### Brand language

Keep Mix as an understandable product term, introduced after the value is clear: “A Mix is a follow-up plan you can reuse.” Do not turn the site into a literal music-player interface or require visitors to learn musical terminology before trying it.

## 4. Chapter one — Recognition

### Visible copy

Eyebrow: A follow-up app for independent professionals.

Headline: **Good conversations deserve a next step.**

Supporting line: Remember who to contact, what you discussed, and how to pick up where you left off.

Primary button: **Try the demo**

Secondary text link: **Join the waitlist**

Microcopy: Fictional contacts. No account needed. Nothing sends from the demo.

### Layout

Use a full-width editorial composition rather than the standard copy-left/floating-dashboard-right layout. Put the headline and action on a stable surface above or beside the upper edge of a large film frame. Keep the primary action visible without requiring video playback.

A first-time visitor must understand that this is follow-up software even when the video is paused, unavailable, or never played.

### Film brief

An approximately 8–10-second, silent-first edit: a warm professional conversation ends; the owner moves into their next responsibility; one specific commitment remains; a clear next action is introduced.

A possible broad-homepage edit uses a property doorway, an editing desk, and a consultant closing a call. Use consistent light and camera language so it feels like one campaign, not a stock-footage montage. Do not attempt to communicate all five professions in ten seconds.

The final frame can carry a small HTML example label: “Chris · Asked me to check back in September.” Mark this as an illustrative example, not a real inbox event.

The essential idea is a transition between responsibilities, not a shame-based before-and-after.

### Motion behavior

Display the optimized poster immediately. If motion is enabled, a muted inline sequence may play once and settle on its final frame. Provide pause/play controls. Never require watching to proceed. Reduced-motion visitors receive the equivalent still composition and can choose to play a clip deliberately.

## 5. Chapter two — Find the familiar situation

### Visible copy

Headline: **Where did the conversation leave off?**

Subline: Choose an example that feels like your work.

### Choices

| Audience label | Scene caption | Shot direction | Default example |
|---|---|---|---|
| Real estate | They said, “Maybe after summer.” | Agent finishing a viewing and moving to the next appointment | Buyer requested a later text |
| Consulting | The project could wait. Client work couldn’t. | Consultant ending a call and returning to a deliverable | Revisit onboarding after hiring |
| Photography | Pricing sent. Back to editing. | Photographer switching from a pricing email to a gallery | Clarify coverage options |
| Painting | Estimate sent. Next job started. | Owner completing an estimate, then returning to the job | Clarify the quoted scope |
| Recruiting | No open role. Still worth staying in touch. | Recruiter ending a professional call and noting preferred timing | Candidate requested later personal email |

These scenes are creative applications of the supplied fictional profiles, not validated customer behavior or testimonials.

### Interaction

Desktop: use one large active scene and five small, readable photo choices. Only one scene can play. Nonselected scenes remain still images.

Mobile: keep all audience labels discoverable in wrapped controls or a compact, labeled selector. Do not make a hidden horizontal carousel the only navigation mechanism. The active visual and demo stack vertically.

Default the general homepage to a clearly labeled real-estate example for the initial test. Do not pretend to have inferred the visitor’s profession. The user can change it; profession-specific links can preselect it.

Clicking a choice changes the active context and demo. No separate quiz, account requirement, or mandatory film playback. Keep the headline area and frame dimensions stable so the page does not jump.

## 6. Chapter three — The scene becomes the product

This is the signature interaction. The selected scene’s context label becomes the contact/context area of a live demo, using a brief shared-element transition where supported. Use an immediate change for reduced motion or as a fallback.

Do not tie completion to scroll speed. Keep ordinary page scrolling. Desktop animation is an enhancement; the interface must remain understandable without it.

### Visible copy

Headline: **Pick up where you left off.**

Instruction: Review the context. Make the message yours. Choose what happens next.

### Example: real estate

Contact: Chris Parker — fictional contact.

Context: Asked for a September text about a possible move after summer.

Channel: Text.

Editable draft:

“Hi Chris—you asked me to check back after summer about a possible move. Is that still on your mind, or has the timing changed?”

Keep this to one contact, one context snippet, one editable message, and one primary action at a time. No full navigation sidebar, import form, analytics counters, or multi-column account dashboard.

### Proposed demo states

| State | Visitor sees | Primary action | Truth boundary |
|---|---|---|---|
| Ready | Chosen contact, context, editable sample draft | Preview message | No account access or message transmission |
| Preview | Their edited message in a clean preview | Choose next step | This is a preview, not an outgoing-message screen |
| Next step | A choice to set a review date or leave it for now | Save demo next step | Changes only the sandbox scenario |
| Complete | Chosen next step shown clearly | Join the free-account waitlist | No fictional reply, booking, or delivered-message claim |

Completion copy: **A next step is in place.**

Supporting copy: Demo only. Nothing was sent or scheduled in an account.

Then: **Now picture this with your people.**

Primary action: Join the free-account waitlist.

Secondary action: Try another situation.

### Safety and control

Use fictional contacts only by default. Do not ask visitors to paste real client information into the public sandbox. Do not launch SMS, email, or phone applications from this redesigned marketing demo. Separate sample context from recipient-facing text. Provide Reset example and a way to go back without losing edits within the active session.

A selected profession or template may be carried into the access flow. Do not retain private draft edits for analytics or silently transfer demo contacts into an account.

## 7. Chapter four — The practical payoff

### Visible copy

Headline: **A few thoughtful follow-ups. Then back to your day.**

Supporting line: Keep the next step somewhere other than your head.

### Visual

Return to the same professional from the selected scene: the photographer resumes editing, the agent closes the phone before the next appointment, or the owner puts their device away while safely stationary.

Use a still or a short quiet clip, not another explanatory video. The desired impression is that a commitment has a place. Do not fabricate instant responses, bookings, revenue changes, or measured time savings.

### Future customer proof

When genuine evidence exists, use this same chapter for one short customer story tied to the selected workflow. Label the customer accurately, obtain permission, and show what they actually did. Do not append a second wall of testimonials.

Until then, keep the illustrative story clearly distinct from customer evidence.

## 8. Chapter five — Access and reassurance

### Visible copy

Headline: **Who have you been meaning to get back to?**

Supporting line: Start with a few people. Not a whole new system.

Visible field label: Email address.

Button: **Join the free-account waitlist**.

Access disclosure: Accounts open by invitation. Confirm your email to join the waitlist; we’ll email you when you’re invited. No payment card needed.

The public site reviewed for this proposal uses invitation-based accounts. Do not replace this language with immediate-start promises unless actual access changes.

### Form design

Place the form on a quiet, high-contrast surface. A cropped still from the selected work scene can sit nearby on desktop; on mobile, keep the form visually simple. Use a persistent visible field label and clear inline error text. Do not replace the email input with a multi-step qualification survey.

No exit-intent interception, countdown, invented queue position, or forced referral task.

### Success and recovery states

| State | Proposed copy / behavior |
|---|---|
| Invalid email | “Enter a complete email address.” Preserve the typed value. |
| Submission in progress | Disable duplicate submission and show a short submitting state. |
| Temporary failure | “We couldn’t submit that. Your email is still here—please try again.” |
| Confirmation email requested successfully | “Check your inbox to confirm your email.” Do not say the account exists. |
| Waiting for confirmation | Show the entered email, Change email, and a resend action with an honest cooldown. |
| Email confirmed | “You’re on the confirmed waitlist. We’ll email you when you’re invited.” |
| Confirmation link expired | Offer a new confirmation email, not a generic dead-end page. |
| Invited | Invitation opens the actual account-creation flow. Preserve only the relevant chosen template context. |

Submission and confirmation are different conversions. Neither should be counted as an activated account.

### Compact questions

Place three or four expandable questions beneath the form. Keep material access restrictions visible above it.

- Will it send messages for me? Explain the actual default review-and-send workflow and distinguish configured optional sending from the sandbox.
- Do I need to move everything? Explain a small manual start; do not imply integrations that have not been verified.
- What happens after I join? Explain confirmation and invitation, with a link or expansion for the current invitation policy.
- What happens to my information? Give a short accurate explanation linked to the current privacy information.

## 9. Invitation to first useful action

After a real invitation and account creation, return to the situation the person tried. Offer the associated Mix as an editable starter, not an automatically enrolled campaign.

First onboarding prompt: **Who is one person you meant to get back to?**

Ask for the minimum useful information: name, appropriate contact method, relevant context, and the next step or agreed timing. Make importing a larger contact file optional and available later. Do not gate the first useful action on a provider connection or a complete database migration.

Present a draft for review. When handing off to the user’s own messaging application, record an app-open event separately from any confirmation of sending. On return, ask whether the user sent it; allow “Not yet.” Do not treat opening another app as proof of sending, delivery, or reply.

After the first real follow-up, offer to add a few more people. Do not force five contact records before the user can experience value.

## 10. Mobile, accessibility, and resilience

- Use normal vertical scrolling and native-feeling controls. No drag-only interaction, hover-only instructions, scroll trapping, or required precision gestures.
- Keep the primary action above long media where possible. A mobile bottom action may appear after the hero button leaves view, but must hide while the visitor is using the demo, editing a field, or viewing the form. Reserve space so it never covers content.
- Provide generous touch areas; 44px is a proposed minimum design target, not a claim about the minimum required by every standard.
- Use real headings, labeled buttons, visible keyboard focus, and correct tab order. Announce meaningful demo and form state changes accessibly without reading out every animation.
- Support keyboard operation of audience selection, draft editing, next-step choices, and form recovery.
- Respect reduced-motion preferences and offer pause/play for moving content. Never autoplay sound. Caption speech and provide text alternatives when a clip conveys essential information.
- Ensure reading order and context survive without animation. With JavaScript unavailable or failing, retain the message, example preview, and a functional server-backed route to request access.
- Reserve media dimensions to avoid layout movement. Serve an optimized, promptly loaded hero poster. Defer secondary video and inactive scenario downloads. Stop media when offscreen or when the page is hidden.

## 11. Minimum media package

For initial validation, produce one general poster/edit and two complete scenario sets: real estate and consulting. Use well-art-directed stills for the remaining choices until the central interaction proves useful. Then produce the remaining story clips.

Per full scenario, capture:

1. One recognizable work-moment still, with desktop and mobile compositions.
2. One short transition clip, approximately 6–10 seconds; the duration is a creative starting point, not a performance claim.
3. One closing still or brief motion shot returning to work.
4. A corresponding actual demo interface with legible live text.

Keep casting grounded and varied. The fictional personas’ ages, genders, vehicles, and family structures are not mandatory casting criteria. Obtain necessary asset rights and releases. Generated or staged media must never be presented as actual customer testimony. Use real HTML or actual product capture for interface details rather than AI-generated screen text.

Do not make a separate sixty-second explainer a mandatory conversion step. A longer optional film can be added later if users request explanation that the small example does not provide.

## 12. Measurement and launch acceptance

### Proposed measurement

Measure scene selection, demo start, demo completion, waitlist submission success, email confirmation, invited-account creation, and first real follow-up. Keep simulated outcomes separate from real actions.

Useful ratios:

- Demo completion rate = completed demo sessions / started demo sessions.
- Confirmed-waitlist rate = confirmed signups / eligible landing sessions within a consistently defined cohort.
- Activation rate = invited accounts completing a real follow-up / invited accounts created in the same observation cohort.

Use completed-film views and scroll depth only as diagnostic signals, not the definition of success. Do not collect message text, private notes, contact names, or contact information inside analytics payloads. The current privacy notice must be reviewed and aligned before deploying any new measurement system.

### First validation

Build the real-estate story-to-demo flow first; then compare with the consulting scenario. Ask users what the product does before explaining it. Observe whether they can complete the example, understand that it is simulated, describe the access model, and envision an appropriate real contact.

Do not presume that cinematic motion improves conversion. Compare the moving version with its strong still-image counterpart before increasing media-production investment.

### Release checklist

- Every page identifies the product purpose without video playback.
- Visitors can reach a relevant ready-to-use example without registration.
- Profession choices are visible and do not demand a classification quiz.
- One active story and one primary demo action are visible at a time.
- All demos are labeled fictional; no real send endpoints are connected.
- Access copy matches the actual invitation system.
- Submission, confirmation, invitation, and account creation have distinct states.
- The selected starter can carry forward; fictional people never carry into real accounts.
- Mobile controls, keyboard navigation, reduced motion, focus, errors, and slow-loading media have been tested.
- Nothing implies a verified customer outcome where only a demonstration exists.

## Source basis

Supplied source profiles: ICP — Real Estate Agent — Maya Bennet; ICP — Independent Operations Consultant — Daniel Mercer; ICP — Photographer — Elena Brooks; ICP — Painter Contractor — Marcus Reed; ICP — Independent Recruiter — Lauren Mitchell. Each labels its persona and proposed workflows as hypotheses rather than validated customer findings.

Public sources reviewed September 10, 2026:

- Jump in the Mix homepage: current positioning, demo behavior, invitation access, and default sending descriptions.
- Jump in the Mix Privacy: data-handling and measurement disclosures.
- Copyhackers, “Copywriting Formulas — the ultimate guide”: problem, promise, proof, proposal; clarity, credibility, and not confusing concision with removing necessary meaning.
- W3C WAI, “Understanding SC 2.2.2: Pause, Stop, Hide”: controls for automatically moving information.
- MDN, “prefers-reduced-motion”: honoring motion preferences.
- web.dev, “Lazy loading video”: poster priority, deferred secondary video, and autoplay-related loading considerations.

The creative concept, layout, typography and color suggestions, proposed scenes, state design, asset counts, duration targets, copy budget, and experimental sequence are recommendations, not externally validated outcomes.
