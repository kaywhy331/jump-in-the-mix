# Public repository hygiene review

Review scope: the tracked release-candidate tree, all fetched Git history, all fetched remote branches, and tags through `v0.1.0-rc.1`.

## Secret scan

Gitleaks `v8.30.1` ran with redacted output over the tracked tree and 1,046 commits reachable from all fetched refs. Two historical detections pointed to the same fixed TOTP unit-test fixture. The value is synthetic test input, not a credential; the two exact fingerprints are documented in `.gitleaksignore`. No credible committed API key, access token, provider credential, database credential, private key, backup key, or Docker credential was identified.

A raw working-directory scan also identified ignored local `.env`, generated build output, and local backup artifacts. Those files were not tracked and are deliberately excluded from Git and Docker build contexts. Local runtime data remains sensitive and must not be published.

History path review found no tracked environment file other than `.env.example`, no database dump, no encrypted backup archive, no private key file, and no committed absolute home-directory path.

## Personal-data scan

Repository-content email matches were limited to reserved example domains and the `.local` test domain. Personal-domain addresses appeared only in Git author/committer metadata, not application fixtures or Contact data. Existing public commit metadata would require a separately authorized history rewrite to change; future contributors should use a GitHub no-reply address if they do not want an email exposed in commit metadata.

Phone-like history matches were confined to documentation examples, form placeholders, seeded demo data, and end-to-end fixtures. Most used the reserved 555 range; the remaining unique values occurred only in those same explicit example/test locations. No private Contact dataset was identified.

## Dependency review

The release baseline exposed advisories in Next.js, Vitest, Prisma tooling, and transitive packages. Direct packages were advanced to the smallest current compatible releases, and targeted `postcss` and `sharp` overrides were added. `npm run security:audit` now reports zero production dependency vulnerabilities. CI repeats the high-severity production audit.

## Licensing

No license file exists. No license was selected during this review. The repository owner must choose the intended grant before inviting redistribution; README lists concise MIT, Apache-2.0, and proprietary options.

## Ongoing controls

The Security workflow runs a redacted full-history Gitleaks scan and a production dependency audit on pull requests, pushes to `main`, a weekly schedule, and manual dispatch. `.gitignore` and `.dockerignore` exclude environment files, backups, database dumps, browser artifacts, screenshots, traces, coverage, local logs, editor files, and operating-system metadata.
