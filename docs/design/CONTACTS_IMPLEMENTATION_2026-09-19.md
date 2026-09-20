# Contacts design correction

The correction implements the [Contacts forensic findings](CONTACTS_FORENSIC_AUDIT_2026-09-19.md) against the supplied desktop and phone screens in both themes. The original export remains unchanged.

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
- Evidence is retained in [.artifacts/contacts-implementation-20260919](../../.artifacts/contacts-implementation-20260919/). Build, staging, production and optimized-build regression results are recorded there as each gate completes.

## Behavior boundaries

Possible future Journey stages have no invented transition dates. Sequence matching uses appointment bindings or saved occurrence dates; legacy records without enough information are not connected speculatively. The profile limits its recent stage/touchpoint and next-date preview; full activity history remains paginated. Persistent notes have no fabricated creation date. No new quiet-days automation or message delivery behavior is introduced.

The mandated Netlify test site already returned 503 for database readiness, worker readiness and login before this release. Publishing and asset verification are separate from authenticated staging acceptance. Local isolated workflow verification and customer-site synthetic smoke checks cover the application behavior; the test site's existing backend outage must remain visible in the release record.
