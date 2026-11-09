# Drift baseline — measured on origin/main 9439fd6 (2026-09-28)

These numbers are a **baseline for later enforcement, not a to-do list**. They record how far the code as shipped (`origin/main` at `9439fd6`, which is what production runs) is from the JITM design and vocabulary rules on 2026-09-28. Later checks compare against these counts. A number going up is new drift. A number going down is intended cleanup. Nothing here asks anyone to change code now.

- **Tree:** clean checkout of `9439fd6`. `git status --short -- src e2e tests prisma` was empty.
- **Tools:** bash, GNU grep 3.11 with PCRE (`-P`), awk, sed, find, sort, uniq, wc, comm.
  - Run every command from the repository root.
  - If your shell wraps `grep` (for example, an alias to ugrep), run `unset -f grep` or use `command grep`.
  - `LC_ALL=C` keeps sorting and `\w` byte-based and reproducible.
- **Counting unit:** matches (`grep -o … | wc -l`), not lines, unless a row says "segments" or "rules".

## Headline counts

| # | Metric | Baseline on 9439fd6 |
|---|---|---|
| 1 | Colour literals in `src/styles/*.css`, excluding `design-tokens.css` | **53** (30 hex + 23 `rgb()`/`rgba()`) in 11 files. `base.css` has 34. CSS modules add 2. |
| 2 | Colour literals in `src/**/*.ts(x)`, excluding `src/generated` | **42** in 9 files: 31 in email HTML (`src/lib`) and 11 in UI code |
| 3 | `window.confirm` / bare `confirm(` | **2** native calls, both in `FormGuard.tsx` (`:24` navigation guard, `:45` other-form submit guard). 10 bare `confirm(` calls, all from `useConfirmDialog`. |
| 4 | Candidate customer terms (JSX text and string literals) | See table in metric 4. `follow-up(s)` 296 exact-case; `Plan(s)` 49 any-case; `Mega-Mix(es)` 67 canonical vs 31 variant spellings; `Campaign`/`Important Date` 0 |
| 5 | Raw `<svg` in `.tsx` outside `AppIcon.tsx` | **4** in 3 files |
| 6 | `font-family` declarations outside `design-tokens.css` | **27** in CSS: 22 use tokens, 2 `inherit`, 3 non-token. 3 more are in email HTML strings. |
| 7 | Stylesheets in `src/styles` | **37** files. All **36/36** partials are imported by `index.css`. 0 orphans. 9 CSS modules. |
| 8 | `!important` | **38** in `src/styles` (9 files) and 2 in CSS modules |
| 9 | Inline `style={{` in `.tsx` | **30** in 20 files |
| 10 | Routes | 90 pages: (app) 33, (staff) 30, `staff/` 1, public+auth 26. 50 API handlers. **25 of 33** app routes have no export mockup. 11 of those use `page--content`/`page--form` and 14 use neither. |
| 11 | AppIcon usages without explicit dimensions | **290 of 290** have no `width`/`height`. Sizing comes from 108 single-line CSS `svg` rules. |
| 12 | Hard-coded px width breakpoints in `@media` | **195** width features, **40** distinct px values. **69** are in the documented set and **126** are off-set. |

## Preamble (paste once per shell)

```bash
export LC_ALL=C
# Strip /* … */ comments (also multi-line) from one CSS file, keeping line numbers.
nocomment() { awk '{ out = ""; s = $0; while (length(s) > 0) { if (c) { i = index(s, "*/"); if (i) { s = substr(s, i + 2); c = 0 } else s = "" } else { i = index(s, "/*"); if (i) { out = out substr(s, 1, i - 1); s = substr(s, i + 2); c = 1 } else { out = out s; s = "" } } } print out }' "$1"; }
# Colour literals: hex (3/4/6/8 digits; not an HTML entity like &#039; and not an ID selector like #add-connection) and colour functions.
HEX='(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])'
FN='\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\('
# Customer-copy segments: quoted strings and single-line JSX text, one per line, prefixed "file<TAB>".
copy_segments() {
  find "$@" -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.ts' ! -name '*.test.tsx' | sort | while read -r f; do
    grep -vE '^\s*(//|/?\*|import\s)' "$f" | sed -E 's/[Jj]ump [Ii]n [Tt]he [Mm]ix//g' |
      grep -oP '"[^"]*"|\x27[^\x27]*\x27|`[^`]*`|>[^<>{}]+(?=[<{])|\}[^<>{}]+(?=<)' | sed "s|^|$f\t|"
  done
}
# Word boundaries for terms: not part of an identifier, path, query, class name or property access.
PRE='(?<![\w/.#?&=@${-])'; POST='(?![\w/=(-])(?!\.\w)'
```

---

## 1. Colour literals in `src/styles/*.css` (excluding `design-tokens.css`)

```bash
for f in src/styles/*.css; do [ "$f" = src/styles/design-tokens.css ] && continue
  h=$(nocomment "$f" | grep -oP "$HEX" | wc -l); r=$(nocomment "$f" | grep -oP "$FN" | wc -l)
  [ $((h + r)) -gt 0 ] && echo "$((h + r)) $h $r $f"; done | sort -rn          # total hex fn file
for f in src/styles/*.css; do [ "$f" = src/styles/design-tokens.css ] && continue; nocomment "$f" | grep -oP "$HEX|$FN"; done | wc -l
for f in src/components/*.module.css; do nocomment "$f" | grep -oP "$HEX|$FN"; done | wc -l
```

**Result: 53.** That is 30 hex and 23 functional (21 `rgba(`, 2 `rgb(`). CSS modules add **2** (`WorkflowJourney.module.css`, `#000` in a mask gradient). For reference, `design-tokens.css` itself holds 100 literals (89 hex, 11 functional).

| Total | Hex | Fn | File |
|---|---|---|---|
| 34 | 25 | 9 | src/styles/base.css (the legacy `:root` palette, lines 2-50, plus shadows) |
| 4 | 0 | 4 | src/styles/product.css (2 dialog backdrops, shadows) |
| 4 | 0 | 4 | src/styles/components.css (2 dialog backdrops, shadows) |
| 3 | 2 | 1 | src/styles/design-system.css (`#000` mask stops, one backdrop) |
| 2 | 2 | 0 | src/styles/conversation.css (`:root` `--conversation-*`, shadowed by tokens) |
| 1 | 1 | 0 | src/styles/mobile-clarity.css (`#0005` shadow) |
| 1 each | | | when-picker.css, templates.css, design-details.css, contacts-bulk.css, admin.css (`rgba`/`rgb` shadows and tints) |

Five of these literals are dialog `::backdrop` rules (`product.css:4`, `product.css:117`, `components.css:63`, `components.css:65`, `design-system.css:69`). `popups.css:4` supersedes all five with `var(--scrim)`.

**Method limits:**
- Named colours are not counted. There are 4 `white`/`black` (2 are `stroke='black'` in a mask data URI in `disclosures.css`) and 20 `color-mix(` expressions.
- An ID selector made only of hex letters and not followed by `-` would be counted.
- Declarations already overridden by a later file are still counted.

## 2. Colour literals in `.ts`/`.tsx` under `src/` (excluding `src/generated`)

```bash
grep -rnoP --include='*.ts' --include='*.tsx' --exclude-dir=generated "$HEX|$FN" src | wc -l
grep -rnoP --include='*.ts' --include='*.tsx' --exclude-dir=generated "$HEX|$FN" src | cut -d: -f1 | sort | uniq -c | sort -rn
```

**Result: 42 in 9 files.**

| Count | File | What |
|---|---|---|
| 22 | src/lib/support-email.ts | Email HTML inline styles |
| 9 | src/lib/auth-email.ts | Email HTML inline styles |
| 3 | src/app/layout.tsx | `themeColor "#5d4cf2"` (`:37`); private-test banner `#fff0c2`/`#4a3500` (`:51`) |
| 2 | src/app/manifest.ts | `background_color`, `theme_color` |
| 2 | src/components/ContactsBulkWorkspace.tsx | Tag colour input default `#5d4cf2` (`:174`); tag-dot fallback `#dfe4ee` (`:181`) |
| 1 each | TemplateUseForm.tsx:99, MixEditor.tsx:207, ContactProfile.tsx:218, ContactForm.tsx:277 | Tag-dot fallback `group.color ?? "#dfe4ee"` |

Of the 42, 31 are email HTML, where CSS variables are not available, and 11 are UI code. The fallback `#dfe4ee` is the legacy `--line` value from `base.css:8` and is repeated in 5 components.

**Method limits:** comments in TS are not stripped (none matched). Named colours are not counted. Tag colours stored in the database are data, not literals.

## 3. `window.confirm` / bare `confirm(`

```bash
grep -rnE --include='*.ts' --include='*.tsx' 'window\.confirm\(' src
grep -rnoE --include='*.ts' --include='*.tsx' '(^|[^A-Za-z0-9_.$])confirm\(' src | wc -l
# Files calling a bare confirm( that do NOT take `confirm` from useConfirmDialog (expect 0):
comm -23 <(grep -rlE --include='*.ts' --include='*.tsx' '(^|[^A-Za-z0-9_.$])confirm\(' src | sort) \
         <(grep -rlE --include='*.tsx' 'const \[confirm, [A-Za-z]+\] = useConfirmDialog\(\)' src | sort) | wc -l
```

**Result: 2 native calls, both in `src/components/FormGuard.tsx`.**
- `:24` is the navigation guard ("Leave without saving your changes?"), the documented exception.
- `:45` is a **second** native confirm for submitting another form while this one is dirty ("This action can reload the page. Continue without saving the other form’s changes?"). It is not a navigation guard.

There are 10 bare `confirm(` calls. All of them are the `useConfirmDialog` hook's function, in 10 files; the cross-check prints 0. `alert(`/`prompt(`: 0.

**Method limits:** a hook result renamed to something other than `confirm` would not be cross-checked. Dynamic access (`window["confirm"]`) is not detected.

## 4. Candidate customer-visible terms

Scope: `src/app` and `src/components`, `.ts`/`.tsx`, excluding tests. The 301 files in scope yield 21,306 segments (300 files contribute at least one).

```bash
seg=$(mktemp); copy_segments src/app src/components > "$seg"; wc -l < "$seg"
cust=$(mktemp); grep -vP '^src/app/\(staff\)/|^src/app/staff/|^src/app/api/|^src/components/Admin' "$seg" > "$cust"
for t in "Plan" "Plans" "Mix" "Mixes" "Beat" "Beats" "Jump" "Jumps" "Step" "Steps" "Follow-ups?" "follow-ups?" \
         "Saved dates?" "Important Dates?" "Journey" "Campaigns?" "Connect" "Connected" "Mega-Mix" "Mega-Mixes" "Marketplace" \
         "Mega-mix(es)?" "mega-mix(es)?" "mix" "mixes" "Tags?|tags?"; do
  e=$(cut -f2- "$seg" | grep -oP "$PRE(?:$t)$POST" | wc -l);  ec=$(cut -f2- "$cust" | grep -oP "$PRE(?:$t)$POST" | wc -l)
  i=$(cut -f2- "$seg" | grep -oiP "$PRE(?:$t)$POST" | wc -l); ic=$(cut -f2- "$cust" | grep -oiP "$PRE(?:$t)$POST" | wc -l)
  printf "%-18s %6s %6s %6s %6s\n" "$t" "$e" "$ec" "$i" "$ic"; done
# Top files for a term (counts segments, not occurrences):
grep -P "\t.*$PRE(?i)plans?$POST" "$cust" | cut -f1 | sort | uniq -c | sort -rn | head
```

Column definitions:
- **exact** is case-sensitive over the whole scope.
- **cust** is the customer scope: it excludes `src/app/(staff)/`, `src/app/staff/`, `src/app/api/` and `src/components/Admin*`.
- **any** is case-insensitive over the whole scope.
- **anyC** is case-insensitive over the customer scope.

"s?" includes the plural.

| Term | exact | cust | any | anyC | Where / what |
|---|---|---|---|---|---|
| Plan | 2 | 2 | 39 | 39 | Mostly lowercase "plan". Public pages: `follow-up-templates/*` (14 segments), `PublicCapabilities`, `PublicLanding`, `ProductDemo`, `faq`. In-app: "Name your plan", "Review your plan" (`TemplateUseForm`), "Follow-up plan for this visit (optional)", "No plan" (`CalendarEntryForm`), "Review your first plan" (`StarterPreview`), "…instead of the plan’s …" (Today, `jumps/page.tsx`) |
| Plans | 0 | 0 | 10 | 10 | As above |
| Mix | 182 | 175 | 335 | 315 | Capitalised "Mix" 182, lowercase "mix" 134 ("Create a mix", "Set up your mix", "Edit mix" titles) |
| Mixes | 60 | 60 | 179 | 162 | Lowercase "mixes" 119 ("Ready-made mixes", "My mixes") |
| Beat | 76 | 73 | 115 | 110 | Lowercase "beat" in aria-labels ("Options for beat N") |
| Beats | 54 | 53 | 74 | 72 | |
| Jump | 4 | 1 | 12 | 3 | Mostly code (SQL `"Jump"`, audit `entityType`). Customer hits: short brand "Jump inserts…" (`SystemMixPreview`) and the verb "jump in" |
| Jumps | 0 | 0 | 0 | 0 | The route `/jumps` is excluded by the path boundary |
| Step | 2 | 2 | 41 | 38 | Mostly generic "next step". Product uses: glossary "One step in a Mix", "Steps waiting for your decision", "Step 3 · Record what happened" |
| Steps | 1 | 1 | 13 | 11 | |
| Follow-up(s) | 38 | 33 | 301 | 263 | Capitalised |
| follow-up(s) | 258 | 225 | 301 | 263 | Lowercase. Together with the row above: **296** exact-case uses (5 other casings make up the 301 any-case). **Today surfaces: 64 "follow-up(s)" vs 6 "Beat(s)"** |
| Saved date(s) | 8 | 6 | 24 | 22 | `/settings/jump-date-types` title "Saved date types"; `LibraryDraftForm` (staff); `ContactImportWizardV2` |
| Important Date(s) | 0 | 0 | 0 | 0 | |
| Journey | 40 | 39 | 116 | 110 | Lowercase "journey" 76 ("Customer journey", "journey preferences") |
| Campaign(s) | 0 | 0 | 0 | 0 | |
| Connect | 10 | 8 | 21 | 19 | Calendar/connections/MFA ("Connect calendar", "Connect a source") |
| Connected | 8 | 5 | 37 | 28 | Also a call outcome ("Connected call", `api/jumps/[jumpId]/outcome`) |
| Mega-Mix | 51 | 49 | 74 | 72 | Canonical singular. Any-case adds 5 "Mega-mix" and 18 "mega-mix" |
| Mega-Mixes | 16 | 16 | 24 | 24 | Canonical plural. Any-case adds 4 "Mega-mixes" and 4 "mega-mixes" |
| Mega-mix(es) | 9 | 9 | 98* | 96* | Variant: glossary `BrandTermsHelp.tsx:9`, `/templates/journeys` title |
| mega-mix(es) | 22 | 22 | 98* | 96* | Variant: `MegaMixLibrary` (11 segments), `MegaMixSetup`, `WorkflowJourney`, `/mixes/mega`, `OnboardingForm`, preferences copy |
| Marketplace | 31 | 30 | 32 | 31 | |
| Tag(s) | 43 | 40 | 43 | 40 | Customer term for the `Group` model |

\*Case-insensitive `Mega-mix(es)?` covers every spelling, singular and plural: 51 + 16 + 9 + 22 = 98. **Canonical "Mega-Mix(es)" = 67; variant spellings = 31.**

Today surfaces are `jumps/page.tsx` plus the `EditableFollowUpAction`, `JumpWorkflow`, `JumpActionControls`, `FollowUpChannelChoice`, `PreparationNotice`, `TodayNavigation`, `WorkflowAttention`, `TodayBriefing` and `QuietDaySuggestions` components:

```bash
TODAY='^src/(app/\(app\)/jumps/page\.tsx|components/(EditableFollowUpAction|JumpWorkflow|JumpActionControls|FollowUpChannelChoice|PreparationNotice|TodayNavigation|WorkflowAttention|TodayBriefing|QuietDaySuggestions)\.tsx)\t'
grep -P "$TODAY" "$seg" | cut -f2- | grep -oiP "${PRE}follow-ups?$POST" | wc -l   # 64
grep -P "$TODAY" "$seg" | cut -f2- | grep -oiP "${PRE}beats?$POST" | wc -l       # 6
rm -f "$seg" "$cust"
```

Supplementary, outside the metric scope: `src/lib` also carries customer copy (ready-made libraries, FAQ, demo, error messages). `copy_segments src/lib` (13,604 segments) gives any-case plan(s) 52, step(s) 73, follow-up(s) 202, beat(s) 83, mega-mix(es) 33, saved date(s) 27. The top `plan` sources are `persona-mixes.ts`, `mega-mixes.ts` and `sales-plan-library.ts`.

**Method limits:**
- It is a heuristic. It captures quoted strings and single-line JSX text only, so text split across lines is missed.
- Code strings still count: keys like `"mix"`, SQL table names, template-literal code. The boundaries exclude hyphen/slash/query/identifier forms (class names, routes, `mix.id`).
- It cannot tell a noun from a verb or generic use ("next step", "jump in", "follow-up time").
- Only whole-line and leading `//` comments are dropped. Trailing `//` comments stay.
- The brand "Jump in the Mix" is stripped before counting.
- ASCII apostrophes inside single-quoted strings can mis-pair segments.
- Treat counts as trend indicators.

## 5. Raw `<svg` in `.tsx` outside `AppIcon.tsx`

```bash
grep -rnoE --include='*.tsx' '<svg\b' src | grep -v '^src/components/AppIcon.tsx:' | cut -d: -f1 | sort | uniq -c | sort -rn
```

**Result: 4 in 3 files.**
- `WhenPicker.tsx:42-43` has its own `PrevIcon`/`NextIcon` chevrons (viewBox 20, stroke 1.8). They duplicate AppIcon's `chevronLeft`/`chevronRight`.
- `ProfessionMarks.tsx:5` draws profession line icons.
- `WorkflowGraphEdges.tsx:15` draws the Journey graph edge canvas. This is data drawing, not an icon.

**Method limits:** `.ts` files, `dangerouslySetInnerHTML` SVG strings, CSS `url("data:image/svg+xml…")` masks (for example in `disclosures.css`) and `<img src="*.svg">` are not counted.

## 6. `font-family` outside `design-tokens.css` / font setup

```bash
for f in $(find src -name '*.css' ! -name design-tokens.css | sort); do nocomment "$f" | grep -oE 'font-family\s*:[^;}]*' | sed "s|^|$f: |"; done \
  | sed -E 's/^([^:]+): font-family\s*:\s*/\1\t/' | awk -F'\t' '{print $2}' | sort | uniq -c | sort -rn
grep -rnoE --include='*.ts' --include='*.tsx' --exclude-dir=generated 'font-family:[^;"]*|fontFamily' src
```

**Result: 27 declarations in CSS**, in 15 files, with this split:

| Value | Count | Files |
|---|---|---|
| `var(--font-voice)` | 18 | Token-conformant |
| `var(--font-ui)` | 4 | Token-conformant |
| `inherit` | 2 | `admin.css:124`, `popups.css:18` |
| `var(--font-sans, inherit)` | 1 | `phone-icons.css:46`. `--font-sans` is undefined, so the fallback `inherit` applies |
| `ui-monospace, monospace` | 1 | `product.css:415` (`.copy-field textarea`) |
| `Inter, ui-sans-serif, …` | 1 | `base.css:58` (`body`; overridden by `design-system.css:3`) |

TS/TSX: 0 `fontFamily`. Three `font-family` strings sit in email HTML (`support-email.ts:57`, `auth-email.ts:18`, `automatic-delivery.ts:92`). The font setup itself is `src/app/layout.tsx:15-21` (next/font/local) and the token definitions are `design-tokens.css:32-33`.

**Method limits:**
- `font:` shorthand is not counted. All 24 shorthands are either `inherit` (20) or `var(--font-ui)` (4), per `grep -rnoE '(^|[;{ ])font\s*:[^;}]*' src --include=*.css`.
- The check does not verify that voice/UI usage matches the content: every `textarea` defaults to `--font-voice` via `design-system.css:5`.

## 7. Stylesheets and `index.css` imports

```bash
ls src/styles/*.css | wc -l                                    # 37
grep -c '^@import' src/styles/index.css                        # 36
for f in src/styles/*.css; do b=${f##*/}; [ "$b" = index.css ] && continue; grep -qF "@import \"./$b\";" src/styles/index.css || echo "NOT IMPORTED: $f"; done
ls src/components/*.module.css | wc -l                         # 9
```

**Result:** 37 files (36 partials plus `index.css`). **Every partial is imported (0 not imported).** `design-tokens.css` is the 25th import (`index.css:26`), after 24 legacy partials. Nine CSS modules are imported directly by components. No other `.css` exists in `src/`.

**Method limits:** the check covers existence and import only, not whether a partial's rules are still used.

## 8. `!important` in `src/styles`

```bash
for f in src/styles/*.css; do n=$(nocomment "$f" | grep -oE '!\s*important' | wc -l); [ "$n" -gt 0 ] && echo "$n $f"; done | sort -rn
for f in src/styles/*.css; do nocomment "$f" | grep -oE '!\s*important'; done | wc -l
for f in src/components/*.module.css; do nocomment "$f" | grep -oE '!\s*important'; done | wc -l
```

**Result: 38 in `src/styles`** (9 files); CSS modules add **2**, both in `WorkflowJourney.module.css`.

| Count | File |
|---|---|
| 19 | base.css (8 in two duplicated reduced-motion blocks at `:69` and `:329`, 10 in `.sr-only` at `:342`, 1 `.hero-note` at `:97`) |
| 6 | components.css |
| 5 | mobile-ux.css |
| 2 | product.css |
| 2 | homepage.css |
| 1 each | support.css, mobile-clarity.css, live-search-cards.css, design-public.css |

**Method limits:** legitimate uses (reduced motion, visually-hidden utility) are counted the same as override hacks.

## 9. Inline `style={{` in `.tsx`

```bash
grep -roE --include='*.tsx' 'style=\{\{' src | wc -l
grep -roE --include='*.tsx' 'style=\{\{' src | cut -d: -f1 | sort | uniq -c | sort -rn | head -10
grep -rlE --include='*.tsx' 'style=\{\{' src | wc -l
```

**Result: 30 in 20 files.** Top files:

| Count | File |
|---|---|
| 8 | src/components/WorkflowJourney.tsx (canvas geometry and zoom) |
| 2 | SystemMixPreview.tsx |
| 2 | SignaturePreview.tsx |
| 2 | src/app/(staff)/admin/waitlist/page.tsx |
| 1 each | WorkflowConnections, TemplateUseForm, ReportTrend, MixEditor, ContactsBulkWorkspace, ContactProfile (and 10 more files) |

By purpose:
- 5 tag-dot colours with the `#dfe4ee` fallback (metric 2)
- 3 `transform: rotate(180deg)` on `arrowLeft`, used as a "next page" arrow (`marketplace/page.tsx:113`, `mixes/page.tsx:74`, `templates/page.tsx:118`)
- 9 `overflowWrap`/`whiteSpace` text rules (5 of them on staff pages)
- 2 `visibility` toggles
- 1 bar height and 1 custom property (admin reports)
- the private-test banner in `layout.tsx:51`

**Method limits:** `style={variable}` is not counted (0 exist). The count does not separate data-driven values, which are legitimate, from static styling.

## 10. Routes by group and export mockup coverage

```bash
find src/app -name page.tsx | sed -E 's#^src/app/##; s#/?page\.tsx$##' \
  | awk '{ if ($0 ~ /^\(app\)/) g="(app)"; else if ($0 ~ /^\(staff\)/) g="(staff)"; else if ($0 ~ /^staff\//) g="staff/"; else g="other"; print g }' | sort | uniq -c
find src/app -name route.ts | wc -l
# Root page class and archetype per (app) route:
find 'src/app/(app)' -name page.tsx | sort | while read -r f; do r=${f#"src/app/(app)"}; r=${r%/page.tsx}
  c=$(grep -oE 'className=("|\{`)page( [^"`]*)?["`]' "$f" | sed -E 's/^className=("|\{`)//; s/["`]$//' | sort -u | tr '\n' ';')
  echo "${r:-/} | ${c:-(root class set in a component)}"; done
```

**Result:**
- **90 pages:** (app) 33, (staff) 30, `staff/` 1 (`/staff/accept`), other 26. The other 26 are 17 public (marketing and content 11, `/offline`, waitlist 3, tokenized `/lead` and `/review`) and 9 auth/account lifecycle including `/onboarding`.
- **50 API handlers.**

The export (`docs/design/jump-in-the-mix-designs/screens/`) has 49 screens. There are 25 light screens, 24 of which have a Dark variant; `ThemeTokens` has none.

| Export family (screens) | Route |
|---|---|
| Today (Main, Review, TodaySent, TabletToday, TabletTodayWide, DesktopToday) | `/jumps` |
| Contacts (Contacts, DesktopContacts) / Contact | `/contacts` / `/contacts/[contactId]` |
| Mixes (Mixes, DesktopMixes "library and editor") | `/mixes` (`/mixes/[mixId]/edit` redirects here) |
| Journey (Journey, TabletJourney, DesktopJourney, DesktopJourneyStage) | `/journey` |
| Calendar (Calendar, DesktopCalendar) | `/calendar` |
| More (More) | `/more` |
| Quick Add (QuickAdd, DesktopQuickAdd) | `QuickAddDialog`, not a route |
| Landing (Landing, LandingTablet, LandingPhone) | `/` and `/for/[profession]` (shared `PublicLanding`) |
| BubbleKit, ThemeTokens | Component and token references |

**(app) routes with a mockup: 8.** They are `/jumps`, `/contacts`, `/contacts/[contactId]`, `/mixes`, `/mixes/[mixId]/edit` (redirect), `/journey`, `/calendar` and `/more`.

**(app) routes without a mockup: 25:**

| Route | Archetype / root class (cited line) |
|---|---|
| /account | `page--content` (`account/page.tsx:51`) |
| /account/tickets | `page--content` (`:26`) |
| /account/tickets/[ticketId] | `page--content` (`:57`) |
| /help | `page--content` (`help/page.tsx:50`) |
| /account/preferences | `page--form` (`:42`) |
| /contacts/new | `page--form` (`:48`) |
| /contacts/[contactId]/edit | `page--form` (`:38`) |
| /mixes/system | `page--form` (`:42`) |
| /settings/business | `page--form` (`:38`) |
| /settings/notifications | `page--form` (`:30`) |
| /settings/sending | `page--form` (`:23`) |
| /marketplace | none: `mix-workspace-page marketplace-page` (`:67`) |
| /mixes/mega | none: `mix-workspace-page mega-mix-page` (`:52`) |
| /templates | none: `mix-workspace-page ready-made-workspace` (`:78`) |
| /templates/journeys | none: `mix-workspace-page` (`:25`) |
| /settings | none: `settings-page` (960px rule, `design-workspaces.css:26`) |
| /contacts/archived | none: `archived-contacts-page` (`:62`) |
| /contacts/duplicates | none: `duplicate-contacts-page` (`:50`) |
| /contacts/import | none: `import-contacts-page` (`:42`) |
| /settings/connections | none: `connections-page` (`:37`) |
| /templates/[sharedMixId]/use | none: `template-use-page` (`:43`) |
| /contacts/custom-fields | none: plain `page` (`:41`) |
| /mixes/new | none: plain `page` (`:33`) |
| /settings/journey | none: plain `page` (`:24`) |
| /settings/jump-date-types | none: plain `page` (`:51`) |

Split: **11 archetype** (4 `page--content`, 7 `page--form`) and **14 none**. Of the 14, 4 inherit the Mixes workspace layout via `mix-workspace-page`, 1 has the 960px settings width, and 9 have only page-specific or plain classes.

Outside (app):
- The (staff) pages (30 + 1) and the 24 public/auth pages without a Landing mockup have no export screens.
- They use `staff-shell`/`admin-workspace-main`, `auth-shell`/`auth-card`, `public-page`, `PublicArticle`/`PublicDocument`, `public-lead-page`, `review-page` and `onboarding-shell`.

**Method limits:**
- The mockup mapping is manual, by route family.
- Root classes set inside components (`/jumps` → `TodayNavigation.tsx:89` `page today-page`; `/contacts/[contactId]` → `ContactProfile.tsx:86` `page contact-detail-page`) need the cited lines.
- Pages with a second early-return root (`/account/preferences:27`, `/mixes/system:29`) show two classes.

## 11. AppIcon usages without explicit dimensions

`AppIcon` (`src/components/AppIcon.tsx:83-85`) takes `name` plus any `SVGProps`. It sets **no** default `width`/`height` and has no size prop. The API does not require dimensions, so this metric records how sizing is actually supplied.

```bash
grep -roE --include='*.tsx' '<AppIcon\b[^>]*>' src | wc -l                                              # usages
grep -rhoE --include='*.tsx' '<AppIcon\b[^>]*>' src | grep -cE '\b(width|height)='                      # with size props
for f in $(find src -name '*.css' | sort); do nocomment "$f" | grep -oE '(^|\})\s*[^{}@]*svg[^{}]*\{[^}]*\b(width|height|inline-size|block-size)\s*:'; done | wc -l   # CSS rules sizing svg
for f in $(find src -name '*.css' | sort); do nocomment "$f" | grep -oE '\[data-icon[^]]*\]'; done | sort | uniq -c
```

**Result:**
- **290** `<AppIcon>` JSX usages in 63 files. **0** pass `width`/`height`. 7 pass `className` and 3 pass `style` (the rotations).
- Sizing comes from **108** single-line CSS rules that set `width`/`height` on an `svg` selector, for example `.nav-link svg` (`base.css`), `.icon-button svg` and `.button > svg` (`components.css`).
- Only 9 `[data-icon]` selectors exist: `chevronDown` 6 and `more` 3, all in `disclosures.css`.

**Method limits:**
- It is not possible to prove statically that each of the 290 usages is covered by some sizing rule. That needs a rendered check, such as a Playwright computed-size assertion per page.
- Multi-line CSS rules are missed by the rule count.
- `grep -o` counts are per tag.

## 12. Hard-coded px breakpoints in `@media`

Documented set (from the design guidelines, supplied by the standards lead): max 767 / min 768, max 900 / min 901, max 1099 / min 1100, max 1199 / min 1200, max 1279 / min 1280.

```bash
bp=$(mktemp); for f in $(find src -name '*.css' | sort); do nocomment "$f" | grep -oE '@media[^{]*' | grep -oE '(min|max)-width\s*:\s*[0-9]+px' | sed -E "s/\s//g; s|^|$f |"; done > "$bp"
wc -l < "$bp"                                                            # width features
awk '{split($2,a,":"); print a[2]}' "$bp" | sort -u | wc -l               # distinct px values
awk '{split($2,a,":"); v=a[1]":"a[2]; if (v ~ /^max-width:(767|900|1099|1199|1279)px$/ || v ~ /^min-width:(768|901|1100|1200|1280)px$/) i++; else o++} END {print "in-set", i, "off-set", o}' "$bp"
awk '{print $2}' "$bp" | sort | uniq -c | sort -k2,2                      # value histogram
awk '{split($2,a,":"); v=a[1]":"a[2]; if (!(v ~ /^max-width:(767|900|1099|1199|1279)px$/ || v ~ /^min-width:(768|901|1100|1200|1280)px$/)) print $1}' "$bp" | sort | uniq -c | sort -rn | head -10
rm -f "$bp"
```

**Result:**
- 200 `@media` preludes (10 are feature-only: reduced motion, contrast, forced colours, colour scheme).
- **195** px width features and **40** distinct px values.
- **69 in the documented set, 126 off-set.**
- There are also 3 `max-height: 480px` features.
- JS media queries: `(max-width: 760px)` in `PublicConversionEvents.tsx:23`, `(min-width: 1200px)` twice in `ContactsBulkWorkspace.tsx:77` and `:214`, and `(min-width: 768px)` in `src/lib/sheet-layout.ts:1`.

In-set counts:

| Feature | Count |
|---|---|
| max 767 | 14 |
| min 768 | 7 |
| max 900 | 22 |
| min 901 | 3 |
| max 1099 | 1 |
| min 1100 | 4 |
| max 1199 | 6 |
| min 1200 | 10 |
| max 1279 | 2 |
| **min 1280** | **0** |

Off-set values:

| Value (count) |
|---|
| max 340 (2), 350 (1), 360 (2), 370 (2), 380 (2), 400 (2), **430 (11)**, 480 (2), 520 (2), 560 (1) |
| **max 600 (31)**, min 601 (2), max 640 (1), 680 (4), 700 (1), max 720 (2), min 720 (1) |
| **max 760 (18)**, min 761 (3), max 820 (1), 860 (1), min 960 (1), max 980 (7), 1000 (4), 1040 (1), 1050 (1) |
| **max 1100 (3)**, which overlaps min 1100 at exactly 1100px |
| **max 1200 (1)**, which overlaps min 1200 |
| min 1300 (1), 1600 (3), max 1699 (1), min 1700 (8), 1840 (1), 2200 (2) |

Off-set by file:

| Off-set count | File |
|---|---|
| 19 | homepage.css |
| 12 | WorkflowJourney.module.css |
| 10 | admin-density.css |
| 7 | design-workspaces.css |
| 6 | product.css |
| 6 | admin-layout.css |
| 5 | design-details.css |
| 5 | components.css |
| 4 | mix-library.css |
| 4 | invitations.css |

**Method limits:**
- Counts are per feature, not per rule.
- `em`/`rem` breakpoints are not counted; none exist.
- Container queries and range syntax (`width <= …`) are not counted; none exist.
- The documented set is a proposal input. Off-set values include deliberate content-specific breakpoints (the homepage, very narrow phones, ultrawide).

## Design audit 2026-11-08

VERIFIED-DOC against the [81-finding record](../design/UX_AUDIT_2026-11-08.md); implementation status is VERIFIED-CODE on origin/main ef7a02c7b86d29d9c3ed5cab4928758166e24740, not a new runtime pass or deployment. Owners come from TASK INDEX note_afed3747fce4b863 and THIRD PASS note_56c7970c11e1562a; offline build ownership was later split to UXA-18B. Do not copy an open/partial pattern from its example route. A D row preserves an intentional contract until its decision is resolved; it is not permission to change it. Historical metrics above are unchanged.

| Finding | Pattern / example route | Owning fix task | Status at base |
|---|---|---|---|
| E-01 | links in body-text colour, no underline, weight 400; `/follow-up-templates` | UXA-01 (job_8408dd534b5d) | Resolved in code: 3d79992 (d2f567e implementation), UXA-01-LAND job_8d832dfdab9f; runtime recheck stays UXR-01. |
| E-02 | Today, Mega-Mixes, Marketplace, Journey map and Quick Add reach visitors undefined; "Open Today" is the only sign-in path; `/` | UXA-05 (job_26644246a0a1) | Resolved in code: 5bc117b; verify future first-use terms against the rule. |
| E-03 | one thing, several names: Templates / Ready-made / Marketplace / Mega-Mix; Lead sources / Lead connections; Date types / Saved date types; /settings/journey titled "Contact stages"; "Skip this text" / "Skip Beat"; "Review" means four actions on Today; `/jumps` | UXA-07 (job_26e9425c8e09) | Open; not a canonical reference. |
| E-04 | three templates: H1 60 px, 48 px or about 30 px; nav items change per page; the legal header shows only "Sign in" even when signed in; the auth card has no header; ToC links underlined on legal pages but not on template pages; `/privacy` | UXB-01 (job_fe7761baec35) | Partial: policy header reused at 5bc117b; H1/ToC consistency remains open. |
| E-05 | a 5-7-line disclaimer under every demo button; "Nothing is published as a placeholder"; the "Plan here, send with your own voice" box on every template page; `/follow-up-templates/estimate-follow-up` | UXA-06 (job_e5a211855a70) | Open; not a canonical reference. |
| E-06 | home column 81 characters per line, Privacy 98, template boxes and reminder lists 123-140; `/privacy` | UXB-01 (job_fe7761baec35) | Open; not a canonical reference. |
| E-07 | Bare brand document titles and titles that disagree with the visible H1; `/journey`, `/offline`, `/mixes/new` | UXA-10 (job_41d265c99e41) | Open; not a canonical reference. |
| E-08 | no skip link (public pages have one); `/jumps` | UXB-03 (job_a2a12aba8e5a) | Open runtime discrepancy: AppShell already contains skip-link markup; UXB-03 must check reachability, not add a duplicate. |
| E-09 | disabled primary with no reason shown; `Quick Add` | UXB-03 (job_a2a12aba8e5a) | Open; not a canonical reference. |
| E-10 | raw 10-digit phone numbers (the demo formats them); `/contacts/[id]` | UXB-04 (job_a5a8516f1138) | Open; not a canonical reference. |
| E-11 | CSS uppercase ("BEAT 1 OF 2", table headers, "YOUR NEXT SEVEN DAYS"); Title Case ("Quick Add", "Import Contacts", "Archived Contacts", "Real Estate Agents" chip next to "Real estate agents"); `/calendar` | UXB-04 (job_a5a8516f1138) | Open; not a canonical reference. |
| E-12 | the serif voice font used for system events and the Quick Add placeholder, but not for message text on public template pages; `Quick Add` | UXB-04 (job_a5a8516f1138) | Open; not a canonical reference. |
| E-13 | H1 60 px at -0.06em letter-spacing, line-height 1.02; letters touch; `/` | UXB-01 (job_fe7761baec35) | Open; not a canonical reference. |
| E-14 | phone headings break "follow-" / "up"; `/` | UXB-01 (job_fe7761baec35) | Open; not a canonical reference. |
| E-15 | first inline item sits about 4 px high; `/faq` | UXA-15 (job_2650d19a1f23) | Open; not a canonical reference. |
| E-16 | middle-dot strings ("3 Beats · a reusable follow-up plan") and em dashes read as generic; `/` | UXB-01 (job_fe7761baec35) | Product-only / taste; no new rule. |
| E-17 | tapped buttons keep the hover colour on touch; `shared buttons` | UXB-03 (job_a2a12aba8e5a) | Open; not a canonical reference. |
| E-18 | each validates differently. Calendar with an empty title shows the browser tooltip, no inline message, no aria-invalid. Waitlist shows the browser tooltip. Add contact has no client check, and its failure banner repeats itself ("Your entries are kept… Your entries are still here"); `/calendar` | UXA-16 (job_30ad2b5af772) | Open; not a canonical reference. |
| E-19 | logo on some (waitlist, verify, magic link, staff invite, reset) but not others (account deleted, offline, expired feedback link); buttons right-aligned on 404, onboarding and Reconnect, left elsewhere; `/offline` | UXB-02 (job_56ed53bc1495) | Open; not a canonical reference. |
| E-20 | error pages keep happy-path headings: "Set up your staff access" above "This invitation is unavailable"; "Choose a new password" above "This reset link is incomplete"; "Confirm your email" with a confirm button and no token. The magic-link page does it right; `/staff/accept` | UXB-02 (job_56ed53bc1495) | Open; not a canonical reference. |
| M-01 | about 170 px dead band; switching the demo step moves the chips about 45 px; the next section starts near y 1,010; `/` | UXA-06 (job_e5a211855a70) | Open; not a canonical reference. |
| M-02 | marketing look reads as a stock SaaS template (tight sans, near-white, one accent, hairlines, soft shadow, stock section order); `/` | UXA-12 (job_2719e5b51171) | Open decision; keep the named JITM contract. |
| M-03 | the real product is never shown; `/` | UXA-12 (job_2719e5b51171) | Open decision; keep the named JITM contract. |
| M-04 | five /for/ profession pages share about 3,300 identical characters below the hero; `/for/contractors` | UXA-13 (job_34a695b3105f) | Open; not a canonical reference. |
| M-05 | "Find a follow-up Mix for your work" mixes five links and seven unlinked items in one list style; `/` | UXA-13 (job_34a695b3105f) | Open decision; keep the named JITM contract. |
| M-06 | three equal cards, no action, features in product terms; Pricing missing from the header and phone menu; `/pricing` | UXA-14 (job_5097b82f3da1) | Open; not a canonical reference. |
| M-07 | /faq#your-data highlights but doesn't open its answer; questions 14 px under 16 px answers; `/faq#your-data` | UXB-02 (job_56ed53bc1495) | Open; not a canonical reference. |
| M-08 | the ToC fills a phone screen; messages in sans while the demo uses the serif; "Copied" feedback is small grey text; `/follow-up-templates/estimate-follow-up` | UXB-01 (job_fe7761baec35) | Open; not a canonical reference. |
| M-09 | "Jump in the Mix is operated by Jump in the Mix"; an "Effective" date on Contact; legal pages show "Sign in" when signed in; `/contact` | UXB-02 (job_56ed53bc1495) | Product-only / taste; no new rule. |
| M-10 | 0 px between the button and its helper text; thin margins on phones; `/waitlist` | UXA-15 (job_2650d19a1f23) | Open; not a canonical reference. |
| M-11 | buttons right-aligned under left text; no header, footer or main landmark; signed-in users sent to the marketing home; `unknown route` | UXA-15 (job_2650d19a1f23) | Open; not a canonical reference. |
| M-12 | demo email textarea scrolls inside a fixed box and hides the signature; `/` | UXB-02 (job_56ed53bc1495) | Open; not a canonical reference. |
| M-13 | the expired feedback link has no brand or next step; /account/deleted reachable while signed in says the account was deleted; signed-in members on /register or /verify-email/pending see invitation paths; `/register` | UXB-02 (job_56ed53bc1495) | Open; not a canonical reference. |
| A-01 | "Needs review · 0" shows at zero with its explainer; a "Next" block repeats the first card; then "1 more action needs attention" and two banners; "Review" appears four or more times; H1 "Today" sits over a group heading "Today"; `/jumps` | UXA-02 (job_0b1956750ccb) | Open; not a canonical reference. |
| A-02 | desktop list columns about 300 px wrap every subtitle while the detail pane has spare width; on Contacts the H1 sits below a "Needs review" strip; `/contacts` | UXA-11 (job_ff793332fb37) | Open; not a canonical reference. |
| A-03 | Today search opens a modal with a Search button; Filter is a modal of four selects plus three unexplained presets, with no reset; `/jumps` | UXB-05 (job_c4544b060350) | Open; not a canonical reference. |
| A-04 | raw {{First Name}} and {{SMS Signature}} tokens in edit view (Preview shows chips); Save at the end of a long form with no sticky bar; `/mixes/[id]` | UXA-08 (job_738b06153234) | Open; not a canonical reference. |
| A-05 | "Create a Mix" is a bare "+"; Preview/Edit view tabs styled like the Share and Start buttons; library tabs touch the column edge and collide at 328 px; `/mixes` | UXB-05 (job_c4544b060350) | Open; not a canonical reference. |
| A-06 | opens on a 3,950 px map with clipped labels, internal codes (A1, A1.a) as labels and 29 elements at 11 px; the List view is clearer; `/journey` | UXA-10 (job_41d265c99e41) | Open decision; keep the named JITM contract. |
| A-07 | desktop Calendar lands in a blank "New event" form; title field placeholder-only; labels beside some fields and above others; week buttons wrap; `/calendar` | UXA-09 (job_7e372db56d61) | Open; not a canonical reference. |
| A-08 | both H1s are "Mixes"; adding is a "Use this Mix" button (twice on one screen) on one and a "+ Set up this Mix" link on the other; a sub-tab wraps; `/marketplace` | UXA-07 (job_26e9425c8e09) | Open; not a canonical reference. |
| A-09 | "Everything is required unless marked optional", but only one of name, company, phone or email is required; the "optional" marker floats right on some labels and inline on others; "Add another phone/email" sits below the notes box; `/contacts/new` | UXB-06 (job_9ca5b9672d9a) | Open; not a canonical reference. |
| A-10 | 11 ungrouped rows; "Calendar & time blocks" leaves Settings; the checkbox-row component runs labels into descriptions ("EmailNot available yet", "Morning digestA short list…"); a smaller second checkbox on phones; `/settings` | UXA-15 (job_2650d19a1f23) | Open; not a canonical reference. |
| A-11 | contact history repeats the same event line four or more times, each with a menu; `/contacts/[id]` | UXB-04 (job_a5a8516f1138) | Open; not a canonical reference. |
| A-12 | uppercase field labels; a long email-change policy paragraph in the profile table; a large empty column; `/account` | UXB-04 (job_a5a8516f1138) | Open; not a canonical reference. |
| A-13 | Quick Add's "N" shortcut badge on the compact tablet rail; `Quick Add` | UXB-03 (job_a2a12aba8e5a) | Open; not a canonical reference. |
| A-14 | Personal preferences has five Save buttons; Notifications stacks two full-width primaries ("Save email reminders" and "Send me a test reminder"); Save placement varies (sticky on Add contact, page bottom on Mix editor and My business, mid-page on Notifications); `/account/preferences` | UXA-17 (job_36fb00a64b10) | Resolved in code: 338ae42 / ef7a02c; per-section markers and shared SaveBar are canonical. |
| A-15 | custom fields show {{contact.custom.custom_contact_information_1}} keys and explain a "generated placeholder key"; `/settings/custom-fields` | UXA-08 (job_738b06153234) | Open; not a canonical reference. |
| A-16 | /mixes/new lands on the ready-made library with the first template preselected; title "Ready-made Mixes", H1 "Mixes"; scratch start is a small "+"; `/mixes/new` | UXB-05 (job_c4544b060350) | Open decision; keep the named JITM contract. |
| A-17 | Invite people lives at /mixes/system, so the nav highlights Mixes; `/mixes/system` | UXA-07 (job_26e9425c8e09) | Open decision; keep the named JITM contract. |
| A-18 | offline masks every page behind "We couldn't confirm your account" and hides loaded data; `/jumps offline` | UXA-18B (job_c81437336251) | Owner decided; not built. Review dissent remains recorded with UXA-18B. |
| A-19 | Today paints content at about 2.4 s warm desktop; first paint is the "Checking your account…" card on every full load; `/jumps` | UXB-08 (job_e0ae7b318010) | Open; not a canonical reference. |
| A-20 | loading is text-only on an empty pane ("Loading Mixes… Your saved work is being loaded…"); after navigation focus stays on the body (the announcer reads the title); `/mixes` | UXB-03 (job_a2a12aba8e5a) | Open; not a canonical reference. |
| A-21 | good empty card but a blank detail pane beside it, no "Clear search" in the card, and "No Contacts matched" with a capital C; `/contacts?query=missing` | UXB-05 (job_c4544b060350) | Open; not a canonical reference. |
| A-22 | Support has two primaries for one action ("New conversation", "Ask for help"); Archived shows a search field over an empty list, with a clipped placeholder; `/account/tickets` | UXB-05 (job_c4544b060350) | Open; not a canonical reference. |
| A-23 | an "Import CSV or vCard" contacts action in the header; option cards misaligned by about 9 px and of uneven height; integrations named without saying what they do; `/settings/lead-sources` | UXB-06 (job_9ca5b9672d9a) | Open; not a canonical reference. |
| A-24 | adding contacts from an iPhone needs a key and a Shortcut; Android just opens the page; `/contacts/from-phone` | UXB-06 (job_9ca5b9672d9a) | Product-only / taste; no new rule. |
| A-25 | Save above the list it saves; "0 saved dates 1 Mix" with no separator; Title Case examples; `/settings/date-types` | UXB-04 (job_a5a8516f1138) | Open; not a canonical reference. |
| A-26 | info-box lines look like links but aren't; the repeater button says "Add record"; Save at the bottom of a long form, not sticky; `/settings/business` | UXB-04 (job_a5a8516f1138) | Open; not a canonical reference. |
| T-01 | the public header wraps to two rows at 768 px, wasting about 110 px; `/` | UXA-11 (job_ff793332fb37) | Open; not a canonical reference. |
| T-02 | app split panes at 768x1024 are about 350 px each; at 1024x768 the list holds about 190 px of text; the Today subtitle runs to three lines; `/contacts` | UXA-11 (job_ff793332fb37) | Open decision; keep the named JITM contract. |
| T-03 | the Journey map tells touch users to "hold Space and drag"; `/journey` | UXB-07 (job_ca566cea09be) | Open; not a canonical reference. |
| P-01 | search, filter, "Needs review · 0", an explainer and the Next block fill the first screen, and the list starts at the bottom edge. A tap on Review showed nothing for about a second, and the sheet opened after about 2 s with no pressed or loading state; `/jumps` | UXA-02 (job_0b1956750ccb) | Open; not a canonical reference. |
| P-02 | the review sheet focuses its message textarea on open, so a phone keyboard covers Open text, Copy and Mark sent; `Today review sheet` | UXA-03 (job_44db7c9b8cd7) | Open; not a canonical reference. |
| P-03 | Contacts search 15 px, sort select 13 px, demo select 14 px; iOS zooms on focus; `/contacts` | UXA-04 (job_6c23533490fc) | Resolved in code: 9f37e00; use the shared 16px floor. |
| P-04 | the phone hero is headline, a 5-line intro, two buttons and a 6-7-line note; the demo starts on screen two; `/` | UXA-06 (job_e5a211855a70) | Open; not a canonical reference. |
| P-05 | the phone menu has "Join" and Explore (Templates, Questions, Open Today, Contact support, Appearance) but no Sign in or Pricing; `public phone menu` | UXA-14 (job_5097b82f3da1) | Partial: Sign in/header reuse at 5bc117b; Pricing menu entry remains UXA-14, Join/Explore kept. |
| P-06 | sheets draw a drag handle with no swipe; `shared Sheet` | NAV-00 / NAV-01 (job_24403bb7c4ce / job_b1d64065ca93) | Open decision; keep the named JITM contract. |
| P-07 | Share, Preview and Edit fill row one, so the primary Start wraps alone; two stacked tab bars; library tabs collide at 328 px; `/mixes/[id]` | UXB-07 (job_ca566cea09be) | Open; not a canonical reference. |
| P-08 | very long pages: Journey list about 6,800 px, Mega-Mixes about 6,200, pricing about 2,900 for three plans; `/templates/journeys` | UXB-07 (job_ca566cea09be) | Open; not a canonical reference. |
| P-09 | Calendar week buttons wrap to two lines; "YOUR NEXT SEVEN DAYS" in uppercase; `/calendar` | UXB-07 (job_ca566cea09be) | Open; not a canonical reference. |
| P-10 | the sticky bar stacks full-width Cancel and Save; with the bottom nav, about 180 px is covered; the Message context row crams the label, the hint, Dictate and a privacy note; `/contacts/new` | UXA-17 (job_36fb00a64b10) | Partial: SaveBar geometry resolved at 338ae42 / ef7a02c; hiding navigation remains an owner decision. |
| V-01 | Today and Calendar stop at about 1,670 px and hug the left: about 1,170 px blank (38%) at 3,110 and about 620 at 2,560. Settings and Help center; Contacts and Mixes stretch: three wide-screen behaviours; `/jumps` | UXC-01 (job_1d216b599b31) | Open; not a canonical reference. |
| V-02 | from 2,200 px Contacts and Mixes center the main column while the details column pins far right: 500-600 px gaps at 3,110; `/contacts` | UXC-01 (job_1d216b599b31) | Open; not a canonical reference. |
| V-03 | Calendar connection fields 1,057 px wide at 1,440, 1,537 at 1,920 and 1,622 at 3,110; Add a new person Name 810 px; the message box 990 px; `/calendar` | UXC-02 (job_1412bc339852) | Open; not a canonical reference. |
| V-04 | Calendar reserves an empty 280 px contact column from 1,700 px; `/calendar` | UXC-01 (job_1d216b599b31) | Open; not a canonical reference. |
| V-05 | 844x390 sideways phone gets the tablet header plus bottom nav, 132 px (34% of the height); on Add contact about 175 px is left for the form; Today's two review columns get 258 px each. JITM-07 §2.26 already says bars scroll on heights of 480 px or less; `/contacts/new` | UXC-03 (job_04680345bf95) | Open; not a canonical reference. |
| V-06 | media queries pair "max-width 900" with "min-width 901" (also 1279/1280 and 767/768). At 110% zoom or display scaling, a 900.9 px window matches neither, and the full menu shows on a 900 px screen; `app shell` | UXC-04 (job_7d38cfe7c13b) | Open; not a canonical reference. |
| V-07 | long lines: Help 102-136 characters from 900 px, Calendar helper 104-113, home intro 92-101 at 767-901, legal 98 from 834; `/help` | UXB-01 (job_fe7761baec35) | Open; not a canonical reference. |
| V-08 | The home headline grows from 60px to 76px in a fixed 651px column and jumps from 66px to 46px across intermediate widths; `/` | UXA-06 (job_e5a211855a70) | Open; not a canonical reference. |
| V-09 | 1,100-1,199 px (includes the 1,194 tablet design): list rows about 1,000-1,100 px and the search box about 990 px; Journey rows 1,089; `/contacts` | UXC-02 (job_1412bc339852) | Open; not a canonical reference. |

Remaining validation belongs to UXD-01–UXD-04 and UXR-01 (job_471c4c2d6330). Closing a code finding requires its landed SHA and a scope-matched recheck; unknown or untested evidence remains explicit. Before a new task copies a listed page, consult its row and the home standard's §6.
