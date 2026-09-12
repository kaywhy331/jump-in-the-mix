import type { DemoStep } from "@/lib/product-demo";
import { MARKETING_SCENARIOS, type MarketingScenarioId } from "@/lib/marketing-scenarios";

// One landing page per ICP, each with the mixes that persona would actually run. The message
// wording is lifted from the supplied profiles' own example messages; the profiles are fictional
// planning hypotheses, so nothing here is customer evidence. Messages use the same placeholders
// as the homepage demo, which personalises them from the fictional contact.
export type PersonaMix = { id: string; label: string; description: string; steps: DemoStep[] };
export type Persona = {
  id: MarketingScenarioId;
  slug: string;
  label: string;
  noun: string;
  navLabel: string;
  headline: string;
  supporting: string;
  demoHeading: string;
  mixes: PersonaMix[];
};

const scenario = (id: MarketingScenarioId) => MARKETING_SCENARIOS.find(item => item.id === id)!;

export const PERSONAS: Persona[] = [
  {
    id: "real-estate", slug: scenario("real-estate").slug, label: "Real estate", navLabel: "Real Estate Agents", noun: "real estate agents",
    headline: "You had a great conversation. Give it a next step.",
    supporting: "Stay connected with the people behind your business—without making every conversation feel like a campaign. Pick a mix below and make each message sound like you.",
    demoHeading: "Try a real estate mix",
    mixes: [
      {
        id: "not-ready", label: "Not ready yet", description: "A prospect who is interested but not ready · Reconnect at the timing they asked for.",
        steps: [
          { title: "Note the timing they gave you", timing: "Immediate", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. Really enjoyed talking today. No rush at all—I'll check back in the fall like you suggested. If anything changes before then, I'm a text away." },
          { title: "Check back when you said you would", planned: true, timing: "Agreed month", channel: "text", message: "Hi {{First Name}}—last time we spoke, you were thinking about moving in the fall. Is that still the plan, or has the timing changed?" },
          { title: "Talk it through", timing: "Day 3 after", channel: "phone", message: "• Ask what's changed since the summer\n• Any neighbourhoods on the shortlist?\n• Offer a no-pressure look at two listings\n• Agree the next check-in" }
        ]
      },
      {
        id: "open-house", label: "After the open house", description: "Someone you met at an open house or introduction · Keep the conversation going.",
        steps: [
          { title: "Thank them the same day", timing: "Immediate", channel: "text", message: "Hi {{First Name}}, {{Your Name}} here—great meeting you at the open house today. If it's useful, I can send over a couple of similar homes nearby. What matters most to you in the next place?" },
          { title: "Send something useful", timing: "Day 2", channel: "email", subject: "Two homes like the one you saw", message: "Hi {{First Name}},\n\nThanks again for stopping by on Saturday. Based on what you mentioned, here are two homes worth a look, plus a quick note on what each one would mean for commute and schools.\n\nHappy to set up a viewing whenever suits—no pressure either way.\n\n{{Your Name}}" },
          { title: "Light check-in", timing: "Day 14", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. How's the search going? If you'd like, I can keep an eye out for anything new in the areas you liked." }
        ]
      },
      {
        id: "after-closing", label: "After closing", description: "A client who just closed · Stay useful long after the keys are handed over.",
        steps: [
          { title: "Settling in", timing: "Day 7", channel: "text", message: "Hi {{First Name}}, {{Your Name}} here. How's the first week in the new place? If anything's come up with the house, I'm happy to point you to people I trust." },
          { title: "Anything you need", timing: "Day 30", channel: "email", subject: "A month in—anything I can help with?", message: "Hi {{First Name}},\n\nA month in already. If you need a recommendation for a painter, electrician or anyone else, just say the word—I keep a short list of people my clients have been happy with.\n\nAnd if you know someone starting their own search, I'd be glad to help them too.\n\n{{Your Name}}" },
          { title: "Closing anniversary", timing: "1 year", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. Hard to believe it's been a year since closing. Hope the house has been good to you—happy anniversary!" }
        ]
      }
    ]
  },
  {
    id: "consulting", slug: scenario("consulting").slug, label: "Consulting", navLabel: "Consultants", noun: "independent consultants",
    headline: "Your network shouldn’t go quiet when client work gets busy.",
    supporting: "Keep the context, plan the next step, and prepare a personal follow-up—without turning relationship maintenance into another project.",
    demoHeading: "Try a consulting mix",
    mixes: [
      {
        id: "milestone", label: "Revisit a milestone", description: "A prospect who wants to talk again after a business milestone · Reconnect at the right moment.",
        steps: [
          { title: "Confirm the plan", timing: "Immediate", channel: "email", subject: "Picking this up once the managers are in place", message: "Hi {{First Name}},\n\nThanks for the conversation today. It makes sense to revisit onboarding once the new managers are in place—I'll reach out then rather than fill your inbox in the meantime.\n\n{{Your Name}}" },
          { title: "Reconnect around the milestone", planned: true, timing: "Agreed date", channel: "email", subject: "Picking up our conversation", message: "Hi {{First Name}}—when we spoke, you wanted to revisit onboarding once the new managers were in place. Has that timing changed, or would it be useful to pick up the conversation?" },
          { title: "Scope the next step", timing: "Day 7 after", channel: "phone", message: "• What's changed since the managers started?\n• Where is onboarding still slow?\n• Offer a short working session, not a proposal\n• Agree who owns the next step" }
        ]
      },
      {
        id: "handover", label: "After the handover", description: "A client whose engagement just ended · Check the process is holding up.",
        steps: [
          { title: "Three-week check", timing: "Day 21", channel: "email", subject: "How the new intake process is holding up", message: "Hi {{First Name}}—it's been a few weeks since we handed over the new intake process. What's working well, and where is the team still getting stuck?" },
          { title: "Quarter review", timing: "Day 90", channel: "email", subject: "A quarter in", message: "Hi {{First Name}},\n\nA quarter in—I'd be curious how the process has settled. If it's useful, I can spend half an hour looking at what's drifted and what to leave alone.\n\n{{Your Name}}" },
          { title: "Referral conversation", timing: "Day 100", channel: "phone", message: "• Ask what they'd do differently next time\n• Is there another team facing the same problem?\n• Ask for one introduction, not a testimonial" }
        ]
      },
      {
        id: "went-quiet", label: "Went quiet", description: "Someone who already understands what you do · A reason to reconnect, not a pitch.",
        steps: [
          { title: "Share something useful", timing: "Immediate", channel: "email", subject: "Thought of you", message: "Hi {{First Name}},\n\nSaw this and thought of the conversation we had about handoffs between teams—no reply needed, just thought it was worth passing along.\n\n{{Your Name}}" },
          { title: "Light check-in", timing: "Day 30", channel: "email", subject: "How's the quarter going?", message: "Hi {{First Name}},\n\nHow's the quarter treating you? If anything on the operations side has become a headache, I'm happy to think it through with you—no engagement required.\n\n{{Your Name}}" }
        ]
      }
    ]
  },
  {
    id: "photography", slug: scenario("photography").slug, label: "Photography", navLabel: "Photographers", noun: "independent photographers",
    headline: "You sent the pricing. Give the conversation a next step.",
    supporting: "Give your client relationships the same attention you give your work—before someone books, and after the gallery is delivered.",
    demoHeading: "Try a photography mix",
    mixes: [
      {
        id: "pricing-sent", label: "Pricing sent", description: "An inquiry comparing packages · A useful clarification while they decide.",
        steps: [
          { title: "Send the pricing", timing: "Immediate", channel: "email", subject: "Your coverage options", message: "Hi {{First Name}},\n\nLovely to talk today. Here are the two options we discussed—shorter coverage and the full day—with what each includes. Happy to walk through either one.\n\n{{Your Name}}" },
          { title: "Help them compare", timing: "Day 3", channel: "email", subject: "Any questions about the options?", message: "Hi {{First Name}}—when we spoke, you were deciding between shorter coverage and the full-day package. Is there anything I can clarify to help you compare them?" },
          { title: "Dates still open", timing: "Day 10", channel: "text", message: "Hi {{First Name}}, {{Your Name}} here. No pressure at all—just letting you know your date is still open on my side. Happy to hold it for a few days if that helps." }
        ]
      },
      {
        id: "after-gallery", label: "After the gallery", description: "A client whose photos are delivered · Don't let a great experience end with the gallery.",
        steps: [
          { title: "Gallery delivered", timing: "Day 2", channel: "email", subject: "Your gallery is ready", message: "Hi {{First Name}},\n\nYour gallery is live—I've marked a few favourites from the day. Take your time with it, and let me know if anything needs a second look.\n\n{{Your Name}}" },
          { title: "Prints and albums", timing: "Day 14", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. If you'd like any of the images as prints or an album, I can put a few options together—just say which ones you keep coming back to." },
          { title: "Planned dates", planned: true, timing: "Seasonal", channel: "text", message: "Hi {{First Name}}—you asked me to check back when I planned the autumn portrait dates. They're ready now. Would you like me to send the options?" },
          { title: "One year on", timing: "1 year", channel: "email", subject: "A year since your session", message: "Hi {{First Name}},\n\nA year since we shot together—I still love those images. If you'd like to mark the anniversary with a session, I'd be glad to.\n\n{{Your Name}}" }
        ]
      },
      {
        id: "vendor-thanks", label: "Vendor thank-you", description: "A planner, florist or venue you worked alongside · Share the work and keep the referral warm.",
        steps: [
          { title: "Share their work", timing: "Day 2", channel: "email", subject: "A few images of your arrangements", message: "Hi {{First Name}}—it was great working with you on Saturday. I've selected a few images of the floral arrangements. What's the best email to send them to?" },
          { title: "Share the feature", timing: "Day 30", channel: "email", subject: "The day was featured", message: "Hi {{First Name}},\n\nThe wedding was just featured—your arrangements look wonderful in it. I've credited you throughout; feel free to share.\n\n{{Your Name}}" }
        ]
      }
    ]
  },
  {
    id: "painting", slug: scenario("painting").slug, label: "Contractors", navLabel: "Contractors", noun: "independent contractors",
    headline: "You sent the estimate. Don’t lose track of the conversation.",
    supporting: "Keep the customer's context, your next step, and a message you can make your own together—from the truck, between jobs.",
    demoHeading: "Try a contractor mix",
    mixes: [
      {
        id: "estimate-sent", label: "Estimate sent", description: "An open estimate · Clarify the scope while they're still deciding.",
        steps: [
          { title: "Estimate on its way", timing: "Immediate", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. Your estimate is in your inbox—two options in there like we discussed. Any questions, just text me." },
          { title: "Help them choose", timing: "Day 2", channel: "text", message: "Hi {{First Name}}—it's {{Your Name}}. You mentioned wanting to compare the smaller scope with the full project. Is there anything I can clarify about the two options?" },
          { title: "Walk it through", timing: "Day 5", channel: "phone", message: "• Which option are they leaning to?\n• Any rooms to add or drop?\n• Confirm start dates you have open\n• Agree when they'll decide" },
          { title: "Dates filling up", timing: "Day 10", channel: "text", message: "Hi {{First Name}}, {{Your Name}} here. No pressure—just letting you know the dates we talked about are starting to fill. Happy to pencil you in if you'd like." }
        ]
      },
      {
        id: "deferred", label: "Waiting on the flooring", description: "A project that depends on another trade finishing · Check back when they asked.",
        steps: [
          { title: "Note the plan", timing: "Immediate", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. Makes sense to wait until the flooring is in. I'll check back after it's installed—if the timing shifts, just let me know." },
          { title: "Check back", planned: true, timing: "Agreed date", channel: "text", message: "Hi {{First Name}}—you asked me to check back after the flooring was installed. Has that timing changed, or would it be useful to revisit the plan?" },
          { title: "Confirm the scope", timing: "Day 7 after", channel: "phone", message: "• Is the flooring done?\n• Same rooms, or has the plan grown?\n• Offer to re-walk the space\n• Give two start dates" }
        ]
      },
      {
        id: "job-done", label: "Job done", description: "A finished job · Check in, thank them, and stay on the list for next time.",
        steps: [
          { title: "A few days later", timing: "Day 3", channel: "text", message: "Hi {{First Name}}—now that you've had a few days back in the space, is there anything from the project you'd like me to take another look at?" },
          { title: "Thanks and a review", timing: "Day 14", channel: "email", subject: "Thanks from {{Your Name}}", message: "Hi {{First Name}},\n\nThanks again for having us in. If you were happy with the work, a short review helps more than you'd think—and if you know anyone planning a project, I'd be glad to help them too.\n\n{{Your Name}}" },
          { title: "Next project", timing: "6 months", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. If there's another project on your list this year, I'm booking now and happy to take a look." }
        ]
      }
    ]
  },
  {
    id: "recruiting", slug: scenario("recruiting").slug, label: "Recruiting", navLabel: "Recruiters", noun: "independent recruiters",
    headline: "Stay connected with good people—even when there isn’t an open role.",
    supporting: "Personal follow-up for recruiters who build relationships, not just contact lists. Remember what you agreed, and follow through on it.",
    demoHeading: "Try a recruiting mix",
    mixes: [
      {
        id: "candidate-timing", label: "Candidate's timing", description: "A candidate who is happy where they are, for now · Reconnect when they asked you to.",
        steps: [
          { title: "Respect the timing", timing: "Immediate", channel: "email", subject: "After your planning cycle", message: "Hi {{First Name}},\n\nThanks for the candid conversation. I'll reach out once your planning cycle wraps up, as you suggested—nothing before then unless you get in touch first.\n\n{{Your Name}}" },
          { title: "Reconnect as agreed", planned: true, timing: "Agreed date", channel: "email", subject: "Is this still a useful time?", message: "Hi {{First Name}}—you asked me to reconnect after your planning cycle wrapped up. Is this still a useful time for a conversation, or would you prefer to leave it for later?" },
          { title: "Catch up properly", timing: "Day 7 after", channel: "phone", message: "• What's changed in their role since planning?\n• What would make a move worth it?\n• Nothing to pitch—just listen\n• Agree how they'd like to be contacted next" }
        ]
      },
      {
        id: "client-plans", label: "Client's hiring plans", description: "A hiring manager whose search depends on budget · Revisit when the timing is clearer.",
        steps: [
          { title: "Revisit the timing", timing: "Day 30", channel: "email", subject: "The controller search", message: "Hi {{First Name}}—when we last spoke, the controller search depended on next quarter's budget. Has the timing become clearer, or should we revisit it another time?" },
          { title: "Quarter check", timing: "Day 90", channel: "email", subject: "Checking in on the quarter", message: "Hi {{First Name}},\n\nNew quarter—if the controller role is back on the table, I have a couple of people worth a conversation. If not, no problem at all; I'll check back later in the year.\n\n{{Your Name}}" },
          { title: "Plan the search", timing: "Day 100", channel: "phone", message: "• Confirm budget and start date\n• What's changed in the brief?\n• Agree the shortlist timeline" }
        ]
      },
      {
        id: "honest-update", label: "Honest update", description: "A candidate waiting on a client decision · Keep your word, even when nothing has changed.",
        steps: [
          { title: "The update you promised", timing: "Immediate", channel: "email", subject: "Update, as promised", message: "Hi {{First Name}}—I said I'd update you today. I'm still waiting for the client's feedback and don't have a decision to share yet. I'll contact you again on Thursday, even if the position is unchanged." },
          { title: "Thursday, as promised", timing: "Day 2", channel: "email", subject: "Thursday update", message: "Hi {{First Name}},\n\nAs promised: I've chased the client and expect their decision early next week. Nothing has changed on your side. I'll be in touch the moment I hear.\n\n{{Your Name}}" },
          { title: "Close the loop", timing: "Day 14", channel: "text", message: "Hi {{First Name}}, it's {{Your Name}}. Whatever the outcome, thank you for your patience through this one. I'd like to stay in touch either way—if that's welcome, let me know how you prefer to hear from me." }
        ]
      }
    ]
  }
];

export function persona(value: string | null | undefined): Persona | null {
  return PERSONAS.find(item => item.id === value || item.slug === value) ?? null;
}
