# Sending settings — October 28, 2026

Historical candidate record: the evidence below describes the October 28 attempt. The November 7 transplant and F1/F3 repair are recorded at the end; earlier checks are not claimed as current validation.

Local candidate for JITM-UX-13-EXEC. Sending now explains review, open and record, separates saved automatic-sending preferences from actual channel availability, and reveals setup only through an explicit disclosure when a channel is available. Production sending capability is unchanged.

## Scope and authority

- Kevin authorized phase 1 execution on October 27, 2026; Hub task `job_138686368710` retains the source and owner inputs.
- Base: `5f85ee71f405244de97110417cf3b33506e9315f`. VERIFIED-CODE/DOC: GitHub PRs #163 (Today race), #160 and #161 (including No Mix repairs) are merged and contained in this base; GitHub's comparison with current main was identical. Prerequisite `18696085b9f5812974a66d7dcbdf87b176cf8257` has the same tree.
- The assigned isolated worktree was resumed without checkout/reset/stash. Its pre-edit fingerprint matched the coordinator's preserved candidate exactly.
- WF-01/02/03/04; `orca-tokenpak`, `orca-fleet`, `jitm-ui-change`, `jitm-copy`, `jitm-feature`. Interface register, existing focused-form archetype (JITM-07 §2.10/§2.23), shared boxed disclosure (JITM-08 §2.19–§2.22), semantic tokens and local fonts (JITM-06 §2.7/§2.13), accessibility (JITM-10 §2.1–§2.12), verification (JITM-12 §2.1–§2.10/§2.13–§2.14/§2.18–§2.22), records (JITM-15 §2.5), and local-only scope (JITM-16 §2.5–§2.10).

## What changed

The current-method summary replaces the unconditional “Your Mixes can send for you” claim. With automatic sending off it explains: “Review a follow-up in Today, open your text, email or call app, then return to record what happened. Opening an app does not mark a message sent.” With the saved preference on, it explicitly calls that a saved choice and directs the owner to channel status and Today.

| Saved choice and capability | Presentation |
| --- | --- |
| Off, neither channel available | Off; concise unavailable status; optional details and usable preview; no activation fields |
| Off, either channel available | Off; optional configuration disclosure; only available channels selectable |
| On, every selected channel available | On; review-window explanation; separate turn-off control |
| On, some selected channels unavailable | On · Some channels unavailable; saved choice and possible resumption explained |
| On, all selected channels unavailable | On · Unavailable; saved choice preserved; turn-off and preview remain usable |
| On, no channel selected | On · No channels selected |
| View-only session | Same status/preview visibility; both save and turn-off disabled with a visible reason |

VERIFIED-CODE: the page still obtains capability from `automaticEmailConfigured()` and `automaticSmsConfigured()` and preferences from the session workspace. Email requires the existing deployment switch and provider; SMS uses its distinct existing capability. The server action, preview API/component, consent, review window, queue rules, tenancy, permissions, scheduling, idempotency and Undo behavior are unchanged.

VERIFIED-CODE: the compact turn-off form submits the saved review window and no enable/channel flags to the existing server action. It can disable saved automation without validating unrelated collapsed activation fields. Available setup retains its fields while collapsed and opens on invalid input before browser focus. Calls and voicemail stay manual. No worker, provider, deployment flag, secret, dependency, account or service configuration changed; no actual message was sent.

The Sending-only CSS lets the save control shrink/wrap and separates checkbox titles from help with a four-pixel gap. It does not alter shared controls on other pages.

## Changed-file manifest

- `src/app/(app)/settings/sending/page.tsx`: session/capability wiring and existing consent content.
- `src/components/SendingSettingsContent.tsx`: saved-state summary, conditional setup, preview and turn-off presentation.
- `src/styles/product.css`: Sending-only narrow-layout correction.
- `tests/view-only-settings.test.ts`: only the explicitly authorized Sending test gains disclosure assertions; every prior assertion remains.
- `tests/sending-settings.test.ts`: 65 provider-free rendering cases covering every capability/saved/view-only combination and unset preferences.
- `tests/sending-settings-actions.test.ts`: six existing-action contract cases, including forged view-only submission, consent, unavailable channels and workspace binding.
- `e2e/fixtures/sending-settings.tsx`: real presentation and preview components with synthetic capability/save inputs.
- `e2e/sending-settings.spec.ts`: desktop/mobile interactions, both themes, invalid-field recovery, preview, consent, disable, font loading and narrow reflow.
- `docs/SENDING_SETTINGS_IMPLEMENTATION_2026-10-28.md`: this implementation record.

## Evidence

Private evidence is under `.artifacts/sending-settings-20261028/`; raw images and traces are not committed. Browser URL: `http://127.0.0.1:3183/settings/sending`; provider-free fixture URL: `http://127.0.0.1:3183/__sending-settings?...`. The sole test database is loopback `jitm_design_ux13_20261028`, with synthetic data. Heavy commands ran serially with a 2560 MiB Node heap limit.

- VERIFIED-RUNTIME: `npm run validate:static` and `npm run typecheck` pass on the final source.
- VERIFIED-RUNTIME: affected regression batch passes 122 tests across nine files, including the render matrix, action contracts, view-only, delivery, recipient, review-window, preview and both earlier environment-failure suites.
- VERIFIED-RUNTIME: `tests/viewer-error-pages.test.ts` passes six additional cases; the unchanged `tests/sends-by-itself.test.ts` passes two, preserving the platform automatic-email guard and manual-review classification (130 affected tests total). `npm run build` passes and generates 117 pages.
- VERIFIED-RUNTIME: all 32 cases in `e2e/sending-settings.spec.ts` pass on `desktop-chromium` and `mobile-chromium`, workers 1 and retries 0. Every UI font weight (400/500/600/700) is explicitly loaded and asserted. Four reflow cases cover both themes/projects at 320, 390, 834, 900, 901 and 1440 CSS pixels with 200% text. Save bounds/height, page overflow, checkbox title/help separation, card overflow and keyboard focus are asserted; 24 screenshots and geometry records retained.
- VERIFIED-RUNTIME: final production-page matrix passes 96 layouts (saved off/on × two themes × normal/200% text × 320, 390, 767, 768, 834, 900, 901, 1194, 1279, 1280, 1440 and 1920 CSS pixels). All four fonts load; page overflow and 44px summary targets pass. Sixteen axe scans return no violations. Keyboard disclosure/preview and a real saved-on turn-off through the unchanged server action pass; zero page errors. Retained 112 captures in `retry-visual/`.
- VERIFIED-RUNTIME: unchanged `npm run test:a11y` passes three cases across desktop/mobile, with one existing intentional mobile skip for the explicitly desktop tablet test. Skips are not passes.
- VERIFIED-RUNTIME: file/pixel validation passes all 136 final PNGs (112 real page, 24 available fixture): dimensions, nonblank RGB variation and distinct light/dark pixels checked; minimum RGB standard deviation 15.479. At 320px/200% text, all four theme/project cases place the save button's right edge at 291px (previously 330px), height 140px, and minimum title/help gap 4px. Numeric details and SHA-256 values are in `retry-pixel-geometry.json`.

### Earlier failures retained

VERIFIED-DOC: the initial full `npm run check` passed generation/static/type and reached 2552 passing tests, two failures and 75 skips. Its process mistakenly used `PILOT_MODE=true`, conflicting with the unchanged recovery-boundary and social-auth hosted-mode tests. Both files and their source were byte-identical to the base; both pass with the corrected test-process setting. No assertion was removed, skipped or weakened. The full suite is not claimed all-green and was not repeated on this resumed attempt; the coordinator requested affected checks only (JITM-12 §2.13).

VERIFIED-DOC: initial browser attempts exposed fixture environment/hidden-locator issues; these were corrected before 32 passing interactions. Missing fixture fonts then invalidated that initial visual evidence. With fonts restored, the unchanged reflow assertions caught the genuine 320px/200% save overflow (right edge 330px, limit 321px) and checkbox text collision: 28 passed, four failed. The preserved Sending-only CSS repair now passes those four cases and the complete matrix with stronger font/geometry checks. Original logs and screenshots remain alongside the new evidence.

VERIFIED-DOC: native Orca browser returned `browser_unavailable: Browser automation is unavailable on this host`; local browser automation is the justified fallback. Earlier database/install/socket and private harness errors remain in Hub ERRLOG notes. This retry also recorded harmless read-only discovery/early-log-read errors and an actual-page sign-in timeout: the local server invocation omitted its explicit loopback `APP_URL`. The same build was restarted with the correct local origin, preserving the existing origin/cookie checks and all test timeouts. No policy boundary was bypassed.

## Standards alignment handoff

JITM-09 §2.14 still describes the beta Sending page as showing email “not available yet.” The authorized capability-dependent presentation refines that wording without activating anything. Proposed replacement text, for the separately governed standards update:

> Every workflow MUST work with manual review and handoff alone. Automatic customer email is off in production during the beta (JITM-00 §2). Sending to customers MUST show the saved automatic-sending preference separately from each channel's actual capability. When no channel is available, show concise status and optional details with a usable preview. Reveal setup only when a channel is available and the owner chooses Configure; preserve consent, review-window and affected-message review requirements. A saved enabled preference MUST remain identified as enabled while unavailable, with an explanation that it can apply again when the channel returns and a usable turn-off action. View-only sessions can preview but cannot save.

JITM-04 §6's historical sending-card deviation is addressed by this candidate; retain its dated history and link this record when the candidate lands. Standards, skills, hooks, router and original design export were not edited.

## Rollout and NOT RUN

Local candidate only; independent QA and owner-authorized landing/release remain separate. No migration or dependency change. Reverting the UI commit restores the previous presentation without changing saved data.

NOT RUN: fresh full-suite repeat (affected reruns requested; initial result retained above); hosted CI, all-browser/all-route regression, migration/restore/load/worker qualification, image builds, dependency audit and public-page performance (outside this presentation-only change); production smoke/deploy, actual sends and provider activation (not authorized); physical devices and screen readers (unavailable). Final screenshot viewing was explicitly prohibited by the coordinator's retry handoff after the prior attempt's image-expanded context hit its spend guard; numeric pixel/geometry/font/accessibility checks and capture files substitute here, and final human visual review remains a limitation. No screenshot was viewed or printed inline in this retry.


## November 7, 2026 — M5 S2 repair

Branch `m5-s2-ux13-sending-20261107` starts at fetched main
`8fa2f3404e1ea3ce429b6c199e06315b47cc342a`. Only the nine-file diff of
`3b1977a0422ae0818f2824b2f9c130f73727ecd2` against `5f85ee71` was applied;
none of that candidate's old ancestry was imported. Authority and current
validation evidence: Hub task `job_7fbb7c941b3b`. No pull request is opened
by this task; the coordinator arranges independent QA before landing.

- F1: a saved On setting without a selected available channel now says
  “Nothing can send automatically (saved setting: On)” in the leading heading.
  The channel-status pill and saved choice remain visible.
- F3: the pure `automatic-delivery-window-options.ts` module owns review-window
  choices and the default. The settings content, preview component and preview
  API share it without importing server dependencies into the browser.
- An unlisted saved window uses the default for preview and configuration.
  The separate turn-off form keeps the saved value, including a valid 45-minute
  window, so disabling does not silently change it.
- The save action, consent, feature flags and `automatic-delivery.ts` are
  unchanged. F2's pre-existing SMS worker behavior remains out of scope.
- Tests cover capability/saved-state combinations, fallback preview requests,
  the real preview API and turn-off action, both themes, keyboard focus and
  normal/200% text. Existing unrelated assertions are retained.

The focused-form archetype and shared boxed disclosure remain the reference
(JITM-07 §2.10; JITM-08 §2.19). Current local commands, exit codes, candidate
SHA, screenshots and NOT RUN items are delivered in the task's final evidence
note; the October 28 results above are historical only.
