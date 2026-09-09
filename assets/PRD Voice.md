# Jump in the Mix — Assistant + Voice

**Product Requirements Document**
**Tier Price:** $49.99/month
**Positioning:** AI-powered relationship, follow-up, communication, calendar, contact, and Mix-management assistant.

---

# 1. Product Vision

Jump in the Mix Assistant turns traditional drip campaigns into an intelligent, conversational follow-up system.

Instead of simply:

**Day 1 → Email → Day 3 → Text → Day 7 → Email**

Jump continuously understands:

* who the contact is
* how the relationship started
* what the person wants
* whether they replied
* what they said
* whether follow-up is appropriate
* what channel should be used
* what Mix they belong in
* whether a scheduled message should still be sent
* what the user has authorized the assistant to do

Users can control this through:

* web application
* mobile application
* text chat with Jump
* voice conversation with Jump
* Siri/App Shortcuts on iPhone
* Android assistant integrations where practical

The product should feel like delegating communication work to a competent human assistant.

---

# 2. Tier Definition

## Assistant + Voice — $49.99/month

Includes:

### AI Intelligence

* Inbox analysis
* Reply detection
* Contact identification
* Contact categorization
* Lead/inquiry classification
* Conversation summaries
* AI-generated responses
* Next-action recommendations
* Smart Mix enrollment
* Smart Mix removal
* Automatic drip interruption after replies
* Contact-status management
* Calendar intelligence
* Contact intelligence
* Daily briefing
* Action/approval queue
* Natural-language Jump management

### Communication

* Connected email accounts
* SMS/MMS integration where supported
* iPhone messaging bridge where supported
* Android messaging integration where supported
* User's existing email address
* User's existing mobile number where technically supported

### Organization

* Calendar
* Contacts
* Follow-ups
* Meetings
* reminders
* Mix management

### Voice

* Premium realtime speech recognition
* Premium conversational TTS
* Interruptible conversation
* Tool/action calling
* Siri/App Shortcut entry points
* Mobile voice interface

### Intake

* Unique QR contact links
* Event-specific QR codes
* Contact-intake tracking
* Inbound-first communication
* Permission/relationship tracking

---

# 3. Intentional Scope

Jump Assistant is **not initially a universal AI assistant**.

Its operational scope is:

1. Drip campaigns / Mixes
2. Email
3. SMS/MMS/messages
4. Calendar
5. Contacts
6. Client/inquiry follow-up
7. Jump in the Mix application management

Examples:

> "Who replied today?"

> "Remove everyone who scheduled an appointment from my follow-up Mix."

> "What do I have going out today?"

> "Read Sarah's last email."

> "Move her into Interested."

> "Draft a response."

> "Send it."

> "Move tomorrow's appointment to 2:30."

> "Add everyone I met at today's event to my Event Follow-Up Mix."

Documents, proposals, invoices, receipts, CRM expansion and broader business operations should remain future extension points rather than expanding this release.

---

# 4. Core Assistant Architecture

```text
                    JUMP ASSISTANT
                          │
                Conversation Engine
                  Text + Voice
                          │
                    Action Engine
                          │
          ┌───────────────┼────────────────┐
          │               │                │
       Messages         Calendar        Contacts
          │
       Email/SMS
          │
          ▼
                Intelligence Engine
                          │
                Contact State Engine
                          │
                     Mix Engine
                          │
                Safety / Permission
                          │
                     Audit Log
```

Every assistant capability should ultimately map to a controlled **tool/action**.

Examples:

```text
get_contact()
get_recent_messages()
summarize_conversation()
send_email()
prepare_sms()
send_approved_sms()
create_calendar_event()
move_contact_to_mix()
pause_mix()
resume_mix()
stop_mix()
create_follow_up()
update_contact()
generate_qr_intake()
```

The LLM decides **which tool should be used**.

The application—not the LLM—determines whether it is authorized.

---

# 5. Voice Usage Limits

Voice is premium but bounded.

## Account Limits

| Window                |                Maximum |
| --------------------- | ---------------------: |
| Rolling 4-hour window |             30 minutes |
| Calendar day          |             60 minutes |
| Calendar week         |            180 minutes |
| Calendar month        | 600 minutes / 10 hours |

All voice sessions across all devices count toward the same account ledger.

### Rule

Whichever limit is reached first wins.

Example:

A user speaks for:

* 30 minutes at 9:00 AM
* another session becomes available after the rolling four-hour restriction permits it
* total daily usage can never exceed 60 minutes
* weekly usage can never exceed 180 minutes
* monthly usage can never exceed 600 minutes

Daily/weekly/monthly counters use the workspace's selected timezone.

Changing timezone must **not reset usage counters**.

---

# 6. Voice Usage Meter

Voice usage must be visible at all times.

Example:

```text
VOICE

Today
██████████████░░░░░░
42 / 60 min

This week
████████░░░░░░░░░░░░
74 / 180 min

This month
████░░░░░░░░░░░░░░░░
128 / 600 min
```

During conversation:

```text
Jump Voice
17:42 remaining
```

The displayed remaining amount should represent the **most restrictive active limit**.

---

# 7. Voice Limit Notifications

Jump should never unexpectedly terminate a conversation because the user unknowingly reached a quota.

### Voice + visual notification

At approximately:

**5 minutes remaining**

> "Just so you know, you have about five minutes of voice time remaining in your current allowance."

**1 minute remaining**

> "You have about one minute remaining."

**15 seconds remaining**

Visual countdown appears.

**Limit reached**

> "You've reached your voice allowance for this period. We can continue here by text."

The assistant should explain **which limit was reached**:

* four-hour limit
* daily limit
* weekly limit
* monthly limit

Example:

> "You've reached your 30-minute allowance for this four-hour window. Your weekly and monthly voice allowance is still available."

---

# 8. Five-Second Safe Spend Limiter

This should be implemented as a **Cloud Voice Idle Cutoff**.

A literal five-second conversation termination would make voice frustrating because people naturally pause.

Instead:

```text
Jump finishes speaking
        ↓
Listening
        ↓
5 seconds without user speech
        ↓
CLOUD VOICE STREAM STOPS
        ↓
Conversation context remains
        ↓
User speaks/taps
        ↓
Realtime stream reconnects
```

## Requirements

At five seconds without meaningful voice input:

* stop transmitting audio to billable cloud STT/voice services
* stop model inference
* release or suspend billable realtime resources
* preserve conversation state locally/server-side
* preserve tool state
* preserve transcript
* resume quickly when the user continues

The UI can display:

> **Jump is standing by**

rather than ending the conversation.

Where technically practical, lightweight on-device VAD can detect that the user has resumed speaking without continuously sending silence to the cloud.

### Important

The idle timer starts **after Jump finishes speaking**.

Assistant speech must never count as user inactivity.

---

# 9. Additional Spend Circuit Breakers

Voice-minute limits should not be our only financial protection.

Jump should maintain a realtime **usage ledger**:

```text
user_id
session_id
provider
model
audio_input
audio_output
estimated_cost
started_at
ended_at
idle_time
billable_time
```

Platform-level safeguards:

### User limiter

Prevent consumption beyond published limits.

### Provider-cost limiter

Detect unexpected increases in voice cost.

### Session limiter

Kill abandoned or malfunctioning sessions.

### Workspace limiter

Prevent runaway background agent activity.

### Platform limiter

Emergency systemwide AI spending circuit breaker.

### Model-routing limiter

An inexpensive model should perform routine tasks.

Premium reasoning models should only be invoked when necessary.

No background process should repeatedly call an LLM without an event or user request.

---

# 10. AI Intelligence Engine

Incoming communication creates an intelligence event.

```text
Incoming message
       ↓
Identify contact
       ↓
Identify conversation
       ↓
Classify intent
       ↓
Extract useful facts
       ↓
Update relationship state
       ↓
Determine Mix impact
       ↓
Determine next action
```

## Standard extraction

Jump should identify where possible:

* contact
* company
* source
* intent
* topic
* requested action
* sentiment
* urgency
* dates
* times
* products/services
* meeting requests
* pricing requests
* opt-out language
* follow-up timing
* relationship stage

Example:

```text
CONTACT
Angela Chen

SOURCE
QR → LA Business Expo

INTENT
Website redesign inquiry

STAGE
New Inquiry

INTEREST
High

CHANNEL
SMS

CONTACT ORIGIN
Inbound-first

NEXT ACTION
Respond

RECOMMENDED MIX
New Website Inquiry
```

---

# 11. Intelligent Mix Behavior

Before every scheduled Beat, Jump should evaluate whether the Beat is still appropriate.

```text
Beat becomes due
      ↓
Check recent conversation
      ↓
Check permission
      ↓
Check contact status
      ↓
Check calendar
      ↓
Check prior actions
      ↓
Send / Modify / Pause / Cancel / Escalate
```

Examples:

### No response

Continue Mix.

### Contact replies positively

Pause generic follow-up.

### Meeting scheduled

Exit sales follow-up.

### "Contact me next month"

Snooze.

### "Not interested"

Exit Mix.

### STOP / unsubscribe

Immediately suppress future applicable outreach.

### Question asked

Do not send unrelated scheduled follow-up.

Instead notify the user or generate an appropriate response.

---

# 12. Action Permission System

Each action gets an authorization class.

## GREEN — Autonomous

Examples:

* categorize contact
* summarize email
* identify reply
* update AI notes
* stop Mix after opt-out
* pause inappropriate scheduled message

## YELLOW — User configurable

Options:

**Ask Every Time**

**Daily Batch Approval**

**Automatically Approve**

Examples:

* send follow-up email
* prepare text
* send permitted text
* reschedule follow-up
* create calendar event

## RED — Explicit Approval

Examples:

* unusually large batch
* unusual recipient group
* action outside normal behavior
* potentially risky outreach
* material account configuration change

The user can simply say:

> "I approve today's messages."

or:

> "Send everything except John's message."

---

# 13. Outreach Safety System

This should be branded positively as something like:

## Outreach Health

rather than:

"Spam avoidance."

The goal is not to circumvent spam filters.

The goal is to help users send **wanted, relevant communication** and protect their real phone number and email reputation.

CTIA's messaging guidance emphasizes consumer consent and opt-out capability for organizational/non-consumer texting, including one-to-one business communications.

Google similarly recommends sending to people who signed up, ramping volume gradually, avoiding sudden volume spikes and monitoring recipient feedback. Gmail recommends keeping Postmaster spam rates below **0.1%** and preventing them from reaching **0.3%**.

---

# 14. Contact Permission State

Every contact should have a channel-specific relationship/permission state.

Example:

```text
SMS
● Inbound initiated
● Explicit follow-up permission

EMAIL
● Existing conversation

MARKETING
○ Not explicitly enabled
```

Internal states:

### VERIFIED INBOUND

The contact contacted the user first.

### EXPLICIT OPT-IN

The contact explicitly requested relevant follow-up.

### EXISTING RELATIONSHIP

Existing client, inquiry or active conversation.

### UNKNOWN / COLD

No evidence of prior relationship.

### OPTED OUT

Communication prohibited for the applicable category/channel.

These states must be tracked independently for:

* email
* SMS
* promotional messaging
* transactional communication

---

# 15. Automated Texting Guardrails

For automated SMS/MMS from a personal phone:

### Automatic Mix sending

Require:

* inbound-first relationship; or
* applicable opt-in/permission; or
* another qualifying relationship state defined by platform policy

### Unknown/cold phone number

Do **not** automatically place the number into an autonomous SMS drip.

Jump may:

* warn the user
* allow them to draft a one-to-one message
* require explicit user action where appropriate

but shouldn't turn personal numbers into automated cold-text blasting infrastructure.

This protects both Jump and the user's real phone number.

---

# 16. Email Outreach Guardrails

Federal CAN-SPAM rules do not simply prohibit all unsolicited commercial email, but commercial email carries requirements including truthful sender information, non-deceptive subjects, postal-address disclosure, an opt-out mechanism and honoring opt-outs.

Jump should go beyond the minimum legal baseline.

## Automated email Mix

Preferred:

* prior inbound email
* existing relationship
* explicit signup
* QR intake
* form submission
* event contact exchange
* documented permission

## Cold email

Allowed only under stricter controls:

* Review Required mode
* user confirms how the address was obtained
* no purchased/scraped lists
* conservative sending
* no deceptive reply/forward subject lines
* automatic unsubscribe handling where applicable
* bounce monitoring
* frequency control
* provider-limit enforcement

Google explicitly advises against sending to recipients who didn't sign up and against deceptive message presentation.

---

# 17. Outreach Health Score

Every workspace receives an Outreach Health indicator.

Example:

```text
OUTREACH HEALTH

92 / 100
Excellent

✓ Mostly inbound contacts
✓ Low bounce rate
✓ Healthy reply rate
✓ No recent opt-out issues
✓ Sending volume stable

!
7 contacts have unknown permission status
```

Potential signals:

* inbound vs cold ratio
* opt-in provenance
* reply rate
* bounce rate
* unsubscribe rate
* spam complaint rate where available
* recent sending-volume changes
* frequency per contact
* recipient engagement
* duplicate outreach attempts
* invalid addresses
* provider errors

The score should generate **actionable recommendations**, not simply a number.

---

# 18. Pre-Campaign Health Check

Before enabling a Mix, Jump asks:

### Where did these contacts come from?

* They contacted me
* Existing customers
* QR intake
* Website form
* Event
* Referral
* Personal/business relationship
* Imported list
* Other

### Have they communicated with you previously?

Yes / Some / No

### Did they request follow-up?

Yes / No / Unknown

### What are you contacting them about?

User provides purpose.

Jump then evaluates the campaign.

Example:

> **Good to go**

> 82% of these contacts have an existing conversation with you.

or:

> **Review recommended**

> 37 contacts have no recorded interaction or permission history. I recommend reviewing them before activating automatic text follow-up.

---

# 19. QR Contact Intake System

This should become a central Jump feature.

## Goal

Convert an offline interaction into a structured digital relationship.

Instead of:

> "Give me your number."

The Jump user shows:

### Their Jump QR

The other person scans it.

---

# 20. QR Architecture

The QR should **not contain personal information directly**.

It contains an opaque secure URL such as:

```text
jumpinthemix.com/i/J7X4KQ
```

The token resolves server-side to:

```text
Owner
Kevin

Event
LA Business Expo

Source
Booth 214

Topic
Web Development

Recommended Mix
Event Follow-Up

Assigned User
Kevin

Created
Sept 8
```

This protects privacy and allows the QR configuration to change without reprinting it.

---

# 21. QR Intake Experience

```text
SCAN QR
   ↓
Jump Contact Page
   ↓

Connect with Kevin

We met at:
LA Business Expo

Regarding:
Website / Shopify Services

[ Text Kevin ]

[ Email Kevin ]

[ Save Contact ]
```

The visitor chooses the channel.

---

# 22. Prefilled Text

Selecting **Text Kevin** opens their normal Messages application.

Example:

> Hi Kevin — this is Angela. We met at the LA Business Expo. I'm interested in discussing a Shopify website. You can text me about this request and related follow-up. Reply STOP anytime. Ref: J7X4KQ

The visitor still presses **Send**.

That means the communication originates from them.

When Jump detects the inbound message:

```text
Inbound detected
       ↓
QR reference matched
       ↓
Contact created
       ↓
Source attached
       ↓
Event attached
       ↓
Purpose attached
       ↓
Permission/provenance recorded
       ↓
AI categorizes
       ↓
Suggested Mix
```

---

# 23. Prefilled Email

Selecting **Email Kevin** could open:

```text
TO
kevin@example.com

SUBJECT
LA Business Expo — Website Inquiry

BODY
Hi Kevin,

This is Angela. We met at the LA Business Expo.

I'm interested in discussing:
Shopify / website development

You can follow up with me about this request.

Reference: J7X4KQ
```

Again, the prospective client sends the communication.

Jump then identifies it automatically.

---

# 24. Important Consent Design

An inbound message should **not automatically be interpreted as unlimited marketing permission**.

Jump should distinguish:

```text
Conversation initiated
        ≠
Unlimited promotional consent
```

The Permission Engine should store:

```text
source
channel
timestamp
purpose
consent wording/version
scope
campaign
revocation
```

The QR flow can provide explicit choices such as:

```text
How should Kevin follow up?

☑ About this request

□ Occasional updates/offers
```

Marketing permission should remain separate.

CTIA's messaging principles recommend obtaining consumer consent and permitting revocation, and specifically distinguish marketing consent expectations.

Because communication rules change over time, these policies should be configuration-driven rather than hard-coded. For example, an FCC one-to-one consent rule adopted in 2023 was subsequently vacated by the Eleventh Circuit, and the FCC restored the prior regulatory text in 2025.

---

# 25. QR Types

Users can generate:

### Personal QR

General contact intake.

### Event QR

```text
LA Business Expo
September 2026
```

Automatically tags contacts with the event.

### Service QR

```text
Website Consultation
```

### Mix QR

New inbound contacts become candidates for a particular Mix.

### Campaign QR

Track a particular offline campaign.

Each QR can define:

* owner
* event
* source
* purpose
* tags
* preferred Mix
* default message
* contact options
* expiration
* consent wording/version

---

# 26. QR Analytics

Example:

```text
LA BUSINESS EXPO QR

124 scans

73 contact actions

41 texts received
24 emails received
8 contact saves

65 contacts created

18 meetings booked
```

This gives QR codes attribution value in addition to contact capture.

---

# 27. Daily Assistant Briefing

The assistant tier should provide a daily briefing.

Example:

> **Good morning, Kevin.**

> You received four new inquiries overnight.

> Three came from yesterday's QR code.

> Seven people replied to active Mixes, so I paused their scheduled follow-ups.

> You have 12 communications scheduled today. Two need your review.

> You also have three meetings.

Then:

> "Want me to go through the messages?"

The user can respond:

> "Just show me the ones that need attention."

or:

> "Read them."

or:

> "I approve everything."

---

# 28. Voice Assistant

Voice is another interface into the exact same Jump agent.

```text
Voice
  ↓
Speech Recognition
  ↓
Jump Agent
  ↓
Tool Calls
  ↓
Jump Data / Email / Calendar / Contacts
  ↓
Response
  ↓
TTS
```

Requirements:

* streaming STT
* streaming TTS
* interruption/barge-in
* natural turn taking
* strong names/date/time recognition
* noise handling
* low latency
* tool calling
* transcript continuity
* voice usage ledger
* idle cutoff
* quota enforcement

Target experience:

**median first audible response:** <1 second where technically practical

**p95:** <1.5–2 seconds for ordinary queries

Tool-heavy requests can provide acknowledgement before the full result.

---

# 29. Mobile / Siri Integration

Jump iOS application exposes App Intents/App Shortcuts.

Examples:

> "Siri, talk to Jump in the Mix."

> "Siri, open Jump."

> "Siri, ask Jump what's going out today."

That launches Jump's realtime voice session.

The iPhone messaging adapter remains a separate capability behind the same action/permission framework.

---

# 30. Core Data Model

Minimum entities:

```text
Workspace
User

Contact
ContactChannel
ContactRelationship

Interaction
Conversation

PermissionGrant
PermissionRevocation

Mix
MixBeat
MixEnrollment

Action
ActionApproval

CalendarEvent

QRIntake
QRScan
IntakeSession

VoiceSession
VoiceUsageLedger

OutreachRiskSignal
OutreachHealth

AgentMemory
AuditEvent
```

Every automated communication should be traceable through the audit log.

---

# 31. Roadmap

## PHASE 0 — Platform Foundation

Build first:

* multi-tenant workspace architecture
* permissions
* OAuth/token security
* event bus
* background job queue
* Action Engine
* Approval Engine
* audit logs
* usage ledger
* feature flags
* AI cost accounting

**Exit condition:** every AI action is attributable to a workspace, user, contact and authorization state.

---

## PHASE 1 — AI Intelligence

Implement:

* email event ingestion
* conversation threading
* contact matching
* intent classification
* conversation summarization
* contact state
* reply detection
* requested-follow-up extraction
* opt-out detection
* calendar understanding
* next-action generation

**Exit condition:** Jump can correctly explain what happened in a conversation and recommend what should happen next.

---

## PHASE 2 — Intelligent Mix Engine

Implement:

* AI entry recommendations
* automated Mix enrollment policies
* pre-Beat intelligence check
* reply-aware pausing
* calendar-aware Mix behavior
* contact-state transitions
* snoozing
* automatic Mix completion
* approval queue
* daily action review

**Exit condition:** Mixes react to conversations instead of merely following timers.

---

## PHASE 3 — Outreach Safety

Implement:

* permission-state model
* contact-source provenance
* SMS automation eligibility
* cold-email Review Required mode
* opt-out suppression
* contact frequency caps
* sending-rate anomaly detection
* bounce handling
* duplicate prevention
* provider-limit enforcement
* Outlook/Gmail deliverability signals where available
* Outreach Health Score
* campaign preflight

**Exit condition:** automatic outreach cannot bypass suppression or permission rules.

---

## PHASE 4 — QR Contact Intake

Implement:

* QR generator
* secure intake token
* hosted intake page
* SMS deep link
* email deep link
* contact-save option
* event metadata
* purpose
* tags
* Mix recommendation
* consent/provenance record
* QR analytics
* expiration/revocation

**Exit condition:** scan → send → inbound detection → contact → AI classification → Mix recommendation works end-to-end.

---

## PHASE 5 — Voice Assistant

Implement:

* realtime STT
* realtime TTS
* tool calling
* interruption
* transcript
* conversational memory
* voice usage ledger
* quota enforcement
* five-second Cloud Idle Cutoff
* visual limit warnings
* spoken limit warnings
* automatic text fallback

**Exit condition:** a user can manage their normal Jump workflow entirely by voice.

---

## PHASE 6 — Native Assistant Integration

### iOS

* Jump mobile application
* App Intents
* Siri shortcuts
* voice launch
* notifications
* optional iPhone Messages bridge
* daily brief
* approval notifications

### Android

* Jump mobile application
* voice assistant entry
* messaging adapter where approved
* notifications
* daily brief

**Exit condition:** Jump feels like an installed assistant rather than a mobile website.

---

## PHASE 7 — Scale & GA Hardening

Before broad release:

* load testing
* 10K+ workspace simulation
* voice concurrency testing
* queue backpressure
* API-provider failover
* AI model fallback
* rate limits
* abuse detection
* cost anomaly alerts
* encrypted credentials
* retention controls
* privacy controls
* permission audits
* observability dashboards
* incident controls

---

# 32. Cost Guardrail

For the $49.99 plan, design around a target premium voice cost of approximately:

**$0.035–$0.05 per conversational minute**

At the absolute 600-minute monthly ceiling:

```text
600 × $0.035 = $21

600 × $0.05 = $30
```

Add normal AI/infrastructure and the maximum-use customer may cost roughly:

**$23–$33/month**

That is not the typical expected user.

An average customer using:

```text
90 voice minutes/month
```

would likely have substantially healthier economics.

Therefore:

### 600 minutes should be a hard maximum

not an expected usage level.

No automatic paid overages in V1.

---

# 33. Product Success Metrics

Primary:

### AI

* % AI classifications accepted without correction
* % next actions accepted
* incorrect autonomous action rate
* Mix auto-pause accuracy

### Outreach

* reply rate
* bounce rate
* opt-out rate
* spam complaint rate where measurable
* % automated messages sent to verified/qualified relationships
* zero messages sent after applicable opt-out

### QR

* scans
* scan → contact conversion
* inbound-first contacts
* meeting conversion
* Mix conversion

### Voice

* minutes/user
* cost/minute
* idle minutes prevented
* response latency
* session completion
* tool-action success
* voice → text fallback rate

### Product

* active Mixes/user
* contacts followed up
* missed-follow-up reduction
* assistant actions approved
* assistant actions automated

---

# 34. Product Principle

Jump should optimize for:

> **Better relationships, not more messages.**

The assistant should frequently conclude:

> "Don't send anything."

That is as valuable as writing the next message.

The intelligence advantage is knowing **when communication is appropriate**, what it should say, and when a person should be left alone.

---

# 35. Final Product Loop

The complete Jump workflow becomes:

```text
                     MEET SOMEONE
                          │
                       QR SCAN
                          │
               THEY TEXT / EMAIL FIRST
                          │
                    CONTACT CREATED
                          │
                  AI UNDERSTANDS WHY
                          │
                  PERMISSION RECORDED
                          │
                     MIX SELECTED
                          │
                  FOLLOW-UP OCCURS
                          │
                   CONTACT RESPONDS
                          │
                   AI UNDERSTANDS
                          │
                    MIX ADAPTS
                          │
                MEETING / CONVERSION
```

And the owner manages everything by saying:

> **"Jump, what needs my attention?"**
