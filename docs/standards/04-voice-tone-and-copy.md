---
id: JITM-04
title: Voice, tone and copy
status: active
version: 1.0.0
owner: Kevin
last_reviewed: 2026-09-28
applies_to: [copy, interface-text, email, help, public-pages, onboarding, ready-made-mixes, marketing, agents]
supersedes: [docs/CANONICAL_PRODUCT_DECISIONS.md]
sources:
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - docs/CANONICAL_PRODUCT_DECISIONS.md
  - docs/PRODUCT_AUDIT_2026-09-04.md
  - docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md
  - docs/HOMEPAGE_COPY_AND_CLAIM_MATRIX_2026-09-10.md
  - docs/HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md
  - docs/HOMEPAGE_CONTACT_DEMO.md
  - docs/ui-ux-audit-2026-09-18/CLAIM_REVIEW.md
  - docs/CONVERSION_COPY.md
  - docs/SUPPORT.md
  - docs/PUBLIC_POLICY_DRAFT.md
  - docs/SALES_PLAN_LIBRARY_2026-09-05.md
  - docs/CHANNEL_VERSIONS_FOR_EVERY_BEAT_2026-09-23.md
  - docs/VOICE_PRD_REVIEW.md
  - docs/VOICE_WORKFLOWS.md
  - docs/SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md
  - docs/RELATIONSHIP_VOCABULARY.md
  - assets/README.md
  - assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md
related_skills: [jitm-copy, jitm-ui-change, jitm-feature, jitm-review, jitm-audit]
related_workflows: [WF-03, WF-02, WF-05]
---

# JITM-04 — Voice, tone and copy

> How Jump in the Mix sounds, how each kind of text is written, how persuasive copy earns belief without invented evidence, and how third-party material is kept out.

## 1. Purpose and scope

This standard covers every customer-facing word: interface text, notices, errors, empty states, email, Help and the FAQ, public pages, onboarding, invitation wording and ready-made Mix and Beat messages. It is the home of the persuasion floor and the clean-room rule (D7).

The persuasion floor is a clean-room distillation (D6). It describes mechanisms drawn from the fleet's evidence-led persuasion standard and from two third-party copywriting references that stay local-only and unnamed (content hashes `dc3e5265f80a50b1` and `9cec246b4c5a2608`). Agents apply this standard; they do not need, read or cite those files.

Neighboring topics live elsewhere:
- which words and names to use: JITM-05 §2;
- what may be claimed, including price: JITM-02 §2;
- how states, confirmations and disabled controls behave: JITM-08 §2;
- which typeface each register uses: JITM-06 §2.

## 2. Rules

### Voice

**2.1** Jump in the Mix sounds:
- plain: ordinary words, literal actions, short sentences, the category and the mechanism before any metaphor;
- calm: no pressure, countdowns or made-up urgency;
- warm and personal: like a person, never a campaign or a sales script;
- respectful: the owner is a capable professional who is short on time, never someone to teach the basics or call disorganized;
- honest: it says what the product does not do and reports what happened, not what we hope happened.

[SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:38] [SOURCE docs/HOMEPAGE_COPY_AND_CLAIM_MATRIX_2026-09-10.md:35,39] [SOURCE assets/ICP - Painter Contractor - Marcus Reed.md:142,363] [SOURCE assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:17]

**2.2** Wordplay stays light: at most one expressive line per surface, never in controls or navigation labels. Mix and Beat are explained before copy relies on them (JITM-05 §2). Avoid "omnichannel orchestration", "supercharge your pipeline", "put relationships on autopilot", "blast", "dominate", "unlimited outreach", "AI knows who needs a nudge" and "never miss a beat" as an absolute claim. [SOURCE assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:96-104] [SOURCE assets/ICP - Real Estate Agent - Maya Bennet.md:280] [SOURCE assets/ICP - Independent Operations Consultant - Daniel Mercer.md:381]

### Registers

**2.3** Every string belongs to one of three registers:
- **Interface text** (labels, buttons, notices, errors, empty states, Help): short and literal. Text, Email, Call, Save, Pause, Stop and Archive stay plain actions.
- **The owner's personal wording** (drafts, message previews, ready-made message wording, notes, Quick Add capture): written the way the owner would write to that person.
- **Marketing** (public pages, metadata, waitlist and invitation email): names the category and the mechanism literally, shows a recognizable situation, states access truthfully, states boundaries and labels illustrations.

[SOURCE docs/RELATIONSHIP_VOCABULARY.md:18] [SHIPPED 9439fd6 src/styles/design-tokens.css:33] [SOURCE docs/SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md:11-12]

**2.4** Headings, buttons and labels use sentence case; product names keep their capitals (JITM-05 §2). [PROPOSED]

**2.5** Ready-made messages speak in the first person singular ("I", "my") and sign with the owner's placeholders. "We" is for the owner to choose when the business really is a team or crew. [SOURCE docs/HOMEPAGE_CONTACT_DEMO.md:5] [PROPOSED]

### Microcopy

**2.6** Copy MUST NOT explain implementation. Never mention workers, queues, jobs, database state or the other internal words in JITM-05 §2; describe the effect for the owner's business. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:121] [SOURCE docs/PRODUCT_AUDIT_2026-09-04.md:265-268]

**2.7** A confirmation is one short notice that names what actually happened, with its day and time when something was scheduled: "Mix saved.", "Contact added. Their first follow-up is on Today for {time}." It MUST NOT confirm something that did not happen. [SHIPPED 9439fd6 src/components/MixWorkspace.tsx:79-80] [SHIPPED 9439fd6 src/components/ContactProfile.tsx:168] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:24] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:45]

**2.8** Handing off is not delivering. A button that opens another app says what it opens ("Open text", "Open email", "Call"). Afterwards, copy asks the owner to record what happened and MUST NOT say "sent" until the owner records it. These states stay distinct in wording: request received, provider accepted, email confirmed, invitation issued, account created, app opened, send recorded by the owner, provider delivery, reply. [SHIPPED 9439fd6 src/components/EditableFollowUpAction.tsx:37-43] [SHIPPED 9439fd6 src/components/JumpWorkflow.tsx:478] [SOURCE docs/HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md:101]

**2.9** Say who sends. Member invitations say "Invitations aren't emailed for you". Automatic-send states say exactly when a follow-up will send by itself and when an edit holds it. [SHIPPED 9439fd6 src/app/(app)/mixes/system/page.tsx:54] [SHIPPED 9439fd6 src/components/EditableFollowUpAction.tsx:74-76,436-440]

**2.10** When nothing was sent (a limit, a suppression, a deferral), copy says so plainly: "No new email was sent." [SHIPPED 9439fd6 src/components/WaitlistForm.tsx:36] [SOURCE docs/HOMEPAGE_PROFESSION_PAGES_2026-09-11.md:32-34]

**2.11** An empty state's line is warm and names the next useful business action: "Nothing due right now" with "Add a person". Its structure, with one primary action, is JITM-08 §2.32. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:120] [SHIPPED 9439fd6 src/components/EmptyState.tsx:15-21] [SHIPPED 9439fd6 src/app/(app)/jumps/page.tsx:475]

**2.12** Say "You're caught up." only in the state JITM-09 §2.25 defines. When a list could not be checked, say so ("Your next steps could not be checked."); unknown is not zero. [SHIPPED 9439fd6 src/app/(app)/jumps/page.tsx:430]

**2.13** An error says what happened, what is kept and what to do next: "You're signed out, so this wording isn't saved. Copy it, then sign in again." [SHIPPED 9439fd6 src/components/EditableFollowUpAction.tsx:65-68]

**2.14** Say why an option is unavailable in plain words, and name the fix when there is one: "Email: needs an email address", with an "Add …" link. How the option behaves is JITM-08 §2.6. [SOURCE docs/CHANNEL_VERSIONS_FOR_EVERY_BEAT_2026-09-23.md:15]

**2.15** Access copy never promises a date or immediate access: no countdowns, queue positions or "the moment it's your turn". Public receipts stay generic and never reveal whether an address has an account or a waitlist status. [SHIPPED 9439fd6 src/app/waitlist/page.tsx:20,23] [SHIPPED 9439fd6 src/lib/waitlist-actions.ts:66] [SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:24]

**2.16** Help and support copy MUST NOT imply a support team, email delivery or response time that is not configured, and it reminds people not to share passwords, customer information, keys or tokens. Policy pages never invent an operator, address, deadline, governing law or compliance claim. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:83] [SOURCE docs/SUPPORT.md:3,7] [SOURCE docs/PUBLIC_POLICY_DRAFT.md:3]

**2.17** Voice copy says the browser's speech service may process audio, never promises offline or on-device recognition, and states that the product does not record or upload audio. Summaries describe recorded facts only, never who replied or what was sent from another app. No invented scores or ratings about the owner's relationships. [SOURCE docs/VOICE_WORKFLOWS.md:11,29] [SOURCE docs/VOICE_PRD_REVIEW.md:34,38]

### Ready-made messages

**2.18** Every ready-made message MUST have a specific reason tied to what the person said or what was agreed: an open estimate, a promised update, a stated time. [SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:39] [SOURCE assets/ICP - Real Estate Agent - Maya Bennet.md:207-209]

**2.19** Messages are plain and warm, free of sales jargon and method names, and use the placeholders for names and signatures. Texts SHOULD stay short enough to read on one phone screen. [SOURCE docs/PRODUCT_AUDIT_2026-09-04.md:93] [SOURCE docs/SALES_PLAN_LIBRARY_2026-09-05.md:51]

**2.20** No message may need an invented statistic, testimonial, deadline or missing link. A line that asserts availability, scarcity, a result or another fact ("the dates are filling up") MUST carry a visible "only if it's true" cue or a placeholder the owner fills in. Owners verify terms, prices and commitments before sending. [SOURCE docs/SALES_PLAN_LIBRARY_2026-09-05.md:51,54] [SHIPPED 9439fd6 src/app/follow-up-templates/estimate-follow-up/page.tsx:36]

**2.21** A message MUST NOT show a broken placeholder or invent a missing fact. When a value is missing, drop the optional sentence or ask the owner once. [SOURCE docs/PRODUCT_AUDIT_2026-09-04.md:75] [SOURCE local-only 00e0a87b7f6e77fc assets/Jump_in_the_Mix_Brand_price_freatures.md:139] [PROPOSED]

**2.22** Private notes never enter messages. Call versions are private talking points that open with "Say hello and check it's a good time to talk" and close with "Agree the next step before you hang up". [SHIPPED 9439fd6 src/components/JumpWorkflow.tsx:510] [SOURCE docs/CHANNEL_VERSIONS_FOR_EVERY_BEAT_2026-09-23.md:10-11]

**2.23** Ready-made Mixes and Mega-Mixes are editable starting points. Copy MUST NOT present their timing as proven or guaranteed. Guidance says when to stop: after a reply, a booking, a decline or an opt-out, because the app does not detect replies. Illustrative templates say they are original and not customer quotations or proven scripts. [SHIPPED 9439fd6 src/components/PlanApproachGuide.tsx:14,16] [SHIPPED 9439fd6 src/app/follow-up-templates/estimate-follow-up/page.tsx:25] [SOURCE docs/MEGA_MIXES_2026-09-22.md:15]

### Persuasion floor

**2.24** The floor applies, without anyone asking, to anything meant to make someone believe or do something: public pages, the FAQ, metadata, waitlist, invitation and onboarding copy, notices that recommend an action, and ready-made messages. Effort scales with stakes. A button label or a notice needs only the truth rules (§2.7–§2.10, §2.27); public copy, or copy with a consequential claim, needs the full floor and Kevin's approval. Heavy process on a two-word label is itself a defect. [OWNER 2026-09-28 D6] [PROPOSED]

**2.25** Before drafting persuasive copy, name:
- the reader, by situation (trigger, job, stakes, current workaround, belief, worry), never by demographics;
- how aware they already are of the problem and the product, and match the copy to that;
- what brought them, so the page continues that promise;
- one idea, one promise and one primary action.

[OWNER 2026-09-28 D6] [PROPOSED] [SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:100,102,104] [SOURCE assets/README.md:25]

**2.26** Persuasive copy carries a claim–proof ledger. Each claim records its exact wording, its type (product, outcome, comparison, number, security, privacy, legal or testimonial), its proof (current behavior or an accountable source), its status (verified, qualified, needs verification or remove), the qualification shown beside it, and who approved it on what date. Nothing publishes while a claim needs verification. The proof must match the claim; a count is not a result. [OWNER 2026-09-28 D6] [PROPOSED] [SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:103] [SOURCE docs/ui-ux-audit-2026-09-18/CLAIM_REVIEW.md:5]

**2.27** No invented evidence, ever: no made-up customer words, quotes, statistics, testimonials, case studies, reviews, research or results. ICP quotes and figures are invented, so presenting them as evidence counts as fabrication. A placeholder is allowed only when it is labeled and cannot be mistaken for evidence. No false urgency, scarcity or guarantee, and nothing is called "risk-free". [SOURCE docs/CONVERSION_COPY.md:21] [SOURCE docs/HOMEPAGE_COPY_AND_CLAIM_MATRIX_2026-09-10.md:40] [SOURCE assets/README.md:17] [OWNER 2026-09-28 D6]

**2.28** A consequential claim (a number, a comparison, an outcome, security, privacy, legal, a testimonial, price, automatic sending or delivery) MUST be removed or proven in the ledger and approved by Kevin before it is published. Agents MUST NOT approve such claims themselves. §2.27 and §2.34 are publication gates even though tooling enforcement is advisory (D8). [OWNER 2026-09-28 D11] [SOURCE docs/ui-ux-audit-2026-09-18/CLAIM_REVIEW.md:19,21] [PROPOSED]

**2.29** Be concrete. Show the mechanism and the owner's scene, such as a promised check-back buried by the next job, instead of adjectives. Cut vague words: seamless, powerful, robust, transformative, unlock, all-in-one, streamlined. Name the obstacle as something outside the reader (memory, scattered threads); never blame the reader or stir up fear. Every line has a job, and the ending returns to the opening situation, changed. [OWNER 2026-09-28 D6] [PROPOSED] [SOURCE docs/HOMEPAGE_COPY_AND_CLAIM_MATRIX_2026-09-10.md:30] [SOURCE assets/README.md:26]

**2.30** Calls to action are value-phrased while the reader still needs a reason ("Try an estimate follow-up") and literal at the commitment ("Join the waitlist"). The line beside them answers the nearest real worry ("Nothing is sent and no messaging app opens."). Never "Submit" or "Click here". Objections are answered with process (steps, control, reversibility, data handling), not reassurance. [SHIPPED 9439fd6 src/lib/persona-mixes.ts:161] [SHIPPED 9439fd6 src/components/PublicLanding.tsx:24-25] [SOURCE assets/ICP - Real Estate Agent - Maya Bennet.md:239-246]

**2.31** Edit in passes, one question each: clarity, voice for this reader, why it matters, proof, specificity, emotional pitch, risk. Then check facts, privacy, legal wording, accessibility (labels, states, error text) and clean-room separately; the drafter does not sign that check off alone. Kevin approves public copy before it ships. [OWNER 2026-09-28 D6] [SOURCE docs/ui-ux-audit-2026-09-18/CLAIM_REVIEW.md:19] [PROPOSED]

**2.32** Nothing is called a winner, better or proven without evidence. Write the hypothesis and the decision rule before looking at results, and label the strength of the evidence. A small research sample is not conversion evidence. The current homepage hook is a hypothesis. [SOURCE docs/SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md:3,31] [SOURCE docs/HOMEPAGE_HEADLINE_REVIEW_2026-09-10.md:76] [SOURCE docs/HOMEPAGE_RESEARCH_PROTOCOL_2026-09-10.md:9]

**2.33** Agents may draft options, apply the passes, summarize evidence they were given and list missing proof. They MUST NOT invent customer language or proof, cite a source they have not opened, declare a winner or hide uncertainty behind fluent prose. [OWNER 2026-09-28 D6] [PROPOSED] [SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:101]

### Clean-room

**2.34** Standards, skills, product copy and new documents MUST NOT name third-party frameworks, courses, sales methods, authors or instructors, or link to their courses; describe the mechanism instead ("question-led discovery", "a claim–proof ledger"). Preserved sources such as `assets/README.md` and dated records stay as written, and anyone quoting them withholds the names. [OWNER 2026-09-28 D7]

**2.35** The two third-party copywriting references stay out of Git (D6). Refer to them only as "the conversion-copywriting reference" and "the marketing-principles reference", with their content hashes; refer to the fleet's evidence-led persuasion standard only by that description. [OWNER 2026-09-28 D6] [OWNER 2026-09-28 D7]

**2.36** Marketing copy SHOULD describe other products by category ("an estimating system", "an applicant-tracking system") rather than by brand. [PROPOSED]

## 3. Canonical implementations

- `src/components/EmptyState.tsx`: one line in the app-to-owner bubble plus one action.
- `src/components/EditableFollowUpAction.tsx`: handoff labels, save-state errors and automatic-send notices.
- `src/components/JumpWorkflow.tsx`: "Record what happened. Opening an app does not send it."
- `src/app/faq/page.tsx`: plain answers about sending, replies, cost and invitations.
- `src/app/follow-up-templates/estimate-follow-up/page.tsx`: an illustrative-template label and "only if it's true".
- `docs/ui-ux-audit-2026-09-18/CLAIM_REVIEW.md`: a working claim ledger with owner decisions.
- `docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md` (section 4): the copy workflow checklist.

## 4. Do / Don't

- **Do** "Contact added. Their first follow-up is on Today for Tue 10:00 AM." **Don't** "Follow-ups are being prepared." when nothing was scheduled.
- **Do** "Record what happened." after "Open text". **Don't** "Message sent!" when the phone's app merely opened.
- **Do** "Your next steps could not be checked." **Don't** "You're caught up." after a failed check.
- **Do** "Hi {{First Name}}, you mentioned the fall for the move. Is that still the plan?" **Don't** "Just checking in!" with no reason.
- **Do** "Discovery that asks before it suggests." **Don't** a sales method's trademarked name with its author.
- **Don't** "Our team will get back to you within 24 hours" unless that is configured and staffed.

## 5. Verification

- Run WF-03. Persuasive copy ships with its claim ledger, and every consequential claim shows Kevin's dated approval.
- Grep changed strings for internal words and retired terms (JITM-05 §5).
- Check new copy and documents for framework, method, course or author names (§2.34). `src/lib/sales-approaches.ts` shows the kind of names to remove.
- Screenshot the changed text in place, in both themes and at narrow widths (JITM-12 §2).

## 6. Open decisions and known deviations

Open questions for Kevin:
- May a ready-made message say "we" by default for trades with crews (§2.5)?
- Should texts have a length limit? Only a 900-character phone warning ships (`src/components/EditableFollowUpAction.tsx:429`).
- Replacing the third-party method and author names in ready-made plans changes shipped copy; confirm the descriptive labels before WF-03 runs.

Known deviations at 9439fd6:
- The reminders page promises sending "unless you connect an optional sending provider and turn that on", but automatic sending is off during the beta (`src/app/features/follow-up-reminders/page.tsx:37`). The Settings hub and the sending page call automatic sending optional and suggest contacting support to set it up (`src/app/(app)/settings/page.tsx:17`; `src/app/(app)/settings/sending/page.tsx:28,31`).
- The template and reminders pages describe the retired four-Beat demo that opened messaging apps: "The sample estimate Mix in the demo runs like this" (`src/app/follow-up-templates/estimate-follow-up/page.tsx:31-36`), "Each page plays a demo with that profession's own Mixes" (`src/app/follow-up-templates/page.tsx:41`), "In the demo, open a planned Beat and choose its date" (`src/app/features/follow-up-reminders/page.tsx:44`), and "Nothing goes out unless you open your own messaging app" (`src/app/follow-up-templates/page.tsx:48`; `src/app/follow-up-templates/estimate-follow-up/page.tsx:48`; `src/app/features/follow-up-reminders/page.tsx:46`). The three-Beat demo that replaced it on 2026-09-19 sends and opens nothing (`docs/design/DEMO_WORKSPACE_2026-09-19.md:3,9`).
- Ready-made plan guides show third-party sales-method names, authors and source links, and library search matches author names (`src/components/PlanApproachGuide.tsx:12,17`; `src/lib/sales-approaches.ts`; `src/lib/sales-plan-library.ts:297`). D7 covers product copy.
- Profession Mix wording asserts facts without an "only if true" cue ("your date is still open", "The wedding was just featured", "the dates we talked about are starting to fill", "I have a couple of people worth a conversation") (`src/lib/persona-mixes.ts:133,149,172,217`). Only a chosen example's first message reaches an account today.
- Profession demo drafts say "just checking in about {topic}" (`src/lib/demo-workspace.ts:49`), against §2.18.
- The waitlist confirmation page promises to tell people "the moment it's your turn" (`src/app/waitlist/confirm/page.tsx:10`), against §2.15.
- Help calls a Mix "a follow-up campaign" (`src/lib/support-content.ts:44`); JITM-05 §6 lists the vocabulary deviations.

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
