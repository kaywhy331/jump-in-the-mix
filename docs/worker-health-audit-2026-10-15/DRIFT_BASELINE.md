# Drift refresh for worker-health qualification

**VERIFIED-RUNTIME:** all twelve groups from [the original baseline](../standards-audit-2026-09-28/DRIFT_BASELINE.md) ran on the unchanged application tree at `0a50aed` during this audit. The prerequisite's reviewed command extraction was reused with temporary output redirected into this task's private artifact directory. Original patterns, scopes, comment stripping and locale were retained.

`diff -u` between the new output and the prerequisite output returned 0 with no differences. Both have SHA-256 `e1f680431cb9b3701d6a927345a4d78176876ddf66dfdd87b97fb90b5dd56d3e`. The [prerequisite comparison](../release-ledger-audit-2026-10-15/DRIFT_BASELINE.md) retains the September historical baseline and interpretation. This refresh introduces no new drift.

| Group | October 15 result, unchanged from prerequisite |
|---|---|
| 1. Literal colors, global CSS / modules | 53 / 11 |
| 2. TS/TSX color matches | 46 in 12 files |
| 3. Native / bare confirmations | 2 / 12; zero unmatched dialog hooks |
| 4. Copy segments / Plans / follow-ups / Mega-Mix variants | 22,955 / 65 / 326 exact-case forms combined / 100 canonical and 2 variants; Campaign and Important Date zero; original Today list 66 follow-ups / 6 Beats |
| 5. Raw SVG outside AppIcon | 5 in 4 files |
| 6. CSS font-family declarations | 27; 23 declarations containing a token (including one fallback), 2 inherit, 2 other |
| 7. Global CSS / imports / modules / orphans | 37 / 36 / 9 / 0 |
| 8. Important declarations, global / modules | 38 / 2 |
| 9. Inline style literals / files | 30 / 20 |
| 10. Pages / API handlers | 94 / 52; app/staff/other/staff-acceptance groups 36 / 30 / 27 / 1 |
| 11. AppIcon uses without explicit size / CSS rules | 317 / 114; zero size props |
| 12. Width features / distinct values / historical in-set / outside | 206 / 40 / 77 / 129 |

The font-family grouping above follows the raw output: the prerequisite prose grouped the fallback token differently (22 token-based and 3 other); the 27 declarations and raw results are identical. This is a classification clarification, not a code change. Route-to-export mapping remains the prerequisite's manual interpretation; it was not re-rendered or newly qualified.

Private source: prerequisite `.artifacts/release-ledger-20261015/run-drift.sh`, SHA-256 prefix `693a65ebd0cbd2eb`. New command/output files are `.artifacts/worker-health-20261015/run-drift.sh` and `drift-output.txt`. No source was changed to lower a count.

## NOT RUN

Rendered style/accessibility inspection, new screenshots, physical devices, reclassification of every historical match and a rerun of the September source. These static heuristics are trend evidence, not a fresh product-wide conformance score.
