# Realtor journey — implementation record, September 29, 2026

A realtor's onboarding now starts from a Real estate journey curated for the work, and the Real estate Mega-Mix is rebuilt with separate buyer and seller paths. Before this change, a new realtor's first prepared text read "…just checking that you received the estimate from my business" (ONB-10 in the [one-person onboarding record](ONBOARDING_ONE_PERSON_FIRST_IMPLEMENTATION_2026-09-29.md)).

**Status:** built and verified locally; not merged and not released. The new message wording needs Kevin's approval before merge (JITM-04 §2.31). The release is a separate task (WF-06). It is code-only, with no migration.

| Item | Value |
| --- | --- |
| Branch | `feat/realtor-journey-20260929`, pull request #102 |
| Base | `docs/copy-onboarding-approvals-20260929` (PR #98), because both change JITM-09. Merge #98 first, then retarget this pull request to `main` (JITM-13 §2.16) |
| Code commits | `acf7110` (the Real estate Mega-Mix) and `1c9b109` (the onboarding start) |
| Decision | Kevin, 2026-09-29, on which follow-up each business type starts with: "Realtor should follow a journey that is tailored and curated for that particular field of work." Asked how far to go, he chose "Rebuild the realtor journey": realtors start from real-estate follow-ups, each taken from a Real estate Mega-Mix rebuilt with separate buyer and seller paths. |
| Workflow | WF-01, then WF-04 with WF-03, WF-02 and WF-08; skills `jitm-feature`, `jitm-copy`, `jitm-ui-change`, `jitm-standards-update` |

## What changed

**The Real estate Mega-Mix (`src/lib/mega-mixes.ts`, version 2).**
- It was the general service journey with real estate words filled in. It now has two starting points, a new buyer lead and a new seller lead, and 16 Mixes with 28 Beats.
  - Buyers: lead, buyer consultation, home search, after a showing or open house, buyer offer.
  - Sellers: lead, listing consultation, weekly seller updates, seller offer decision.
  - Both paths meet at Under contract, then After closing, the review and referral invitation, and past-client check-ins.
  - Shared stages: an agreed later follow-up, a quiet-conversation reconnect and a concern stage.
- Each stage starts when its milestone is recorded, so no message comes before the event it follows. The after-showing text waits for a recorded "Showing done", and the weekly seller update comes a week after the listing is agreed.
- A failed contract returns a buyer to the home search and a seller to the listing. Every return path has a repeat limit.
- Kevin's approved outline had one fewer stage. "Home search" was added so the after-showing text is not prepared before any showing.
- Waits are at most 180 days: the relaxed pace doubles them, and a Mega-Mix file allows a wait of up to one year.
- An open preview of version 1 asks for a reload before adding. An account that added version 1 keeps it, and the Mega-Mix page still lists all of its Mixes (`installedMegaMixKeys`).

**Onboarding (`/onboarding`).**
- With Real estate as the business type, "What do you want to do?" offers the journey's starts, with a new buyer lead first:

| Start | Stage | First Beat on the chosen day |
| --- | --- | --- |
| Reply to a new buyer lead | New buyer lead | Text, then a call a day later |
| Reply to a new seller lead | New seller lead | Text, then a call a day later |
| Follow up after a showing or open house | After a showing or open house | Text, then a call three days later |
| Check back when they asked you to | The real estate example's check-back text | Text |
| Update a client who is under contract | Under contract | Email, then a text four days later |
| Check in after closing | After closing | Text, then an email 11 days later |
| Keep in touch with a past client | Past client: stay in touch | Text |

- Each start is its stage's own Beats (`src/lib/journey-starts.ts`), so the Mega-Mix offered next continues where the first follow-up began.
- The Mega-Mix's own "Agreed later follow-up" is a call reminder to snooze to the agreed date. A text there would be prepared before that date. The onboarding check-back start therefore uses the real estate example's text, sent on the date the owner chooses. When the person arrived from that example, the duplicate start is left out.
- Other business types keep the general list.
- The starter preview says "1 day after" instead of "1 days after".

## Wording for Kevin's approval

Register: the owner's personal wording. Texts and emails are first person, and "we" appears only as "you and I" ("before we meet"). Call Beats are private talking points. Facts the owner must supply are placeholders in brackets. Nothing states a price, a result, a deadline, lending, legal or tax advice, or anything about a neighborhood's people or schools.

### 1. New buyer lead

Reply quickly, learn what they’re looking for and agree on a first conversation.

- **Text, when the stage starts — Reply to the buyer.** Message: "Hi {{First Name}}, thanks for reaching out about buying a home. What are you hoping to find, and what timing do you have in mind? {{SMS Signature}}"
- **Call, day 1 — Agree on a buyer consultation.** Talking points: "Review what they shared. Ask about the areas they’re considering, the kind of home, their timing and whether they’ve talked to a lender yet; don’t give lending advice. Agree on a buyer consultation or another next step, and record their choice."
- Decisions: Buyer consultation agreed → Buyer consultation; Agreed to revisit later → Agreed later follow-up; No reply; reconnect is appropriate → When a conversation goes quiet; Close this journey → the journey ends.

### 2. Buyer consultation

Understand what matters to the buyer before the search starts.

- **Email, when the stage starts — Before our buyer consultation.** Subject: "Before our buyer consultation". Message: "Hi {{First Name}}, / Before we meet, it would help to know the areas you’re considering, your must-haves and nice-to-haves, and your timing. If you’ve already talked to a lender, bring what you know; if not, that’s fine. Is there anything you’d like me to prepare? / {{Email Signature}}"
- **Call, day 2 — Record the consultation.** Talking points: "Snooze to the agreed meeting. Afterwards, record what the buyer wants, their timing and how they’d like to hear about homes. Choose Search started only when they’re ready to look."
- Decisions: Search started → Home search; Agreed to revisit later → Agreed later follow-up; Close this journey → the journey ends.

### 3. Home search

Keep the search moving, and record each showing so the right follow-up starts.

- **Text, when the stage starts — Plan the showings.** Message: "Hi {{First Name}}, I’ll keep an eye out for homes that fit what you’re looking for. Which days and times usually work best for you to see them? {{SMS Signature}}"
- **Call, day 7 — Check in on the search.** Talking points: "Go over the homes you’ve shared and any they’ve seen. After a showing, record Showing done so the after-showing follow-up starts. Record Ready to make an offer only when they want to write one."
- Decisions: Showing done → After a showing or open house; Ready to make an offer → Buyer offer; Agreed to revisit later → Agreed later follow-up; No reply; reconnect is appropriate → When a conversation goes quiet; Close this journey → the journey ends.

### 4. After a showing or open house

Hear what they thought while it’s fresh, and agree on what to see next.

- **Text, when the stage starts — Ask what they thought.** Message: "Hi {{First Name}}, thanks for coming to see the home. What did you think? Knowing what stood out, good or bad, helps me find the right homes for you. {{SMS Signature}}"
- **Call, day 3 — Plan the next step.** Talking points: "Go over the homes they’ve seen and what they thought of each. Agree on the next homes to see, or whether they’re ready to make an offer. Record Ready to make an offer only when they want to write one."
- Decisions: Ready to make an offer → Buyer offer; Another showing done → After a showing or open house (up to 10 times); Concern to resolve → Resolve a concern; Agreed to revisit later → Agreed later follow-up; No reply; reconnect is appropriate → When a conversation goes quiet; Close this journey → the journey ends.

### 5. Buyer offer

Support the buyer while the offer is written, sent and answered.

- **Text, when the stage starts — Before we write the offer.** Message: "Hi {{First Name}}, is there anything you’d like to go over before we write up the offer? I’m happy to walk through the terms and what happens next. {{SMS Signature}}"
- **Call, day 2 — Record the seller’s response.** Talking points: "Check the actual response in your transaction tools, and snooze this reminder if there isn’t one yet. Record Offer accepted only when the seller has accepted. If it wasn’t accepted, agree on the next step with the buyer."
- Decisions: Offer accepted → Under contract; Offer not accepted; keep looking → Home search (up to 3 times); Agreed to revisit later → Agreed later follow-up; Close this journey → the journey ends.

### 6. New seller lead

Reply quickly, learn about the home and the move, and agree on a listing conversation.

- **Text, when the stage starts — Reply to the seller.** Message: "Hi {{First Name}}, thanks for reaching out about selling your home. What’s prompting the move, and what timing do you have in mind? {{SMS Signature}}"
- **Call, day 1 — Agree on a listing consultation.** Talking points: "Review what they shared. Ask about the home, their timing and what matters most to them in the sale. Agree on a listing consultation or another next step, and record their choice. Don’t suggest a price until you’ve prepared one from actual local sales."
- Decisions: Listing consultation agreed → Listing consultation; Agreed to revisit later → Agreed later follow-up; No reply; reconnect is appropriate → When a conversation goes quiet; Close this journey → the journey ends.

### 7. Listing consultation

Walk through the home, the recent sales behind your pricing, and the plan.

- **Email, when the stage starts — Before our listing consultation.** Subject: "Before our listing consultation". Message: "Hi {{First Name}}, / Before we meet, it would help to hear about any updates you’ve made to the home, anything you know needs attention, and the timing you’re hoping for. I’ll bring recent sales nearby so we can talk through pricing together. / {{Email Signature}}"
- **Call, day 2 — Record the listing decision.** Talking points: "Snooze to the agreed meeting. Afterwards, record what they decided. Choose Listing agreed only when the listing agreement is signed."
- Decisions: Listing agreed → Listed: seller updates; Agreed to revisit later → Agreed later follow-up; Close this journey → the journey ends.

### 8. Listed: seller updates

Send the seller a regular, honest update on showings, feedback and next steps.

- **Email, day 7 — Your weekly listing update.** Subject: "Your weekly listing update". Message: "Hi {{First Name}}, / Here’s this week’s update on your home: [showings and feedback], [activity on similar homes nearby] and [anything I need from you]. Reply or call if you’d like to talk any of it through. / {{Email Signature}}"
- Decisions: Offer received → Seller offer decision; Another weekly update → Listed: seller updates (up to 12 times); Concern to resolve → Resolve a concern; Listing paused; revisit later → Agreed later follow-up; Close this journey → the journey ends.

### 9. Seller offer decision

Help the seller weigh the offer and record their actual decision.

- **Call, when the stage starts — Review the offer together.** Talking points: "Go through the offer’s actual terms with the seller and answer their questions. Refer legal and tax questions to the right professional. Record Offer accepted only when the seller has accepted it."
- Decisions: Offer accepted → Under contract; Offer declined; back to the listing → Listed: seller updates (up to 3 times); Concern to resolve → Resolve a concern; Close this journey → the journey ends.

### 10. Under contract

Keep your client informed until closing, using the dates in your transaction calendar.

- **Email, when the stage starts — Your transaction update.** Subject: "Your transaction update". Message: "Hi {{First Name}}, / Here’s where things stand: [what’s done], [what happens next] and [anything I need from you]. Closing is planned for [closing date]. Reply or call if you’d like to go through any of it. / {{Email Signature}}"
- **Text, day 4 — Mid-week check-in.** Message: "Hi {{First Name}}, is there anything about the next steps you’d like me to explain or double-check? {{SMS Signature}}"
- Decisions: Closing confirmed → After closing; Another weekly update → Under contract after 3 days (up to 8 times); Concern to resolve → Resolve a concern; Deal fell through; buyer keeps looking → Home search (up to 2 times); Deal fell through; home back on the market → Listed: seller updates (up to 2 times); Close this journey → the journey ends.

### 11. After closing

Check in after the move, then keep the relationship going.

- **Text, day 3 — Check in after the move.** Message: "Hi {{First Name}}, congratulations again on closing! How is the move going? If a question comes up about the home or the paperwork, I’m happy to help. {{SMS Signature}}"
- **Email, day 14 — A few weeks in.** Subject: "A few weeks in". Message: "Hi {{First Name}}, / How are things a few weeks after the move? If you need a recommendation for someone to help around the home, or a question has come up since closing, just let me know. / {{Email Signature}}"
- Decisions: All settled; review invitation welcome → Review and referral invitation; Something needs attention → Resolve a concern; Keep in touch without a review request → Past client: stay in touch after 180 days; Close this journey → the journey ends.

### 12. Review and referral invitation

Invite an honest review, and let them pass on your details if they wish.

- **Text, day 2 — Invite an honest review.** Message: "Hi {{First Name}}, thank you for trusting me with your move. If you’d like to share an honest review of working together, I can send you the link. And if someone you know is thinking about buying or selling, you’re welcome to pass on my details. {{SMS Signature}}"
- Decisions: when finished → Past client: stay in touch after 180 days.

### 13. Past client: stay in touch

Stay a helpful contact between moves.

- **Text, when the stage starts — Check in with a past client.** Message: "Hi {{First Name}}, I hope all is well in the home! I wanted to check in and see how things are going. If you’re ever curious what’s been selling nearby, I’m happy to put together a quick update. {{SMS Signature}}"
- Decisions: Thinking about buying → Buyer consultation (up to 3 times); Thinking about selling → Listing consultation (up to 3 times); Another check-in welcome in six months → Past client: stay in touch after 180 days (up to 3 times); Close this journey → the journey ends.

### 14. Resolve a concern

Listen, agree on a response and return to the right part of the move.

- **Call, when the stage starts — Listen and agree on a response.** Talking points: "Review the concern in the person's own words. Listen, agree on what you’ll do, and keep this reminder open or snoozed until it’s resolved. Then choose where to return."
- Decisions: Resolved; continue the search → Home search (up to 3 times); Resolved; back to the listing → Listed: seller updates (up to 3 times); Resolved; continue to closing → Under contract (up to 3 times); Resolved; after-closing check-in → After closing (up to 3 times); Close this journey → the journey ends.

### 15. Agreed later follow-up

Keep the agreed timing. Snooze this call reminder to the date the person requested before continuing.

- **Call, when the stage starts — Review the agreed timing.** Talking points: "Check your notes for the date and channel the person requested. If that date has not arrived, snooze this reminder. When it is time, ask whether they want to resume. Record their decision; do not assume that waiting means yes."
- Decisions: Ready to talk about buying → Buyer consultation (up to 3 times); Ready to talk about selling → Listing consultation (up to 3 times); Close this journey → the journey ends.

### 16. When a conversation goes quiet

A limited reconnect sequence; use only while further contact is welcome.

- **Text, when the stage starts — Check for changed priorities.** Message: "Hi {{First Name}}, has anything changed in your plans, or is there a question I can help with? {{SMS Signature}}"
- **Email, day 4 — Avoid assumptions.** Subject: "Still useful to talk?". Message: "Hi {{First Name}}, / I may have caught you at the wrong time. Rather than assume what is happening, I wanted to ask whether this is still useful to explore. If another priority has taken its place, a quick note is enough and I will adjust. / {{Email Signature}}"
- **Call, day 10 — Listen if they are available.** Talking points: "If they answer, ask whether the earlier topic is still relevant and listen to the answer. If it is, agree on one useful next step and its timing. If not, stop the plan. If you leave a voicemail, keep it brief and offer a simple way to say the timing has changed."
- **Email, day 21 — Finish without pressure.** Subject: "Leaving the conversation open". Message: "Hi {{First Name}}, / I will stop these check-ins after this note. You are welcome to reply if you want to pick the conversation up later. There is no need to explain if the timing or fit has changed. / {{Email Signature}}"
- Decisions: Buyer conversation reopened → Buyer consultation (up to 3 times); Seller conversation reopened → Listing consultation (up to 3 times); Agreed to revisit later → Agreed later follow-up; Close this journey → the journey ends.

### Onboarding starts

- "Reply to a new buyer lead" → New buyer lead: Text day 0, Call day 1
- "Reply to a new seller lead" → New seller lead: Text day 0, Call day 1
- "Follow up after a showing or open house" → After a showing or open house: Text day 0, Call day 3
- "Check back when they asked you to" → Reconnect at the agreed time: Text day 0
- "Update a client who is under contract" → Under contract: Email day 0, Text day 4
- "Check in after closing" → After closing: Text day 0, Email day 11
- "Keep in touch with a past client" → Past client: stay in touch: Text day 0

### Claims in the messages

| Wording | Kind | Proof or safeguard |
| --- | --- | --- |
| "I’ll keep an eye out for homes that fit…", "I’ll bring recent sales nearby…", "I’m happy to put together a quick update" | The owner's own commitments | The owner reviews and sends each message. |
| "[showings and feedback]", "[activity on similar homes nearby]", "[what’s done]", "[what happens next]", "Closing is planned for [closing date]" | Facts | Placeholders the owner fills in (JITM-04 §2.20). |
| "congratulations again on closing!", "thank you for trusting me with your move" | Milestones | These stages start only after the owner records Closing confirmed or All settled. |

## Verification

Builds: baseline `origin/main` (`9f967bc`) and this branch at its final code (`1c9b109`), both production builds with the CI environment, served on separate ports against the local `jitm_design_onb0929` database.

- VERIFIED: the new browser test "a realtor's first follow-up comes from the Real estate journey, starting with a new buyer lead" passes on desktop and phone. It fails on the baseline, where the realtor default is "Follow up about an estimate". It also checks all seven starts, the buyer-lead preview, "1 day after", and that the saved first follow-up contains the buyer reply and no "estimate" or "my business".
- VERIFIED: the affected browser specs pass on desktop and phone at the final code: `onboarding-one-person-first`, `mega-mixes`, `marketplace`, `onboarding-journey-preferences`, `mega-mix-pipelines`, `contractor-user-journey`, `visual-fitment`, `ui-ux-workflows`, `core-flows` and `accessibility`. 106 passed and 16 were skipped by their own conditions.
- VERIFIED: tier 1 — `db:generate`, `validate:static`, `typecheck` and `build` pass. Vitest: 2,135 passed and 24 failed. The 24 are the four backup and recovery files that fail the same way on the baseline (`spawn pg_dump ENOENT`: TrixBot has no PostgreSQL client tools). This branch adds 18 tests:
  - `tests/journey-starts.test.ts`: every start, its rendered wording, and that each start is its stage's Beats;
  - `tests/mega-mixes.test.ts`: buyer and seller paths meeting at the contract, the showing and failed-contract paths, and version 1 installations;
  - the Mega-Mix graph, numbering, tailoring, portability and database installation tests cover the new blueprint. The installation test now passes each blueprint's own version instead of assuming 1.
- VERIFIED: screenshots, light and dark, at 390 and 1194 wide, from both builds:
  - the onboarding choice and starter preview: the baseline shows the estimate text for a realtor; the candidate shows the buyer reply;
  - the Real estate Mega-Mix page: 16 Mixes, both starting points marked, and path labels wrapping without overflow on phones.
  They stay private in the worktree's `.artifacts/realtor-journey-20260929/`. No export screen exists for these pages; they use the existing onboarding and Mega-Mix components unchanged.

## NOT RUN

- The full browser suite: only the specs that touch onboarding, Mega-Mixes, the Marketplace and the Journey ran (JITM-12 §2.13).
- Physical devices, screen readers and a real inbox.
- Lighthouse: no public page changed.
- Migration and restore rehearsals, worker suites and `npm run security:audit`: no schema, job, worker or dependency change.
- GitHub Actions CI, which is blocked by billing; the practiced set ran locally.

## Follow-ups

- **Other business types (rest of ONB-10).** Home services, Insurance & finance, Professional services and Other still start on "Follow up about an estimate". An Insurance & finance owner's first text also mentions an estimate. When there is no business name, the general estimate text says "my business". Kevin to decide whether each gets its own journey starts, as realtors now do.
- **Accounts with Real estate version 1** keep their Mixes. To switch, an owner deletes that Mega-Mix and adds version 2; nothing converts automatically.
- **The real estate open-house example** on the marketing page includes "a quick note on what each one would mean for commute and schools". That describes neighborhoods, which the new journey avoids. Kevin to decide whether to change it.
