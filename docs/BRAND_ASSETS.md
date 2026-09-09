# Jump in the Mix logo

The approved source artwork is `assets/logo.png`. The shared `Logo` component pairs this mark with the product name on public pages, account entry screens, and app navigation.

Run `node scripts/generate-brand-assets.mjs` after replacing the approved source. It prepares the small header image, favicon, Apple touch icon, standard and maskable app icons, and social sharing card. Exports preserve the complete artwork and its proportions. The maskable icon leaves extra room around the mark for platform cropping.

The header uses a 168px-square PNG at 42px on desktop and 34px on narrow public headers. A white backing keeps the black artwork legible in either theme. Its home link retains an accessible name and a minimum 44px height.

Registration shows the logo in the form header on mobile and in the introductory panel on desktop, keeping one visible brand link at each size.

Browser and manifest icon URLs use version 4, and service-worker public assets use `jitm-public-v4`. Increment these when changing icons again so returning browsers can refresh their cached artwork. The supplied original remains unchanged.

September 7, 2026 release receipts are in `.artifacts/logo-2026-09-07/`.

Test-site release: `6a9f2981c7c197a98bc5cb45`, published to https://jump-in-the-mix-test.netlify.app on September 7, 2026. The production build and seven service-worker tests passed. Preview checks passed for 24 page/width/theme combinations, seven image asset matches, and homepage layout, signup navigation, FAQ, and accessibility. The rendered CSS and JavaScript matched the compiled build.

After publication, the live test site passed the same 24 branding layout checks; all seven images and 12 rendered CSS/JavaScript assets matched the release. The manifest and service-worker cache version also matched.
