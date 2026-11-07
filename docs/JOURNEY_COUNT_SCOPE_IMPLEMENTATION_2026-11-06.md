# Journey count scope — 2026-11-06

Journey shows work items beside its unique People total. A piece of Journey work
counts once across handoffs, parallel positions and repeat visits; a follow-up
outside Journey work counts once by its own identity. Both totals include past
work and exclude archived contacts. Existing status counts and controls retain
their meanings and names (JITM-09 §2.55, §2.58).

The count explanation separates three scopes: account-wide totals, People
filtered by Mix or Beat, status, stage and name, and the map's Mega-Mix/archive
view. Map options do not filter the roster or totals. About these counts also
explains that My Mixes excludes archived Mixes and one-time follow-ups, and that
Results uses work started in the selected period with the displayed setup
version and selected person, when present. Results counts repeated connection
visits separately.

The implementation uses existing read results and shared status labels. It adds
no database query or status, and preserves the graph, responsive panes and D75
opening behavior (JITM-06 §2.2; JITM-07 §2.19–2.20). New scope and explanation
text uses semantic color tokens and scales with text size (JITM-10 §2.1–2.5).

Verification lives in `tests/workflow-count-scope.test.ts` and
`e2e/journey-count-scope.spec.ts`, alongside unchanged analytics, readable-Journey
and M4-S1 tests. The browser spec covers the real scope controls and both themes
at 320, 390, 768, 1200 and 1440px with 100%/200% text, keyboard interaction,
contrast and target measurements. Task-specific commands, commit IDs, local
results and main CI conclusions are recorded in Orca task `job_327f83ac3d5c`.

NOT RUN: production deployment and physical-device qualification; neither is
part of this slice. Native Orca browser automation is unavailable on Calibot;
the isolated Playwright browser supplies local evidence.
