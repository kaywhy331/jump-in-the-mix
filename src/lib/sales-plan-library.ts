import type { ReadyMadePlan, ReadyMadePlanStep } from "@/lib/plan-library-types";
import { SALES_APPROACHES, type SalesApproachId } from "@/lib/sales-approaches";

export type SalesPlan = ReadyMadePlan & {
  approachId: SalesApproachId;
  audience: string;
  startWhen: string;
  preparation: string;
};

function sms(dayOffset: number, name: string, message: string): ReadyMadePlanStep {
  return { name, channel: "SMS", dayOffset, sendTimeMinutes: 600, body: `Hi {{First Name}}, ${message} {{SMS Signature}}` };
}

function email(dayOffset: number, name: string, subject: string, message: string): ReadyMadePlanStep {
  return { name, channel: "EMAIL", dayOffset, sendTimeMinutes: 540, subject, body: `Hi {{First Name}},\n\n${message}\n\n{{Email Signature}}` };
}

function call(dayOffset: number, name: string, script: string): ReadyMadePlanStep {
  return { name, channel: "PHONE_CALL", dayOffset, sendTimeMinutes: 660, script };
}

function plan(input: {
  key: string; title: string; description: string; category: string;
  industry?: ReadyMadePlan["industry"]; approachId: SalesApproachId;
  audience: string; startWhen: string; preparation: string;
  featured?: boolean; steps: ReadyMadePlanStep[];
}): SalesPlan {
  return {
    id: `plan_sales_${input.key}`,
    title: input.title, description: input.description, category: input.category,
    industry: input.industry ?? "Any business",
    approachId: input.approachId, framework: SALES_APPROACHES[input.approachId].label,
    audience: input.audience, startWhen: input.startWhen, preparation: input.preparation,
    triggerMode: "MANUAL_START", dateTypeName: null, dateTypeSlug: null,
    durationDays: Math.max(...input.steps.map(step => step.dayOffset)),
    featured: input.featured ?? false, steps: input.steps
  };
}

// Original adaptations of public sales principles, not licensed scripts or
// claims that these precise cadences have been tested by the named authors.
export const SALES_PLANS: SalesPlan[] = [
  plan({
    key: "nepq_inquiry", title: "New inquiry: understand what matters", category: "New clients", approachId: "nepq", featured: true,
    description: "Turn a warm inquiry into a useful conversation with one clear question at a time.",
    audience: "People who have asked about your product or service.", startWhen: "Start after a new inquiry, once any immediate question has been answered.",
    preparation: "Review the inquiry first. Skip questions the person has already answered, and mention their specific request when you personalize the message.",
    steps: [
      sms(0, "Ask about the desired change", "thanks for reaching out. What would you most like to improve?"),
      email(2, "Explore the current situation", "What would make this useful?", "Before suggesting an option, I would like to understand what you need. What is working about the way you handle this now, and what would you like to be easier? A short reply is fine."),
      call(4, "Understand the impact", "Ask if this is a good time for a brief conversation. Use what they already shared, ask where the issue causes difficulty, and explore what a useful improvement would look like. Do not assume the issue is urgent. Summarize what you heard and check that you understood before suggesting a next step."),
      sms(7, "Check timing", "is this something you want help with soon, or would a later check-in be more useful?"),
      email(12, "Leave an easy way back", "Here when the timing works", "I will leave this with you after this note. If you would like help exploring the options, reply with the result you are hoping for and we can start there. If your plans have changed, that is fine too.")
    ]
  }),
  plan({
    key: "nepq_estimate", title: "Estimate sent: explore the decision", category: "Estimates", approachId: "nepq",
    description: "Find out what matters in an estimate decision without repeating a price pitch.",
    audience: "Warm prospects who have received an accurate estimate.", startWhen: "Start one or two days after sending the estimate.",
    preparation: "Confirm the estimate is current and available to the buyer. Use the call to understand the decision, not to create artificial urgency.",
    steps: [
      sms(0, "Find the open question", "what would you like clarified about the estimate before deciding what to do next?"),
      call(3, "Understand the decision", "Ask permission to discuss the estimate. Find out which outcome matters most and whether the proposed work addresses it. Ask what is still uncertain about scope, timing, or cost. Reflect their answer accurately. Only suggest a change if it solves the concern they described."),
      email(7, "Offer a useful clarification", "A clearer next step", "If the estimate leaves you with an open question, I can walk through what is included, what is optional, and how the work would happen. Which part would be most useful to clarify? There is no need to decide before it makes sense to you."),
      sms(12, "Close the loop", "I will pause the estimate follow-up here. If you want to revisit it, reply whenever the timing works.")
    ]
  }),
  plan({
    key: "spin_discovery", title: "Discovery: connect the problem to value", category: "Discovery", approachId: "spin",
    description: "Explore the practical impact of a problem before discussing a solution.",
    audience: "Warm prospects considering a purchase that needs a discovery conversation.", startWhen: "Start after a person agrees to explore whether your service is relevant.",
    preparation: "Research the situation and use existing notes. Ask deeper questions in conversation instead of sending the entire discovery checklist by email.",
    steps: [
      email(0, "Identify the friction", "Where is the friction?", "To make our next conversation useful, which part of the current process takes more time or effort than it should? I can focus on that instead of walking you through everything we offer."),
      call(2, "Explore the consequences", "Confirm the situation from your notes. Ask about a specific difficulty, where its effects show up, and who it affects. Let the buyer describe the impact rather than assigning a cost yourself. Ask what would improve if that difficulty were removed, then summarize the priorities together."),
      email(5, "Define a useful result", "What would a useful improvement look like?", "A good recommendation should be tied to an outcome you can recognize. What would tell you this was working: less time spent, fewer interruptions, better consistency, or something else? I can use your answer to keep the next step focused."),
      sms(9, "Check readiness", "would it help to explore a small next step, or should we revisit this later?"),
      email(14, "Give space to decide", "Leaving the next step with you", "I will stop the scheduled check-ins after this note. If the problem becomes a priority, reply with what has changed and we can look at the options with fresh context.")
    ]
  }),
  plan({
    key: "sandler_fit", title: "First conversation: agree on mutual fit", category: "Discovery", approachId: "sandler",
    description: "Set a clear purpose, understand the decision, and make the next step a mutual choice.",
    audience: "Prospects open to a first consultation or discovery call.", startWhen: "Start after permission to arrange a conversation.",
    preparation: "Know what a useful first conversation covers and what decisions it can reasonably lead to. Keep a no-fit outcome acceptable.",
    steps: [
      email(0, "Agree on the purpose", "A useful first conversation", "Would a short conversation about your goals, what is getting in the way, and whether we can help be useful? At the end, we can agree on a next step or leave it there if the fit is not right. What would you want to cover?"),
      call(2, "Check the fit together", "Agree on the time available and the purpose of the conversation. Explore the problem and the buyer's priorities. If relevant, ask about a comfortable investment range, timing, and who should be involved. Be direct about any mismatch. End with a next step both people agree to, including the option to stop."),
      sms(5, "Make it easy to answer", "would you like to explore this further, or is it better to leave it for now? Either answer helps."),
      email(9, "Avoid an assumed commitment", "Should we leave this here?", "I do not want to assume that another meeting would be useful. If there is still a fit to explore, let me know what you would need from it. Otherwise, I will close the loop for now.")
    ]
  }),
  plan({
    key: "sandler_revisit", title: "Not now: a respectful restart", category: "Reconnect", approachId: "sandler",
    description: "Revisit an opportunity at an agreed time and check whether the situation has changed.",
    audience: "People who explicitly asked to reconnect later.", startWhen: "Start on the check-in date the person agreed to.",
    preparation: "Read the earlier agreement and the reason for postponing. Do not use this plan for someone who declined further contact.",
    steps: [
      email(0, "Revisit the timing", "Is the timing any better?", "You had asked me to reconnect around this time. Has the situation changed, or would you prefer to leave it for now? If it is useful to talk, I would rather start with your current priorities than repeat the earlier proposal."),
      sms(7, "Offer a simple choice", "would you prefer a brief catch-up or no further follow-up for now?"),
      email(21, "Finish the agreed check-in", "Closing the loop for now", "I will stop the scheduled follow-ups here. If your priorities change, you are welcome to reach out and we can see whether there is a useful next step then.")
    ]
  }),
  plan({
    key: "jolt_decision", title: "Ready but unsure: make the choice clearer", category: "Decision support", approachId: "jolt", featured: true,
    description: "Help an interested buyer resolve uncertainty about options, implementation, or the risk of choosing.",
    audience: "Buyers who see a fit but have said they are unsure about moving forward.", startWhen: "Start after the buyer expresses uncertainty about a specific decision.",
    preparation: "Know the realistic options and their limits. Recommend only what you can justify, and verify any support, trial, or cancellation terms before mentioning them.",
    steps: [
      email(0, "Identify the uncertainty", "What still feels uncertain?", "If the decision is still open, what would be most useful to resolve: choosing an option, understanding how it would work, or knowing what happens if it is not the right fit? I can focus on that instead of sending more general information."),
      call(2, "Offer a reasoned recommendation", "Check whether the buyer wants help choosing or does not see a fit. If they want help, compare the few options that meet their priorities. Offer one recommendation with a clear reason and a clear limitation. Ask which implementation concern remains. Do not imply that the decision is risk-free."),
      email(5, "Make implementation visible", "Make the first step clear", "Before any commitment, we can walk through the first step, who handles what, and the terms that apply if plans change. Which part would you like explained? My aim is to make the choice understandable, including the reasons it might not be right for you."),
      sms(9, "Leave the choice with them", "is there one uncertainty I can help resolve, or would you prefer to pause here?")
    ]
  }),
  plan({
    key: "empathy_concern", title: "A concern comes up: listen before answering", category: "Decision support", approachId: "empathy",
    description: "Understand a buyer's concern before discussing price, terms, or a possible compromise.",
    audience: "A prospect or customer who has raised a concern and remains open to a conversation.", startWhen: "Start after a concern needs more discussion; address urgent service issues immediately.",
    preparation: "Record the concern in the person's own words. Use a tentative reflection in a real conversation, not an invented emotional diagnosis in a message.",
    steps: [
      email(0, "Invite their perspective", "Help me understand the concern", "I want to make sure I understand your concern before suggesting an answer. What feels unresolved from your side? If I have missed something important, I would appreciate the chance to correct my understanding."),
      call(2, "Reflect and check", "Ask if they are willing to talk through the concern. Let them finish without interruption. Reflect what you understood in tentative language and ask if you have it right. Use an open question to learn what a workable outcome would look like. Do not promise a concession you cannot deliver."),
      sms(5, "Check what is useful", "what would make the next step feel more workable, if there is still a fit?"),
      email(10, "Make space for a no", "Your call on the next step", "If this is not the right fit, I respect that. If there is still something you would like clarified, reply with that one point and I will address it directly. Otherwise, I will leave the follow-up here.")
    ]
  }),
  plan({
    key: "empathy_reconnect", title: "A conversation goes quiet: reopen gently", category: "Reconnect", approachId: "empathy",
    description: "Check for changed priorities without guilt, invented urgency, or repeated meeting requests.",
    audience: "Warm contacts who stopped replying during an active conversation.", startWhen: "Start after a reasonable gap, based on the earlier conversation and buying timeline.",
    preparation: "Do not interpret silence as an objection or permission for unlimited outreach. Check that the person has not asked you to stop.",
    steps: [
      sms(0, "Check for changed priorities", "has anything changed in your plans, or is there a question I can help with?"),
      email(4, "Avoid assumptions", "Still useful to talk?", "I may have caught you at the wrong time. Rather than assume what is happening, I wanted to ask whether this is still useful to explore. If another priority has taken its place, a quick note is enough and I will adjust."),
      call(10, "Listen if they are available", "If they answer, ask whether the earlier topic is still relevant and listen to the answer. If it is, agree on one useful next step and its timing. If not, stop the plan. If you leave a voicemail, keep it brief and offer a simple way to say the timing has changed."),
      email(21, "Finish without pressure", "Leaving the conversation open", "I will stop these check-ins after this note. You are welcome to reply if you want to pick the conversation up later. There is no need to explain if the timing or fit has changed.")
    ]
  }),
  plan({
    key: "transparent_evaluation", title: "Researching a purchase: answer the hard questions", category: "Buyer education", approachId: "transparency", featured: true,
    description: "Help buyers evaluate price, alternatives, and limitations before asking them to commit.",
    audience: "People who have asked for information while researching a purchase.", startWhen: "Start after the initial request for information has been answered.",
    preparation: "Have accurate pricing factors, limitations, and comparisons ready. Replace an invitation with a direct answer when you already know the buyer's question.",
    steps: [
      email(0, "Clarify the price drivers", "What affects the price?", "When comparing options, it helps to ask what is included, what could change the price, and what support comes afterward. If you tell me what you are comparing, I can explain our pricing on that basis, including any likely extras."),
      email(3, "Make room for alternatives", "A fair comparison", "A fair comparison should include the option of waiting or using a different approach. Which alternatives are you considering? I can explain where our offer fits, where it does not, and which questions would help you compare them on the same basis."),
      call(7, "Answer the difficult question", "Ask what question has been hardest to get a clear answer to. Explain the answer directly, including limitations or uncertainty. If you need to verify a detail, say so and agree when you will return with it. Do not present marketing claims as evidence."),
      email(12, "Hand back control", "Anything else you need to evaluate?", "If one question remains about cost, fit, or what to expect, I am happy to answer it plainly. I will stop the scheduled follow-ups after this note so you can evaluate the options at your own pace.")
    ]
  }),
  plan({
    key: "positioning_options", title: "Comparing options: find the right fit", category: "Decision support", approachId: "positioning",
    description: "Build a decision around the buyer's priorities and credible differences between alternatives.",
    audience: "Buyers actively comparing your offer with other realistic options.", startWhen: "Start once the buyer has identified a need and is comparing ways to address it.",
    preparation: "Know the alternatives, including the status quo. Prepare verifiable strengths and limitations; avoid unsupported competitor claims.",
    steps: [
      email(0, "Set the comparison criteria", "What matters in the comparison?", "To make the comparison useful, which two or three things matter most to you? I can explain how our option handles those priorities and where another approach may be a better fit, rather than send a long list of features."),
      call(3, "Compare real alternatives", "Confirm the buyer's priorities and the options they would choose if yours did not exist. Discuss the tradeoffs that matter in their situation. Explain a relevant, verifiable difference and who benefits from it. Invite them to challenge the fit rather than treating every feature as an advantage."),
      email(6, "Make evidence specific", "Which difference would you like to check?", "If a particular difference matters to your decision, let me know which one. I can help you verify it through a clear explanation, a relevant example, or a practical demonstration where available. I will also be direct about the limits."),
      sms(10, "Agree on the next step", "would a focused comparison still help, or do you have what you need to decide?")
    ]
  }),
  plan({
    key: "home_estimate", title: "Home-service estimate: scope, timing, confidence", category: "Estimates", industry: "Home services", approachId: "nepq",
    description: "Help a homeowner decide whether a repair or improvement matches their priorities.",
    audience: "Homeowners who requested and received a service estimate.", startWhen: "Start after the homeowner has had time to read the estimate.",
    preparation: "Check the actual scope and exclusions. Never imply a safety emergency or a disappearing appointment unless verified.",
    steps: [
      sms(0, "Find the homeowner's priority", "what matters most with the estimate: the work included, the timing, or something else?"),
      call(3, "Discuss the result they want", "Ask what the homeowner most wants the work to solve. Check whether the proposed scope achieves that and what remains unclear. Explain the practical difference between essential and optional work using the actual estimate. Agree whether an explanation, a site visit, or no further action is useful."),
      email(6, "Explain the visit", "What to expect from the work", "Before you decide, I can explain what the visit involves, any access we need, what is included in the estimate, and what would require a separate approval. Which part would be useful to walk through?"),
      sms(11, "Leave an open invitation", "I will leave the estimate with you now. Reply if you want to review the scope or check availability.")
    ]
  }),
  plan({
    key: "real_estate_buyer", title: "Home buyer: priorities before property lists", category: "Discovery", industry: "Real estate", approachId: "spin",
    description: "Understand a buyer's practical needs before sending more listings.",
    audience: "Prospective buyers who asked for help with a home search.", startWhen: "Start after a buyer inquiry and any immediate listing question.",
    preparation: "Use stated needs, budget, and timing. Keep recommendations based on the buyer's preferences and objective property information.",
    steps: [
      sms(0, "Learn the desired change", "what would you most like a different home to make easier day to day?"),
      call(2, "Separate essentials from preferences", "Ask about the practical difficulties with the current home and the result they want from a move. Clarify must-haves, flexible preferences, timing, and an appropriate next step for discussing budget. Do not infer preferences from personal characteristics or steer the buyer toward a neighborhood on that basis."),
      email(5, "Make the search useful", "A more focused home search", "Rather than send more listings, I would like to focus on what would actually improve your day-to-day life. Which requirement is essential, and which could be flexible if the right property came along? We can use that to make the search more useful."),
      email(10, "Check the pace", "What pace works for you?", "Would you like to keep exploring now, or pause until your plans are clearer? I can match the pace to your timing. I will stop the scheduled check-ins after this note unless we agree on a next step.")
    ]
  }),
  plan({
    key: "insurance_renewal", title: "Renewal: understand the choices", category: "Decision support", industry: "Insurance & finance", approachId: "jolt",
    description: "Clarify renewal options and open questions without pressuring a coverage decision.",
    audience: "Existing clients approaching an insurance renewal or service review.", startWhen: "Start about three weeks before the actual renewal or review date.",
    preparation: "Verify the date, available options, terms, and your authority to advise. Keep sensitive financial and policy details out of texts.",
    steps: [
      sms(0, "Invite a private review", "would a short review of your renewal options be useful before you decide?"),
      email(3, "Identify what needs explaining", "What would help with the renewal?", "Before you choose, we can review what has changed, how the available options differ, and which terms deserve a closer look. What would you most like explained? Please use our usual secure channel for personal or policy details."),
      call(7, "Explain the options accurately", "Verify identity through the normal process. Review the client's stated needs and the current policy or service terms. Explain relevant differences, exclusions, costs, and the real deadline. Offer a recommendation only within your role and explain its limits. Confirm what the client wants to do next."),
      email(14, "Confirm the review preference", "Would you like to finish the review?", "If an open question is holding up your renewal decision, I can help clarify it through our usual review process. If you have already decided, let me know so I can update the follow-up. This message does not change your existing terms or renewal requirements.")
    ]
  }),
  plan({
    key: "professional_proposal", title: "Professional-services proposal: agree on the next step", category: "Estimates", industry: "Professional services", approachId: "sandler",
    description: "Check scope, resources, and decision roles before chasing a proposal signature.",
    audience: "Warm clients considering a consulting, creative, accounting, or other professional-services proposal.", startWhen: "Start after the proposal has been delivered and the agreed review period begins.",
    preparation: "Confirm the deliverables, boundaries, and actual review timeline. Adapt questions to the type of service and the client's decision process.",
    steps: [
      email(0, "Agree on a useful review", "How would you like to review the proposal?", "Would it be useful to review the scope, the investment, and what a successful first phase would look like? We can use that conversation to decide whether to proceed, revise something, or leave it there. Who would find it useful to be involved?"),
      call(3, "Check the practical fit", "Confirm the client's priorities, the proposed deliverables, and what is out of scope. Ask whether the time and resources required are workable and how the decision will be made. Discuss a real mismatch directly. Agree on one concrete next action and who owns it."),
      sms(7, "Ask for direction", "does the proposal still fit your priorities, or should we change the scope or pause?"),
      email(12, "Close without an assumption", "Where should we leave the proposal?", "I do not want to treat silence as a yes or keep chasing a decision that is no longer a priority. If you want to continue, reply with the next step that would help. Otherwise, I will close the scheduled follow-up here.")
    ]
  }),
  plan({
    key: "b2b_demo", title: "After a demo: resolve the buying uncertainty", category: "Decision support", industry: "B2B & technology", approachId: "jolt",
    description: "Focus a software evaluation on the remaining decision and implementation questions.",
    audience: "Teams that have seen a relevant demo and are considering a purchase.", startWhen: "Start after a demo, once any promised answers have been delivered.",
    preparation: "Know the actual integration, security, support, commercial terms, and evaluation options. Do not imply capabilities or a trial that do not exist.",
    steps: [
      email(0, "Find the remaining uncertainty", "What is still uncertain after the demo?", "What would be most useful to resolve next: whether the product handles your use case, what implementation requires, or how the team would make the decision? I can focus the follow-up on that instead of sending another general deck."),
      call(3, "Recommend a focused evaluation", "Check whether the team sees a fit and what is preventing a decision. Recommend the smallest evaluation that could answer the open question using options your company actually offers. Explain the success criteria, required effort, and limitations. Include the people responsible for using and approving the product."),
      email(6, "Make ownership clear", "Who needs what to decide?", "A useful next step should have a clear question, an owner, and a way to tell whether it is answered. Which colleague needs input on implementation, security, or commercial terms? We can organize around their questions without adding unnecessary meetings."),
      sms(10, "Check whether to continue", "is there a specific evaluation question we should resolve, or should we pause the follow-up?"),
      email(15, "End the evaluation follow-up", "Leaving the evaluation with you", "I will stop the scheduled follow-ups here. If you want to revisit the evaluation, reply with the decision that is still open and we can agree on a focused next step.")
    ]
  }),
  plan({
    key: "b2b_alternatives", title: "Vendor shortlist: compare against the real alternatives", category: "Decision support", industry: "B2B & technology", approachId: "positioning",
    description: "Help a buying team compare solutions using the criteria that matter to its use case.",
    audience: "B2B buyers evaluating a shortlist or the option of keeping their current process.", startWhen: "Start when the team is actively comparing alternatives.",
    preparation: "Prepare current, verifiable information about your own product. Use the buyer's criteria rather than a comparison designed to guarantee your product wins.",
    steps: [
      email(0, "Understand the alternatives", "What are you comparing us with?", "Which alternatives are on your shortlist, including keeping the current approach? If you share the outcomes that matter most, I can explain the relevant differences and limits of our option without burying you in a feature checklist."),
      call(3, "Test the positioning", "Ask which alternative the team would choose if your product were unavailable. Identify the use-case priorities that distinguish the options. Explain where your product is a strong fit with verifiable evidence and where it is not. Avoid unsupported claims about another vendor."),
      email(7, "Offer evidence for the decision", "Which claim would you like to verify?", "If one capability or implementation detail will determine the choice, let me know which one. We can identify a practical way to check it using the evidence or evaluation options available. It is useful to be clear about the limits before deciding."),
      email(12, "Respect the decision process", "Do you have what you need?", "Do you have the information needed for your comparison, or is a specific question still unanswered? I will leave the follow-up here after this note and respond if there is something useful to resolve.")
    ]
  }),
  plan({
    key: "retail_comparison", title: "A considered purchase: price, fit, and aftercare", category: "Buyer education", industry: "Retail & ecommerce", approachId: "transparency",
    description: "Help an interested shopper evaluate a larger purchase through clear answers.",
    audience: "Shoppers who requested advice about a product and agreed to follow-up.", startWhen: "Start after a product inquiry or consultation, not merely an anonymous site visit.",
    preparation: "Verify product details, the total price, delivery, returns, and warranty terms. Use this for a considered purchase rather than routine low-cost shopping.",
    steps: [
      sms(0, "Identify the missing answer", "what would help you compare the options: fit, total cost, or what happens after purchase?"),
      email(3, "Explain the full purchase", "A clearer way to compare", "For a fair comparison, check the total cost, what is included, how delivery works, and the actual return and warranty terms. If you tell me which options you are considering, I can explain those details for ours and flag any limits."),
      email(7, "Make fit explicit", "Would this fit how you plan to use it?", "The right option depends on how you plan to use it. What will you use it for most often? I can explain whether our option suits that use and where a different size, specification, or approach may make more sense."),
      sms(12, "Leave room to choose", "I will leave the options with you now. Reply if you want a detail checked before you decide.")
    ]
  }),
  plan({
    key: "automotive_estimate", title: "Auto repair estimate: understand the hesitation", category: "Estimates", industry: "Automotive", approachId: "empathy",
    description: "Give vehicle owners a clear explanation of the estimate and space to raise concerns.",
    audience: "Vehicle owners who requested an estimate and have not authorized the work.", startWhen: "Start after delivering the estimate; explain any verified urgent safety issue directly.",
    preparation: "Use documented findings and verified repair options. Distinguish needed work from optional work and obtain approval through the normal process.",
    steps: [
      sms(0, "Invite the concern", "what would you like explained about the repair estimate before authorizing any work?"),
      call(2, "Listen and explain the findings", "Ask what concerns the owner about the estimate. Reflect the concern and check that you understood. Explain documented findings, the available repair options, and the practical consequences without exaggeration. Separate verified safety issues from routine recommendations. Agree on what they want clarified before approval."),
      email(5, "Clarify approval and timing", "Before any work is approved", "I can explain the estimate line by line, what is optional, the current timing, and how we handle any additional work found later. Which detail would be most useful? Nothing in this follow-up is a request to approve work you do not understand."),
      sms(9, "Close the follow-up", "I will pause the estimate follow-up here. Reply if you want to discuss the options or check timing.")
    ]
  }),
  plan({
    key: "wellness_consultation", title: "Wellness inquiry: goals, comfort, and fit", category: "New clients", industry: "Health & wellness", approachId: "nepq",
    description: "Arrange an appropriate consultation around the person's goals and comfort with the next step.",
    audience: "People who requested information about a wellness service or consultation.", startWhen: "Start after an inquiry; use a private consultation for any personal health discussion.",
    preparation: "Keep messages about general goals and appointment logistics. Do not solicit health histories by text or imply a diagnosis or guaranteed result.",
    steps: [
      sms(0, "Offer a comfortable next step", "would a brief conversation about your goals and how our service works be useful?"),
      email(3, "Explain the consultation", "What would help you feel prepared?", "If you are considering a consultation, I can explain what it covers, the cost, and how to decide whether the service is a fit. What general question would help you feel prepared? Please save personal health details for our usual private consultation process."),
      call(6, "Check goals and boundaries", "Ask whether they would like to discuss the service in general or arrange an appropriate private consultation. Explain what the service can and cannot provide within your role. Ask about their preferences for the next step without diagnosing, promising a result, or using anxiety to push a booking."),
      email(11, "Let them choose the pace", "Whenever the timing feels right", "I will stop the scheduled follow-ups after this note. If you would like to ask about appointment options or how the service works, you are welcome to reply. There is no need to book before you feel ready.")
    ]
  }),
  plan({
    key: "real_estate_seller", title: "Home seller: compare the paths forward", category: "Decision support", industry: "Real estate", approachId: "positioning",
    description: "Help a homeowner compare selling, preparing first, or waiting using their own priorities.",
    audience: "Homeowners who asked for advice about a possible sale.", startWhen: "Start after a seller inquiry or initial consultation.",
    preparation: "Use current local evidence, actual costs, and realistic options. Do not promise a sale price, buyer demand, or a deadline without support.",
    steps: [
      email(0, "Set the decision criteria", "What matters most in the next move?", "If you are weighing a sale, what matters most: timing, the work needed to prepare, certainty about the process, or something else? We can compare the realistic paths using your priorities, including the option of waiting."),
      call(3, "Compare realistic paths", "Clarify the homeowner's goals and constraints. Compare selling now, preparing first, or waiting where appropriate. Use verified market information and actual cost categories. Explain uncertainty openly and avoid implying that any path guarantees a price or timeframe."),
      email(7, "Offer a grounded comparison", "Which option would you like to explore?", "If you would like a more useful comparison, we can look at preparation effort, likely costs, and the timing considerations for the options you are weighing. Which path would you like to understand better? Any market estimate should be reviewed against current evidence."),
      sms(12, "Leave the next step open", "would a closer look at one option help, or would you prefer to leave the decision for now?")
    ]
  })
];

export function salesPlanById(id: string): SalesPlan | undefined {
  return SALES_PLANS.find(plan => plan.id === id);
}

export function salesPlanSearchIds(query: string): string[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return SALES_PLANS.filter(plan => {
    const approach = SALES_APPROACHES[plan.approachId];
    return [approach.author, approach.label, plan.audience].some(value => value.toLocaleLowerCase().includes(needle));
  }).map(plan => plan.id);
}
