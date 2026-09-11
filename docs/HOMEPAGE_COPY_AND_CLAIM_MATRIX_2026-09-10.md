# Homepage copy and claim matrix

Implementation reference · September 10, 2026

| Route/state | Primary copy or action | Source | Claim evidence and boundary | Objection answered | Status |
| --- | --- | --- | --- | --- | --- |
| `/` recognition | “Good conversations deserve a next step.” | Homepage blueprint; real-estate ICP | Emotional headline is paired with a literal follow-up-software eyebrow and concrete subhead. No effectiveness claim. | “What is this?” | Implemented; comprehension validation pending. |
| Real estate | “Maybe after summer”; later move check-in | Maya ICP | Fictional example; no customer or market outcome claim. | Robotic CRM / lost context | Implemented. |
| Consulting | Revisit onboarding after hiring | Daniel ICP | Fictional example; no revenue claim. | Another business-development project | Implemented. |
| Photography | Clarify coverage options after pricing | Elena ICP | Fictional example; no booking or gallery integration claim. | Another booking system | Implemented. |
| Painting | Clarify estimate scope | Marcus ICP | Fictional example; no estimating/job-management claim. | More evening administration | Implemented. |
| Recruiting | Reconnect after planning via personal email | Lauren ICP | Fictional example; no ATS, LinkedIn or hiring claim. | Confidentiality / duplicate records | Implemented. |
| Sandbox ready | “Make the message yours” | Blueprint | Draft stays in component memory and is absent from access forms and event payloads. | Loss of voice/control | Implemented and test-covered. |
| Sandbox preview | “Preview only” | Blueprint | No `sms:`, `mailto:`, `tel:` or server mutation surface exists in the marketing sandbox. | Accidental sending | Implemented and test-covered. |
| Sandbox complete | “A next step is in place” or “Left for now” | Blueprint | Copy follows the selected state; no account scheduling, delivery, reply or booking claim. | False progress | Implemented and test-covered. |
| Access | “Free · By invitation” | Current admission implementation | Confirmation, selection and invitation are separate. No card is collected during account creation. Capacity and pause rules remain on `/waitlist`. | Cost and availability | Implemented; policy must be rechecked before release. |
| Access errors | Complete email, retry, generic receipt | Blueprint plus existing privacy boundary | Enhanced action state preserves locally entered email. Generic receipt covers duplicates and existing accounts. | Fear of losing work / privacy leak | Implemented and database-qualified. |
| Invitation | “Start with one person and review every follow-up” | Blueprint and current product | Registration remains invitation-gated and email-verified. | Large migration / automatic outreach | Implemented. |
| Onboarding | Suggested scenario starter, change, or skip | Blueprint and ICP use cases | Allowlisted scenario persists via waitlist/invitation/workspace records; fictional person and edits do not. Selection is explicit. | Irrelevant setup | Implemented and database-qualified. |
| Today outcome | Messaging handoff followed by user-recorded status | Existing `JumpWorkflow` behavior | “Not sent” remains available. App-open is not delivery or reply. | Incorrect completion | Existing implementation retained and regression-covered. |

The five ICP documents are fictional planning inputs. No persona quotation appears as customer testimony. Both requested copywriting/marketing references are now supplied and indexed in [assets/README.md](../assets/README.md). Source reconciliation below is an editorial assessment, not customer validation or publication approval.

## Supplied-source reconciliation

September 10, 2026. Reviewed the supplied [conversion-copywriting guide](<../assets/Joanna Wiebe - Conversion copywriting.md>) and [marketing-principles guide](<../assets/Joanna Wiebe - Marketing Principles.md>) against `MarketingExperience.tsx`, `MarketingSandbox.tsx`, `marketing-scenarios.ts`, and the existing journey/claim matrix above. Preserve the guides' attribution boundaries: they are supplied syntheses, and their examples are not product evidence.

**Reader and conversion contract:** an independent professional with an unfinished conversation; problem awareness is a hypothesis derived from the fictional ICPs. One governing idea is retaining context for a deliberate next action. The offer is a free account by invitation. The acquisition outcome is explicit email confirmation, with the eligible denominator and attribution limits defined in the event contract. Trying the sandbox supports that decision; demo completion and generic receipts are not confirmed requests. Sign-in serves returning users.

**Belief and narrative sequence:** recognize the unfinished conversation → see the remembered context → edit and preview a relevant message → choose a demo next step → understand confirmation and invitation. Use And–But–Therefore for clarity: a conversation matters, other work interrupts it, therefore keep its context and choose the next action. Desired feeling: recognition and control. The obstacle is relying on memory while work continues; failed alternatives and consequences remain research questions, not asserted customer findings. The fictional scene carries the explanation of editing and next-step choice. The opening conversation receives a demo decision at completion, including the valid choice to leave it for now.

| Review pass | Current evidence / finding | Disposition |
| --- | --- | --- |
| Clarity | Category/subhead and literal demo controls explain the workflow. Access now says “Start with one person and a reason to reconnect,” consistent with the FAQ and onboarding. | Wording finding resolved September 10. |
| Voice and tone | Calm, contextual drafts across five professions; no invented testimonials or pressure. | Retain as a hypothesis; validate with participants. |
| So what? | Context and timing connect features to an unfinished conversation. | Retain the concrete mechanism; confirm relevance in research. |
| Prove it | Sandbox demonstrates editing and next-step choice; it proves no sending or customer outcome. | Keep no-send disclosures; do not treat illustrative payoff scenes as measured benefits. |
| Specificity | Named fictional people, channels, milestones and coverage/scope choices make the examples tangible. | Retain; test whether the situations and channels fit each audience. |
| Heightened emotion | Familiar interruptions and relief provide narrative movement without manufactured urgency. | No unsupported loss/revenue claims or dramatic villain needed. |
| Zero risk | No-account demo, memory-only drafts, literal preview, explicit invitation sequence, and one-person setup explain the process. | Do not call the account or demo “risk-free”; preserve material access/data information. |
| Separate factual/accessibility review | The sending FAQ now explains default app handoffs, optional provider sending, and System Mix invitation email after review. `sendSystemInviteAction` requires a reviewed preview and queues delivery through the application; the public sandbox has no send action. | Omitted exception resolved September 10 against `src/lib/system-mix-actions.ts`, `src/lib/referral-access.ts`, and `src/lib/access-invitation-mail.ts`. Manual screen-reader and owner acceptance remain open. |

The marketing guide's eight checks map to the same path: the scene supplies a relevant hook and orientation; the draft supplies a concrete word picture; the sequence supplies structure; each chapter has a belief job; the memory burden identifies the obstacle; the sandbox carries the practical explanation; and completion resolves the next-step question. Whether visitors perceive that coherence is unmeasured.

The two wording findings are resolved. The [headline review and comparison brief](HOMEPAGE_HEADLINE_REVIEW_2026-09-10.md) supplies 25 candidates, eight-dimension editorial scores, three shortlisted hypotheses, CTA alternatives, and a comparison procedure. The current headline remains in place pending comprehension evidence. Owner decisions, genuine prospect language, participant acceptance, and post-launch learning remain required.
