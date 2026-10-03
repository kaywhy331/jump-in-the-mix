# Next approval bundle — Jump in the Mix — 2026-10-01

Prepared for Root/Kevin. No operation below has been performed. Approvals are separate; approving publication does not approve merging, sending mail, enrollment or deploying.

## 1. Publish the review branch and open a draft PR

Destination: the verified private GitHub repository `kaywhy331/jump-in-the-mix`, default/base branch `main`. Head branch: `feat/tester-readiness-20261001`. Application changes are exactly candidate `6f23e4359355c4a54c633b1aff5c7e1c2e2999bf`; the local follow-up adds only mail-capture testing and readiness/approval records. Root must pin the final full head SHA from the handoff before presenting the approval.

Proposed approval: “Publish the named local head to `kaywhy331/jump-in-the-mix:feat/tester-readiness-20261001` and open one draft PR into `main`, using the prepared PR copy. Do not merge or deploy.”

Impact: uploads reviewed code, synthetic screenshots and records to that private repository; may trigger repository CI and normal GitHub notifications. No new reviewers are assigned and no direct messages are sent. The connected repository metadata permits push and reports auto-merge disabled. Current Render auto-deploy settings still need read-only verification; repository policy requires them off. Publish only after confirming this cannot trigger an unintended production deploy.

Reviewable payload: the current branch diff against `6cf9ad635622`; implementation and audit records; `tester-readiness-audit-2026-10-01/PR_DRAFT.md`. No migrations, dependencies, production configuration, billing code, contact token storage or access policy are changed. Credentials, raw logs and test environment files are excluded.

## 2. One real controlled-inbox verification

Target system: production `https://jumpinthemix.com`, existing transactional sender/provider and **one existing inbox explicitly named and owned/controlled by Kevin**. The exact recipient is not yet supplied, so this bundle is not ready for a send approval. Do not infer it from a login, contact, support address or email found elsewhere.

Proposed bounded operation after the recipient and operator are named: use the existing authorized staff admission workflow to issue one single-use invitation for that inbox, then manually verify signup → verification → sign-in → sign-out → password reset → new-password sign-in, plus one verification resend/reused-link check. Capture only redacted status/timestamp evidence. Stop after one attempt per step if delivery fails; inspect before retrying.

Impact: creates one synthetic production account/workspace and related invitation, auth, session, rate-limit and email-ledger records; consumes an admission reservation/account seat and real provider email allowance. Permit at most five planned messages: invitation, initial verification, replacement verification, reset and password-change notice. No real tester is enrolled, no customer recipient is contacted, and no card or charge is involved. No staff membership or permission is added; any password reset is only for this newly authorized synthetic account. Existing account credentials remain untouched.

Before asking: record current admission capacity/pause state, current deployed SHA, mail sender availability and support owner through an existing authorized read-only session. Confirm that the real mailbox is accessible for review. Define the account's retention/cleanup through existing audited controls; no direct production SQL cleanup, ledger deletion, quota override or invented permission. Name the exact existing operator. If the recipient, operator or these controls remain unresolved, ask for the missing information rather than submitting a vague send approval.

## 3. Candidate production release — later and separately

Destination: Render production web `jump-in-the-mix-web` (`srv-dagt93lbedkc738552o0`) and worker `jump-in-the-mix-worker` (`srv-dagta4uq1p3s738rnlr0`), serving `https://jumpinthemix.com`. These names/IDs are recorded in JITM-14; this task has not verified them through the current Render API. There is no staging environment; do not use the retired Netlify site.

Not ready to request a deploy approval yet. JITM-14 §2.8 permits only the exact merge commit on `main` that Kevin has approved/merged. The candidate is still local and has no PR or merge SHA. Before asking, supply: final PR and approved merge SHA, freshly verified live service IDs/revisions and auto-deploy-off state, rollback SHA/tag, relevant baseline/candidate test receipts, physical-device and mail gates, current admission/triage owner, and the concrete WF-06 release script/checklist.

Impact of the future approved release: fresh encrypted backup; worker then web rolling deploy of that named merge commit; new Help feedback/redaction/context UI and corrected navigation; signed-in checks with any separately approved synthetic smoke data; read-only health/asset postflight; production release tag and record. No schema migration is introduced by this candidate. If a live smoke creates synthetic records, disclose its exact scope and audited cleanup in that approval, because this task forbids starting mutating production tests.

The release must preserve billing/automatic customer mail OFF, current permissions, credentials and resource plans. Do not enable billing to test L4/L5. If the release fails, the reviewed code-only rollback targets the verified previous commit (web then worker) with postflight; do not improvise database rollback.

## Remaining blockers and proposed dates

The local candidate has passed bounded checks, and the new in-memory mail test closes the server-side account sequence gap. Real inbox delivery, physical-device behavior, current private operational/admission settings, named support coverage and release authorization remain open. No service performance or 10–20-user concurrency qualification is claimed.

Conditional finish lines: October 2 — qualification and first-batch decision; October 3 — up to five testers; October 5 — up to ten after at least 24 healthy hours; October 7 — toward twenty after at least 48 healthy hours at ten. Shift dates when gates are unmet. Admission dates authorize no action by themselves.
