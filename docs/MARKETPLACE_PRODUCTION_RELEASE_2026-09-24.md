# Production release: Beat numbering, named Mega-Mixes and the Marketplace

Released to https://jumpinthemix.com on 2026-09-24. The agent ran the release under the owner's standing authority, using `.artifacts/market-live-20260924/release.mjs`.

| Item | Value |
| --- | --- |
| Released commit | `3d06312a7068cffdddd4fd87fc85da2991fa59c2` (branch `feat/marketplace-numbering-20260924`) |
| Previous production | `fad339dc566ec3b0e75b85e181a62486ba797c30` |
| Migrations | `20260924120000_mega_mix_pipelines`, `20260924180000_marketplace` (additive); 70 applied in total |
| Migration job | `job-daqn46flot8c73f9hdo0`: succeeded and qualified |
| Worker deploy | `dep-daqn4v0u01pc73fabc30` |
| Web deploy | `dep-daqn5nnlk1mc73ecvpk0` (build `yeW84TtxdjC_H1bQDGT7R`) |

## Steps and evidence

1. **Read-only preflight.** Both services were live on `fad339d` with auto-deploy off, health returned 200 three times, and the database was ready behind its runtime-role boundary. Production's migration history matched the release tree except for the two new, reviewed additive migrations.
2. **Fresh encrypted backup.** It was stored at 2026-09-24T18:54:40Z (3 objects) before any change.
3. **Migration, run inside Render's network by the owner.** The reviewed source archive's checksum was verified, the migration applied, and the runtime role was re-verified.
   - All 7 new tables were verified.
   - The backfill was verified: 1 existing ready-made install became 1 named Mega-Mix holding 13 Mixes, and no Marketplace listings existed.
   - The backup role got read-only access on each new table.
   - The old code kept serving throughout.
4. **Worker deploy** at the release commit. A scoped queue probe passed, and its synthetic job was removed.
5. **Web deploy** at the release commit.
6. **Postflight.** 18 public and redirect checks passed, including `/mixes/mega` and `/marketplace`. The 49 release files and 20 served assets hashed identically on the live instance. The database was ready.
7. **Live smoke** with one synthetic owner (7 checks):
   - the numbered Mega-Mix outline;
   - the Journey Mega-Mix switcher and numbered list;
   - a 13-Mix export with no account ids;
   - the Marketplace sections;
   - the privacy check, sharing, then stopping sharing;
   - phone reflow and WCAG axe in light and dark.

   Every synthetic row was removed.
8. **Final check.** Record counts were unchanged from the preflight, there were no synthetic rows, probe jobs or failed jobs, health returned 200 three times, and both services were at the release commit with auto-deploy off.

## Rollback

Deploy `fad339dc566ec3b0e75b85e181a62486ba797c30` to the worker, then the web service. The migrations only add tables, so the previous code runs unchanged against the migrated database. No data rollback is needed.
