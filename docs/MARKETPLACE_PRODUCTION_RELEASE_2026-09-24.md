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

## Follow-up release: test alignment and phone text sizes

Released later on 2026-09-24 as `e26fdd42a05ac9c7094f697afb2b0f53b9b7f35f` (branch `fix/test-failures-20260924`), replacing `3d06312`. Web deploy `dep-daqoneou01pc73ffj1gg`, worker deploy `dep-daqom4bktnus73bl288g`. Code only, with no schema change. The scripts are `.artifacts/market-live-20260924/fixes-*.mjs`.

**Product changes.** Phone text sizes now follow the supplied design export:
- Today time pills and card meta are 13px, and the Review label is 12px.
- Contact avatar initials are 14px.
- The Contacts and Mix library pagers are 13px.

**Test changes.** The failing browser and unit tests were stale expectations left behind by earlier redesigns: the workflow Journey map, the flat Settings rows, the Contacts sheets, the channel versions and the phone icons. None was a product defect. Four tests that covered the retired stage-column Journey were removed.
- On a production build, these all pass on desktop and phone: visual-fitment, design-correction, journey-analytics, journey-rule-editing, journey-connections, mega-mixes, mega-mix-pipelines, marketplace and accessibility.
- Direct API posts in tests now send the same-origin header that production requires.

**Evidence.**
- The preflight showed production's migration history identical to the release tree.
- The worker queue probe passed.
- The postflight matched all 12 changed files and 20 served assets.
- The live phone check confirmed the new sizes, plus reflow and axe on Today, Contacts, Mixes and the Marketplace in both themes. Every synthetic row was removed.
- The final check found no synthetic rows and no failed jobs, and health returned 200 three times.

**Rollback:** deploy `3d06312` to the worker, then the web service.
