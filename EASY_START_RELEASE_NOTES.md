# Easy-Start Release Notes

This delivery is optimized for a nontechnical local reviewer.

## Installation improvements

- Added one-click launchers for Windows and macOS.
- Added a Linux/macOS shell launcher.
- Reduced the local prerequisite list to Docker Desktop/Engine only.
- Added automatic `.env` creation, encryption-key generation, and database-password generation.
- Added automatic PostgreSQL creation, schema setup, seeding, and health checks.
- Added a first-run browser redirect and guided-demo button.
- Added persistent stop behavior and a clearly labeled destructive reset flow.
- Added clickable diagnostics for Windows and macOS.
- Added fast repeat starts that reuse installed local images; `--rebuild` remains available after source changes.
- Kept PostgreSQL private inside Docker so a host database or port 5432 conflict is not required.

## First-user-journey improvements

- Added a one-screen onboarding flow with sensible defaults and a skip option.
- Automatically creates an editable starter Mix during onboarding.
- Defaults new Important Dates to Follow-up and can assign the matching starter Mix automatically.
- Adds an actionable first-win checklist to the dashboard.
- Includes a safe Plus-tier demo workspace with contacts, Important Dates, a Mix, and generated Jumps.
- Opens the AI Mix Wizard from the most relevant primary action for eligible plans.

## Validation completed before repository upload

- Prisma schema validation passed.
- Source syntax and local-import validation passed.
- TypeScript semantic checking passed.
- Four unit tests passed.
- Next.js production build passed.
- Shell launcher syntax and Docker Compose YAML parsing passed.

The repository bootstraps from `package.json` with `npm install`. After the first successful local install, commit the generated `package-lock.json` so subsequent builds can use `npm ci` for fully reproducible dependency installation.

Docker itself was unavailable in the artifact environment, so the final Compose boot must still be smoke-tested on a Docker-enabled Windows, macOS, or Linux computer using `docs/LOCAL_TESTING.md`.

## Windows launcher reliability update

- Prevents the raw PowerShell `NativeCommandError` produced when Docker Desktop is installed but stopped.
- Attempts to start Docker Desktop automatically.
- Waits up to three minutes for the Linux engine.
- Detects Windows-container mode and attempts to switch to Linux containers.
- Adds WSL-focused diagnostics and a dedicated Windows recovery guide.
