<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Deployment destinations

All testing and staging deployments must publish to https://jump-in-the-mix-test.netlify.app/ (Netlify site ID `8fd20ccd-5c35-47e5-99ce-98e5670d52fe`). Use the explicit test site ID and publish to its stable URL; an unpublished deploy URL is not the staging handoff. https://jumpinthemix.com/ is the published customer site and is a separate deployment target. Verify site identity before deploying; the local Netlify link may point to the customer site.

## Production deployment (Render)

The customer site https://jumpinthemix.com runs on Render, not on the Netlify project: web service `jump-in-the-mix-web` (`srv-dagt93lbedkc738552o0`), background worker `jump-in-the-mix-worker` (`srv-dagta4uq1p3s738rnlr0`), a private PostgreSQL database with the restricted `jitm_runtime` role, and a daily backup cron, all defined in `render.yaml` with auto-deploy off. Releases deploy a specific commit id to the worker and then the web service, after a read-only preflight and a fresh backup, with migrations applied by a reviewed one-off job before the code that needs them. Every deployed commit carries an annotated tag `prod-<date>-<sha7>`; rollback is a redeploy of the previous tag (web first, then the worker) when the schema is unchanged. Each release has a record under `docs/` (for example [the 2026-09-24 audit release](docs/FULL_AUDIT_2026-09-24.md)) naming the commit, deploy ids, checks and rollback target. Production traffic reaches the app through Cloudflare (Render's edge), so client addresses come from the trusted-proxy walk in `src/lib/client-ip.ts`, extendable with `TRUSTED_PROXY_CIDRS`. The Netlify test site named in the deployment section above no longer answers; that staging rule is flagged for the owner's decision and is not changed here.

## Product design authority

All new or changed UI must follow [the supplied design export](docs/design/jump-in-the-mix-designs/index.html) and [the implementation guidelines](docs/design/DESIGN_GUIDELINES.md). Consult the relevant light/dark, phone/tablet/desktop screen before changing a page. Preserve the original export. The export takes precedence when derived guidelines describe a conflicting layout; document implementation assumptions separately. Build absent workspace structures, not just theme overrides, and compare screenshots before claiming design completion. Use the shared semantic tokens, Instrument Sans for interface text, Newsreader for personal wording, and the responsive patterns; fixed mockup dimensions and fictional records are not production requirements. Pages without a mockup inherit the same components and tokens. Check both themes, keyboard use, narrow-screen reflow, and the actual workflow. Raise design/function conflicts rather than inventing product behavior or copying sample metrics.

## Jump in the Mix copywriting and marketing

For homepage, profession-page, onboarding, copywriting or marketing strategy work, consult [the asset reference index](assets/README.md), the relevant ICP profiles and the supplied Joanna Wiebe guidance when available. The index records missing references; do not claim to have reviewed unavailable files. Treat the ICPs as fictional planning hypotheses, and verify product/access/pricing claims against current behavior.

Use [the homepage experience roadmap](docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md) for the implementation sequence and completion criteria. Preserve the original source documents and distinguish planned work, verified implementation and measured customer outcomes.
