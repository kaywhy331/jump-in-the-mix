---
id: JITM-03
title: Brand identity
status: active
version: 1.0.0
owner: Kevin
last_reviewed: 2026-09-28
applies_to: [brand, logo, icons, public-pages, app-shell, email, imagery]
supersedes: []
sources:
  - docs/BRAND_ASSETS.md
  - scripts/generate-brand-assets.mjs
  - assets/logo.png
  - src/components/Logo.tsx
  - src/app/manifest.ts
  - src/app/layout.tsx
  - src/lib/public-seo.ts
  - docs/CONVERSATION_STYLE.md
  - docs/design/jump-in-the-mix-designs/screens/BubbleKit.html
  - docs/design/jump-in-the-mix-designs/README.txt
  - docs/design/DESIGN_GUIDELINES.md
  - docs/HOMEPAGE_MEDIA_MANIFEST_2026-09-10.md
  - docs/HOMEPAGE_PROFESSION_PAGES_2026-09-11.md
  - docs/EMAIL_OPERATIONS.md
  - docs/BETA_READINESS_AUDIT_2026-09-26.md
  - docs/BETA_BLOCKERS_RELEASE_2026-09-26.md
  - docs/CANONICAL_PRODUCT_DECISIONS.md
  - assets/README.md
related_skills: [jitm-ui-change, jitm-copy, jitm-review]
related_workflows: [WF-02, WF-03, WF-05]
---

# JITM-03 — Brand identity

> How the Jump in the Mix name, logo, brand color, conversation-bubble motif, imagery, icons and sender identity are used.

## 1. Purpose and scope

This standard governs the brand name, the logo and its generated files, the wordmark, where the brand color appears, the meaning of the conversation bubble, imagery and media rights, app icons and favicons, and the identity that outgoing messages carry.

Neighboring topics live elsewhere:
- token values, type roles and sizes, bubble radii and shadows: JITM-06 §2;
- header and navigation layout: JITM-07 §2;
- tone of copy: JITM-04 §2; brand line and positioning: JITM-02 §2;
- email delivery configuration and releases: JITM-14 §2.

## 2. Rules

### Name

**2.1** The name is "Jump in the Mix": capital J and M, lowercase "in the". Customer copy, metadata and email MUST use the full name, never "Jump" alone, which is also an internal model name (JITM-05 §2). [SHIPPED 9439fd6 src/lib/public-seo.ts:4] [SHIPPED 9439fd6 src/app/manifest.ts:5] [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:50]

**2.2** "JITM" is only the short label under the installed app's icon and an internal abbreviation. It MUST NOT appear in customer copy. [SHIPPED 9439fd6 src/app/manifest.ts:6] [SHIPPED 9439fd6 src/app/layout.tsx:34]

**2.3** The name is the brand, not a noun for work: nothing the owner creates or receives is "a Jump in the Mix". Product objects use the terms in JITM-05 §2. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:50]

**2.4** The name invites action ("Jump") and suggests planned follow-ups kept together ("Mix"). Brand copy MUST NOT suggest that the product jumps into private conversations or sends on the owner's behalf. [SOURCE assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:74-79]

### Logo

**2.5** The approved logo is `assets/logo.png` (1000 × 1000, transparent background). It is black line art with no lettering: a rounded speech bubble with a thick outline, a white interior and a tail at the lower left, holding a figure leaping up and to the right, with three short motion strokes beneath. The original MUST be preserved and never cropped, traced, recolored or replaced. [SOURCE docs/BRAND_ASSETS.md:3,11] [SHIPPED 9439fd6 scripts/generate-brand-assets.mjs:9-10]

**2.6** Every derived file MUST be generated from `assets/logo.png` with `node scripts/generate-brand-assets.mjs`: the 168px header mark, the favicon, the Apple touch icon, the 192px, 512px and maskable app icons, and the social card. When an icon changes, bump the icon URL version (`?v=4`) and the service-worker cache name (`jitm-public-v4`) so browsers refresh. [SOURCE docs/BRAND_ASSETS.md:5,11] [SHIPPED 9439fd6 src/app/manifest.ts:16-18]

**2.7** The logo appears only through the shared `Logo` component: the mark (decorative, hidden from screen readers) beside the name set as live text, inside a home link named "Jump in the Mix home" that is at least 44px tall. Screens MUST NOT draw another logo or render the name as an image. [SHIPPED 9439fd6 src/components/Logo.tsx:7-9] [SHIPPED 9439fd6 src/styles/base.css:85] [SOURCE docs/BRAND_ASSETS.md:7]

**2.8** The mark has no dark variant and no backing tile. Its own white bubble keeps it legible on dark surfaces, so its background MUST stay transparent. [SHIPPED 9439fd6 src/styles/base.css:86] [SOURCE docs/HOMEPAGE_PROFESSION_PAGES_2026-09-11.md:89-91]

**2.9** The design export's line-bubble logo is a placeholder and MUST NOT ship. The violet "JM" monogram in `public/icon-source.svg` is not the approved mark either and MUST NOT be used. [SOURCE docs/design/jump-in-the-mix-designs/README.txt:15] [SOURCE docs/design/DESIGN_GUIDELINES.md:3] [PROPOSED]

### Wordmark, color and icons

**2.10** The wordmark is the name as live text in the interface typeface, bold, beside the mark; its sizes and weights come from JITM-06 §2 and its placement in headers from JITM-07 §2. [SHIPPED 9439fd6 src/components/Logo.tsx:9] [SHIPPED 9439fd6 src/styles/base.css:85]

**2.11** Violet is the brand color. It fills primary actions and Quick Add in both themes, sets the browser and installed-app theme color, and marks selection. It MUST come from the semantic tokens (values in JITM-06 §2); pages MUST NOT add their own brand hex values. The logo itself stays black and white. The ivory, green-black and citrus palette tried on 2026-09-10 was reverted and is not part of the brand. [SHIPPED 9439fd6 src/styles/design-tokens.css:16-20] [SHIPPED 9439fd6 src/app/manifest.ts:12] [SOURCE docs/design/DESIGN_GUIDELINES.md:13,15] [SOURCE docs/HOMEPAGE_PROFESSION_PAGES_2026-09-11.md:5-7]

**2.12** The favicon, Apple touch icon and 192px and 512px app icons are the full logo on a transparent background. The maskable icon places the logo inside the central safe area of a white square. All are produced by §2.6; interface icons are governed by JITM-06 §2. [SHIPPED 9439fd6 scripts/generate-brand-assets.mjs:13-18] [SHIPPED 9439fd6 src/app/layout.tsx:30-33]

### Conversation-bubble motif

**2.13** The bubble comes from the logo, and a bubble means someone is speaking:
- tail on the right: the owner talking to a client (drafts in Today and review, the homepage demo, Mix templates);
- tail on the left: the app talking to the owner (a missing detail in Quick Add, first-run tips, empty-state descriptions);
- a pop-up's tail points at what it is about (a person, a Beat, a calendar event);
- a confirmation toast is the app confirming what just happened.

[SOURCE docs/design/jump-in-the-mix-designs/screens/BubbleKit.html:21 (bubble captions)] [SOURCE docs/CONVERSATION_STYLE.md:3,10] [SHIPPED 9439fd6 src/components/EmptyState.tsx:19]

**2.14** Lists, cards, form fields, data rows and navigation MUST NOT get a tail. The one exception is the branded Quick Add bubble in the phone tab bar and tablet rail. [SOURCE docs/design/jump-in-the-mix-designs/screens/BubbleKit.html:21 (no-tail caption)] [SOURCE docs/design/DESIGN_GUIDELINES.md:76] [SHIPPED 9439fd6 src/styles/design-workspaces.css:141-142]

**2.15** A tail always uses its own bubble's fill; the Quick Add tail uses the violet fill. Bubble radius, tail geometry and shadows are design-system values (JITM-06 §2). [SHIPPED 9439fd6 src/styles/design-tokens.css:2] [SOURCE docs/design/DESIGN_GUIDELINES.md:16]

**2.16** The bubble marks speech, not decoration. New surfaces SHOULD NOT wrap content that nobody is saying in a bubble. [SOURCE docs/CONVERSATION_STYLE.md:10] [PROPOSED]

### Imagery and media

**2.17** No stock photos, generated people, customer media or video ship today; public scenes are live HTML and CSS. Before adding any photo or clip, extend the media manifest with its owner, license or release location, fictional or illustrative label, dimensions and crops, poster, alt text decision, compressed size and loading behavior. [SOURCE docs/HOMEPAGE_MEDIA_MANIFEST_2026-09-10.md:5,13]

**2.18** Images embedded in the ICP profiles are references with no license to republish. They MUST NOT be used in the product, on the site or in marketing. [SOURCE assets/README.md:17]

**2.19** Generated or staged media MUST NOT be presented as real customers or real use. Casting is varied and does not follow the profiles' demographics. Interface visuals use live HTML or real product captures with fictional data. [SOURCE assets/jump-in-the-mix-homepage-ui-ux-blueprint.md:296]

**2.20** Profession marks are simple line icons that show whom the product can serve. They are not customer logos and MUST NOT carry a usage claim such as "trusted by". [SHIPPED 9439fd6 src/components/ProfessionMarks.tsx:23] [SOURCE docs/HOMEPAGE_PROFESSION_PAGES_2026-09-11.md:83-85]

**2.21** The social sharing card is generated with the logo by §2.6. Its text and alt text MUST match the current approved positioning (JITM-02 §2); a wording change is regenerated, not hand-edited. [SHIPPED 9439fd6 scripts/generate-brand-assets.mjs:20-32] [SHIPPED 9439fd6 src/lib/public-seo.ts:15]

### Outgoing identity

**2.22** Follow-ups reach the owner's customers from the owner's own text and email apps, under the owner's name and number. During the beta the product never sends to customers in its own name. [SHIPPED 9439fd6 src/app/faq/page.tsx:25,27] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:6]

**2.23** Automatic customer email MUST stay off until Kevin approves an identity that sends as the business. If switched on today, the code would send as the platform with the platform's reply address. The proposed identity is "{Business} via Jump in the Mix" with Reply-To set to the owner and a footer naming the business; it is not built. [SHIPPED 9439fd6 src/lib/automatic-delivery.ts:20-24] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:48,379] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:6]

**2.24** Platform email (waitlist confirmation, access invitations, account and support email) is sent from the verified `EMAIL_FROM` with a monitored `EMAIL_REPLY_TO`. The sender name SHOULD be "Jump in the Mix", as in the repository example. The values live in the host's settings, never in the repository. [SOURCE docs/EMAIL_OPERATIONS.md:10] [SHIPPED 9439fd6 .env.example:116-117] [SHIPPED 9439fd6 render.yaml:58-61]

**2.25** Member invitations go out from the member's own app, under the member's name, with the default subject "{{Sender Name}} invited you to Jump in the Mix" (wording: JITM-04 §2.9; flow: JITM-09 §2.18). [SHIPPED 9439fd6 src/lib/system-mix.ts:5-6] [SHIPPED 9439fd6 src/app/(app)/mixes/system/page.tsx:54]

**2.26** Hosted lead forms lead with the owner's business name and carry a small "Powered by Jump in the Mix" credit. [SHIPPED 9439fd6 src/app/lead/[connectionId]/page.tsx:11]

**2.27** Public addresses SHOULD use the jumpinthemix.com domain, as the site and the security contact do. [SHIPPED 9439fd6 src/app/security/page.tsx:8,16] [PROPOSED]

## 3. Canonical implementations

- `assets/logo.png`: the approved source artwork; never edit it.
- `scripts/generate-brand-assets.mjs`: produces every derived logo, icon and the social card.
- `src/components/Logo.tsx`: the only way to show the logo and the name together.
- `src/app/manifest.ts` and `src/app/layout.tsx`: name, short name, icons and theme color.
- `src/components/EmptyState.tsx`: the app-to-owner bubble in an empty state.
- `docs/design/jump-in-the-mix-designs/screens/BubbleKit.html`: the bubble roles.
- `docs/HOMEPAGE_MEDIA_MANIFEST_2026-09-10.md`: the media-rights manifest to extend.

## 4. Do / Don't

- **Do** use `<Logo />` in a new public or sign-in page header.
- **Do** put a draft in a right-tailed bubble and an empty-state hint in a left-tailed one.
- **Don't** write "JITM" or "Jump" as the product name in customer copy.
- **Don't** add a white tile behind the mark for dark mode.
- **Don't** give a list row, form field or navigation link a tail.
- **Don't** reuse an image from an ICP profile or present a staged photo as a customer.

## 5. Verification

- `git diff --stat assets/logo.png` is empty; derived files change only together with a run of `node scripts/generate-brand-assets.mjs` and a version bump.
- `grep -rn "icon-source.svg" src` finds only the proxy allowlist entry.
- Screenshots of the header in both themes show the mark with a transparent background and the live-text name (JITM-12 §2).
- Any new image has a media-manifest row before it merges.

## 6. Open decisions and known deviations

Open questions for Kevin:
- Should `public/icon-source.svg` be deleted and dropped from the proxy allowlist (`src/proxy.ts:16`)?
- Which sender identity should automatic customer email use when it returns (§2.23)?
- What are the production `EMAIL_FROM` and `EMAIL_REPLY_TO` values? The beta audit could not read them (`docs/BETA_READINESS_AUDIT_2026-09-26.md:367`).
- The `security@jumpinthemix.com` alias is still an open owner step (`docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:66`).

Known deviations at 9439fd6:
- The social card and its alt text carry the 2026-09-07 positioning ("Good relationships have a rhythm.", "Business · Personal · Your network") (`scripts/generate-brand-assets.mjs:27-32`; `src/lib/public-seo.ts:15`).
- `docs/BRAND_ASSETS.md:7` still describes a white backing behind the mark; it was removed on 2026-09-11.
- The default Web Push subject uses the jumpinthemix.app domain (`src/lib/env.ts:94`; `.env.example:121`).
- The staff invitation preview shortens the name to "Jump" (`src/components/SystemMixPreview.tsx:14`).

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
