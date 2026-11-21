# Homepage media manifest

Initial still-first release · September 10, 2026

The redesigned experience uses CSS compositions with live HTML text for all profession scenes. No stock, generated-person, customer, or video asset is shipped in the new experience, so there are no additional usage rights or model releases to record. Each composition reserves its dimensions, survives blocked imagery, and is marked illustrative rather than customer proof.

| Asset | Purpose | Rights/source | Alternative treatment | Loading |
| --- | --- | --- | --- | --- |
| `/brand-logo.png` | Existing logo rendered by `Logo` | Existing project brand asset | Visible “Jump in the Mix” text accompanies it | Existing eager header behavior |
| `/relationship-preview.png` | Existing social share image | Existing project asset | Page title and description provide textual context | Metadata fetch only |
| CSS hero/work/payoff compositions | Six landing-route scene surfaces | Original code; no external media | Situation, profession and context are live HTML | No network request |
| `/product-shots/today-desktop-{light,dark}.webp` (1920 × 1364, about 83 KB) | How it works: Today on a computer with the review docked beside the list, shown from 768px | Real product capture by `scripts/capture-product-shots.mjs` from the fictional demo seed (`prisma/seed.ts`); project-owned, no third-party rights | Alt text names what the screen shows and that the people are fictional; figure caption; a visible note says the screens use a sample workspace with fictional people | `loading="lazy"`, below the hero; reserved by width/height; only the visible theme and size are requested |
| `/product-shots/today-phone-{light,dark}.webp` (600 × 1298, about 41 KB) | How it works: Today on a phone, shown below 768px | As above | As above | As above |
| `/product-shots/review-phone-{light,dark}.webp` (600 × 1298, about 31 KB) | How it works: the review sheet on a phone, at every width | As above | As above | As above |

Product captures are illustrative, not customer proof: regenerate them with `node scripts/capture-product-shots.mjs` (instructions in the script) when Today or the review changes, and keep fictional data only (JITM-03 §2.19).

Before adding any clip or photograph, extend this manifest with asset owner, license/release location, scenario, fictional/illustrative label, native dimensions, desktop/mobile crops, poster, alternative text decision, compressed size and loading behavior. Hero LCP media requires an optimized prioritized poster. Inactive scenario video must use deferred loading; automatically moving content requires pause/play and reduced-motion behavior.
