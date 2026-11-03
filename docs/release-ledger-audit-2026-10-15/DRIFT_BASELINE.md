# Drift refresh at the October 14 release

VERIFIED-RUNTIME: reran the documented command groups from [the September 28 baseline](../standards-audit-2026-09-28/DRIFT_BASELINE.md) on `0a50aedcb752c61242c784696f5570d8083155ce` during this audit on 2026-10-15 UTC. These are heuristic trends, not a new implementation queue or a conformance pass. The source tree was unchanged.

The original GNU grep/awk/sed patterns, comment stripping, scopes and `LC_ALL=C` were retained. Temporary files were retained privately instead of deleted. Counts for the older commit below come from the original baseline; no historical build or browser run was repeated.

| Metric | September 28 `9439fd6` | October 14 `0a50aed` | Interpretation |
|---|---|---|---|
| 1. Non-token colors, global CSS / modules | 53 / 2 | 53 / 11 | Global unchanged; module matches +9. Inspect context before deciding fixes. |
| 2. TS/TSX color matches | 42 in 9 files | 46 in 12 files | +4; email HTML still contributes 31 and is exempt from CSS-token requirements. |
| 3. Native / bare confirm calls | 2 / 10; 0 unmatched hooks | 2 / 12; 0 unmatched hooks | Two FormGuard native calls remain. Added bare calls still resolve to the shared dialog hook. |
| 4. Copy segments | 21,306 | 22,955 | Scope grew; counts cannot be compared as a rate without a denominator. |
| 4. Plan(s), any case | 49 | 65 | Includes current billing uses; not all are retired Mix terminology. |
| 4. Follow-up(s), exact upper/lower forms combined | 296 | 326 | Today term usage is not itself a defect; JITM-05 §2.4 requires follow-ups there. |
| 4. Mega-Mix(es), canonical / variants | 67 / 31 | 100 / 2 | Variant spellings fell by 29. |
| 4. Campaign / Important Date | 0 / 0 | 0 / 0 | No matches in the baseline's copy scope. |
| 4. Listed Today surfaces: follow-ups / Beats, any case | 64 / 6 | 66 / 6 | Original component list retained; newer components are not automatically added to this metric. |
| 5. Raw SVG outside AppIcon | 4 in 3 files | 5 in 4 files | Added QR drawing; raw SVG count is not proof of an icon violation. |
| 6. CSS font-family declarations | 27 | 27 | 22 token-based, 2 inherit, 3 other; three email declarations remain outside CSS. |
| 7. Global CSS files / partial imports / modules / orphans | 37 / 36 / 9 / 0 | 37 / 36 / 9 / 0 | Unchanged import coverage. |
| 8. Important declarations, global / modules | 38 / 2 | 38 / 2 | Unchanged; includes legitimate accessibility overrides. |
| 9. Inline style literals / files | 30 / 20 | 30 / 20 | Unchanged; geometry/data-driven styles remain included. |
| 10. Page routes / API handlers | 90 / 50 | 94 / 52 | Current pages: 36 app, 30 staff group, 1 staff acceptance, 27 other. |
| 10. App routes without an export mockup | 25; 11 archetypes, 14 others | 28; 14 archetypes, 14 others | Same eight mapped app route families; three added form routes are billing, phone intake and new-contact settings. No visual fidelity inferred. |
| 11. AppIcon usages without explicit dimensions / CSS sizing rules | 290 / 108 | 317 / 114 | Zero JSX size props in either run. CSS sizing is intentional; rendered coverage is unverified. |
| 12. Width features / distinct px values | 195 / 40 | 206 / 40 | More rules, same number of distinct widths. |
| 12. Historical breakpoint set / outside that set | 69 / 126 | 77 / 129 | Off-set count +3; retained the original metric's set for comparability. Current-rule compliance needs context. |

The growth in literal colors and off-set breakpoints is a drift signal for a future scoped review (JITM-06 §2.7 and JITM-07). It does not prove that the October 14 change introduced every difference since September 28. No source was changed to lower these counts.

Private evidence: `.artifacts/release-ledger-20261015/run-drift.sh` and `drift-output.txt`. All twelve groups ran; the raw copy table and breakpoint histogram are retained there. The manual mockup-family interpretation uses the original eight-family mapping, not a fresh export inspection.

## NOT RUN

Rendered computed styles, new screenshots, automated accessibility/browser checks, physical devices, a full comparison of every new match, and a repeat run of the September 28 source. This refresh is static trend evidence only.
