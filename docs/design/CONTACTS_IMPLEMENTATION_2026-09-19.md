# Contacts design correction

The correction implements the [Contacts forensic findings](CONTACTS_FORENSIC_AUDIT_2026-09-19.md) against the supplied desktop and phone screens in both themes. The original export remains unchanged.

**Deployed and verified on [jumpinthemix.com](https://jumpinthemix.com/contacts).** Both production services run `72c2be51b5991f3cba7f3a8c0b28c58471f917d5`; verification completed at 2026-09-20 00:55 UTC. All 663 runtime source files and 19 served assets matched the release. Database, worker, liveness and recovery checks returned 200. The build ID is `vPTJwH-rnEoBkFNP5I28R`.

| Findings | Implemented behavior |
| --- | --- |
| C01–C02 | Selected-person workspace beside the directory from 1200px; at 1920px the navigation, directory, profile and details panes measure 248/440/892/340px. Wider screens retain readable content widths. |
| C03–C05 | Compact directory header, integrated search/filter, visible count, default last-name sort, circular avatars, stage and relative due state. Import, add, bulk selection and management tools remain available. Sorting and filtering retain the person while they match the filters; the current desktop link exposes its selected state. |
| C06 | Avatar/name/stage header with direct keyboard-accessible stage picker; Text, Email, Call and Note actions; phone Back and Edit alignment. Disabled contact methods respect missing data and Do not contact. |
| C07 | The earliest pending follow-up links to its specific Review. Beat position, completed/current/future states and dates belong to that Mix occurrence. Missing legacy occurrence dates remain unavailable instead of joining unrelated runs. |
| C08 | Personal Journey displays recorded dated stage moves, including returns, a Today marker, undated possible next stages and actual touchpoints. Start a touchpoint offers the existing Mix assignment or one-time workflow; client navigation now retains the selected person. |
| C09 | Compact linked contact methods precede History on phones. Desktop details adds birthday and Coming up. Journey and management controls remain available in More on phone. |
| C10–C11 | Compact chronological History with a date column and Newsreader for personal updates; persistent notes remain separate. Neutral Next surface, smaller section labels and component-owned styles replace conflicting layout rules. |

The release also contains the pending corrections described in [the broader design correction](DESIGN_CORRECTION_2026-09-19.md): Today review layout, Mix workspace, Journey roster/timing buckets, Calendar composition and Quick Add review. Database schema and dependency versions are unchanged from customer release `6482a700c42ac0bb2c4d163088580a90aecf2779`.

## Verification

- TypeScript, schema/syntax/import validation passed.
- 23 focused unit/integration tests passed, covering occurrence isolation, timezone/daylight-saving boundaries, stage history, Journey roster ordering and Today behavior.
- Nine Contacts workflow checks passed: same-occurrence Beats, pane measurements, retained sorting/filtering selection, keyboard stage access and focus restoration, stage persistence, saved note, one-time follow-up selection and secondary tools.
- 18 Contacts states passed at 320, 390, 834, 1194, 1440, 1920 and 3440px in both themes, with no page errors, document overflow or axe WCAG A/AA violations. Screenshots were inspected. History begins around 609px in the compact 390px fixture; this is a fixture measurement, not a fixed production height.
- The optimized build passed another 24 route/viewport checks across Contacts, Today, Journey, Mixes, Calendar and More. The one-time follow-up retained its selected contact in that build.
- A final navigation check found that Journey's Touchpoint link targeted a folded Mix section. The follow-up adds that anchor to the reveal handler. Desktop client navigation, direct phone navigation and reload checks passed.
- On the customer domain, 26 authenticated layout checks passed with no document overflow, axe WCAG A/AA violations or page errors. Contacts verification covered pane dimensions, retained sorting selection, keyboard stage access/focus restoration, saved notes, the selected-person one-time follow-up, Journey's Touchpoint link and phone History in both themes. Temporary accounts and their workspaces, contacts and follow-ups were removed. Earlier harness failures and the successful reruns are retained in the evidence; the final report identifies the 24 layout checks carried forward from the same revision's earlier run.
- [Compare the supplied design and implemented screens](../../.artifacts/contacts-implementation-20260919/index.html). Initial evidence is retained in [.artifacts/contacts-implementation-20260919](../../.artifacts/contacts-implementation-20260919/); the final anchor correction and release evidence are in [.artifacts/contacts-anchor-release-20260919](../../.artifacts/contacts-anchor-release-20260919/).

## Behavior boundaries

Possible future Journey stages have no invented transition dates. Sequence matching uses appointment bindings or saved occurrence dates; legacy records without enough information are not connected speculatively. The profile limits its recent stage/touchpoint and next-date preview; full activity history remains paginated. Persistent notes have no fabricated creation date. No new quiet-days automation or message delivery behavior is introduced.

The mandated Netlify test site already returned 503 for database readiness, worker readiness and login before this release. Publishing and asset verification are separate from authenticated staging acceptance. Local isolated workflow verification and customer-site synthetic smoke checks cover the application behavior; the test site's existing backend outage must remain visible in the release record.

The test-site packaging failure on the first attempt was rolled back. Rebuilding the same source in an independent repository outside the parent checkout fixed the `/run-config.json` handler error. The final test artifact is published at the stable URL, with 16 served assets verified against its build. The stable Netlify domain also produces React hydration warnings that do not reproduce on its clean deploy permalink or the customer domain. Disabling the provider badge removed its toolbar but did not eliminate the warning; the exact remaining cause is unresolved. This is recorded as incomplete staging browser acceptance, not a passing end-to-end staging test.

Final test deployment: `6aaf2be745a27fd1d703df40`, published to [jump-in-the-mix-test.netlify.app](https://jump-in-the-mix-test.netlify.app/). Final customer web deployment: `dep-danipsqjnfac738plkeg`; worker: `dep-daniokajnfac738phi10`. The deployed revision checks rejected transient connections to the previous instance during cutover; final source and authenticated checks used the new revision.
