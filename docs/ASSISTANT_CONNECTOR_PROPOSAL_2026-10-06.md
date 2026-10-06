# Assistant connector proposal — October 6, 2026

> **Planned, not built.** Kevin decided on 2026-10-06 that owners will be able to use their own AI assistant with Jump in the Mix (D38–D41 in `docs/standards-audit-2026-09-28/OWNER_DECISIONS.md`). The connector is built after D33–D35 ship and the phone checks pass (D41). Nothing here is implemented. The decisions are recorded in JITM-00 §2.3 and §2.5, JITM-01 §2.25 and JITM-08 §2.35. The engineering below is a proposal for the build's WF-04 plan, to be written into JITM-11 when it is built. All times are UTC.

## What Kevin decided

Kevin's request: "I definitely want the connector that ai agents can connect to in the near future, to allow users that have chatgpt, iOS ai, claude, gemini, or any other capable model be able to utilize their ai assistant with jitm easily providing them with the needed information to be quick and take action on their behalf."

Kevin then answered four questions (VERIFIED-DOC, D38–D41):

| Decision | What it means |
|---|---|
| D38: the assistant sends after a yes | An owner's own assistant may send a prepared message from the owner's own number or email account after the owner says yes to that message. That counts as the owner sending it. Jump in the Mix itself never sends it, and records the send as the assistant reported it. |
| D39: one person at a time, undoable | An assistant reads the owner's own workspace and changes one person per request. Each change is shown back and can be undone. Skipping or completing asks first. Nothing changes many people at once. |
| D40: a Shortcut now, an app later | On iPhone, the first path is a Siri Shortcut that uses the owner's personal key. A native app waits for the demand signposts in JITM-01 §2.7. |
| D41: build after D33–D35 | The connector is designed now. It is built once D33–D35 and the phone checks are done, then given to the first tester wave. |

## What owners get, by assistant

The connector is one service with two doors:
- a **remote connector** for assistants that speak the Model Context Protocol (MCP);
- a small **personal-key API** for Siri Shortcuts.

MCP is the shared way assistants call outside tools. The Linux Foundation's Agentic AI Foundation has governed it since December 2025, and Claude, ChatGPT, Gemini and Microsoft Copilot use it ([Linux Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation), checked 2026-10-05 Pacific).

| Assistant | How it connects | Can it send a text or email after a yes? |
|---|---|---|
| ChatGPT, Claude, Microsoft Copilot and other MCP assistants | The owner adds Jump in the Mix as a connector, signs in and picks a workspace | Email through the owner's own connected email account, where the assistant supports sending with approval. Texts: no cloud assistant reviewed can send from the owner's phone number (INFERRED from published connector lists; note 04), so it offers the one-tap handoff the app already uses. |
| Gemini | The same connector, once Google's assistant accepts outside MCP connectors. That is on the roadmap for Google's always-on agent (note 03) but not verified as available. | Gemini can send texts but "can't read or summarize your messages" ([Gemini Apps Help](https://support.google.com/gemini/answer/15574940?hl=en)). With the connector it can fetch the prepared text, ask, send, and log the outcome. |
| Siri (iPhone) | A Siri Shortcut with the owner's personal key (D40) | The Shortcut puts the prepared text in Messages' compose sheet, and the owner's tap is the yes. Apple only lets apps prefill a message "for a person's approval" ([Apple Developer](https://developer.apple.com/documentation/messageui/mfmessagecomposeviewcontroller)). |

Example requests: "What's on my Today?"; "Read me the check-in for Jane and send it" (the assistant asks "Send it?" first); "I called Bob, no answer, try again Thursday"; "Add Maria from the open house and start the past-client Mix"; "Skip the review request for the Lees" (the assistant asks first).

Calls: an assistant may dial for the owner, who then speaks. It never holds an AI-generated voice call with a customer. That line is JITM-01 §2.26 and is still marked PROPOSED, so it needs Kevin's confirmation. The FCC has treated AI-generated voices as "artificial" under the TCPA since 2024-02-08 ([FCC](https://docs.fcc.gov/public/attachments/DOC-400393A1.pdf)).

## The connector's actions

The tool names are working names. Every tool acts inside the one workspace the grant covers.

| Tool | What it does | Kind |
|---|---|---|
| `get_today` | Due and overdue follow-ups: person, reason, Mix and Beat, channel and prepared wording | Read |
| `find_people` | Search people by name, phone, email, tag or stage | Read |
| `get_person` | Profile, notes, saved dates, stage, Mixes, next step and recent history | Read |
| `list_mixes` | The owner's Mixes and Mega-Mixes with their Beats | Read |
| `get_calendar` | Meetings and time blocks in a date range | Read |
| `prepare_message` | The prepared wording for one follow-up and channel, the person's number or email, and the handoff link | Read |
| `add_person` | Add one person, optionally with a note and a Mix | Change, undoable |
| `add_note` | Add a note to one person | Change, undoable |
| `log_outcome` | Record one follow-up's outcome, using the outcomes Today offers, including "sent by the assistant", and the next promise | Change, undoable |
| `reschedule` | Move or snooze one follow-up | Change, undoable |
| `start_mix`, `stop_mix` | Start or stop a Mix for one person, or mark "No Mix needed" once D33 ships | Change, undoable |
| `complete_follow_up`, `skip_follow_up` | Complete or skip one follow-up | Asks the owner first |
| `undo_change` | Undo the assistant's most recent change for one person | Change |

**Not offered:**
- deleting people or data; exports; account, billing, team or invitation administration; Marketplace publishing;
- bulk changes;
- reading replies or inboxes (JITM-01 §2.3);
- any send by Jump in the Mix itself.

**Proposed behavior to settle in the WF-04 plan:**
- **Undo window:** the most recent change per person, for a limited time.
- **Confirm-first tools:** these require an explicit confirmation flag, and carry MCP's "destructive" hint so assistants show their own confirmation.
- **Private notes:** prepared messages never include them. An assistant can read them because they are the owner's own data, so connecting an assistant shares them with that assistant's provider.
- **Plan limits:** these apply as they do in the app, while billing stays off.

## How a send after a yes works

1. The assistant calls `prepare_message` and shows the owner the person, the channel and the exact wording.
2. The owner says yes to that message, or taps send in the compose sheet.
3. The assistant sends from the owner's own number or email account. If it cannot, it offers the handoff link, and the owner sends from the phone's own app as today (JITM-08 §2.1–§2.2).
4. The assistant calls `log_outcome` with "sent by the assistant". Jump in the Mix records it as reported by that assistant, never as delivered (JITM-00 §2.3, JITM-08 §2.35).
5. The reply says when the next follow-up is due and offers Undo (JITM-08 §2.4, §2.35).

No step may run unattended. A scheduled or batched send without a yes for each message would be automatic sending, which stays an off-by-default option (JITM-00 §2.3).

## Security and tenancy (proposed engineering)

**Remote connector**
- An MCP endpoint served by the existing Next.js web service.
- Sign-in follows the current MCP authorization specification at build time: OAuth 2.1 with PKCE, with Jump in the Mix as the authorization server.
- A consent screen names the assistant and the workspace, and the two permissions: read, and act.

**Grants (JITM-00 §2.5)**
- Each grant covers one workspace for one owner.
- Access tokens are short-lived and refresh tokens rotate.
- Every token is random and stored only as a SHA-256 hash, as JITM-11 §2.37 requires for tokens today.
- Grants are revocable from a planned Settings page, "Connected assistants". It lists each assistant, when it was last used and what it changed.

**Siri Shortcut key**
- A personal key with an assistant scope, kept separate from D32's contact-import key.
- Shown once, stored as a hash, revocable.

**Requests**
- Both doors authenticate by bearer token. Like `/api/webhooks/*`, they would be named exceptions to the origin check, which needs a JITM-11 §2.38 amendment at build time.
- Each grant has a rate limit and a body-size limit.
- Changes carry idempotency keys, so a retried request never doubles an outcome (JITM-00 §2.6).

**Records and logs**
- Every assistant action is written to the person's history with the assistant's name (JITM-08 §2.35).
- Logs never contain message bodies, notes or tokens (JITM-11 §2.42).

**Privacy**
- When an owner connects an assistant, the data that assistant requests goes to its provider under the owner's own account. Jump in the Mix sends nothing to AI providers on its own.
- The privacy page and FAQ will need that wording through WF-03 and Kevin's approval.
- No public claim about the connector is made until it ships and Kevin approves the evidence (JITM-02 §2.17).

## Costs and hosting

- **Build:** needs no paid service. The MCP SDK is open source, and adding it as a dependency goes through JITM-11's dependency rules.
- **Using the connector:** owners may need a paid tier of their own assistant to add custom connectors. That is their cost, not the product's, and is to be verified for each assistant at build time.
- **Listing:** no directory listing is needed to use the connector, because owners can add it by its address. Listing in Claude's directory needs a paid Claude plan; submission has been self-serve since 2026-09-25 ([Claude docs](https://claude.com/docs/directory/publish), checked 2026-10-05 Pacific). ChatGPT's app directory has accepted submissions since December 2025 (note 04). Whether to list is Kevin's decision at launch (JITM-00 §2.9).
- **Hosting:** if the web service sleeps when idle on its current plan, the first assistant request after a quiet period waits for it to wake, and an assistant may give up first. The production plan's behavior is recorded as ambiguous in JITM-14, so check it before launch.

## Build plan, after D33–D35 and the phone checks

Each slice is its own WF-04 task with tests, labeled per JITM-12:

1. **Access:** grants, the sign-in and consent flow, revocation, and the Connected assistants page.
2. **Reading:** `get_today`, `find_people`, `get_person`, `list_mixes`, `get_calendar`.
3. **Changing:** the change tools with Undo and history labels; confirm-first for complete and skip.
4. **Sending after a yes:** `prepare_message`, the "sent by the assistant" outcome and the handoff fallback.
5. **Siri Shortcut:** Today read aloud, outcomes logged by voice, and a prepared text sent from the compose sheet. Checked on a physical iPhone.
6. **Testers, then words:** the first tester wave uses it. Then the copy, privacy wording and claims ledger go through WF-03, and Kevin decides on directory listings.

**Verification for each slice:**
- unit tests for workspace scoping, grant checks and idempotency;
- browser or API tests for sign-in and each tool;
- manual sessions with ChatGPT and Claude, Gemini if it accepts connectors by then, and the iPhone Shortcut.

## Open questions for Kevin

These do not block the design. They are listed in JITM-01 §6.

- Whether an assistant may place calls at all, and whether to confirm JITM-01 §2.26's line on AI-generated voices.
- Paid items at launch: a paid Claude plan to list the connector, and a paid Render instance if idle wake-ups break assistant requests.
- Whether outcomes an assistant logs count toward activation and retention (JITM-01 §2.14–§2.15).

## Sources

**Strategy and research**
- The AI-era strategy proposal, `docs/AI_ERA_STRATEGY_PROPOSAL_2026-10-06.md` in PR #126. It is not on this branch, so it is named rather than linked.
- Its private research notes in the owner's checkout, under `.artifacts/ai-strategy-20261005/research_notes/Jump in the Mix AI strategy/`:
  - note 03 is `03_on_device_phone_ai.md`;
  - note 04 is `04_assistants_and_agent_channels.md`.

**Design**
- The server-authorized action design in `docs/VOICE_PRD_REVIEW.md:19,40`.

## NOT RUN

- No code, endpoint or Shortcut exists. Nothing in this document was run against an assistant.
- Not verified:
  - Gemini's support for outside MCP connectors;
  - each assistant's plan requirements for custom connectors;
  - Claude's Gmail send-with-approval, which rests on one unofficial source (note 04);
  - the Shortcuts compose-sheet behavior on an iPhone running iOS 27;
  - the production web service's idle behavior.
- The MCP authorization specification was not re-read for this document; the build plan must follow the version current at build time.
