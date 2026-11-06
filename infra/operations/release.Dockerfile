# syntax=docker/dockerfile:1.7
# Named contexts contain a Git bundle/reviewed plan and the exact web build's static
# artifact, respectively. They must not contain .env files or credentials.
FROM node:22-bookworm AS operator
ARG POSTGRES_CLIENT_MAJOR=17
ARG RELEASE_CANDIDATE_SHA
ARG RELEASE_PREVIOUS_SHA
ARG RELEASE_APPROVED_MAIN_SHA
ENV TZ=UTC NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg git openssl awscli \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl --fail --silent --show-error https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-${POSTGRES_CLIENT_MAJOR} \
    && rm -rf /var/lib/apt/lists/*
COPY --from=release_source /catalog.bundle /tmp/catalog.bundle
COPY --from=release_source /smoke-plan.json /var/lib/jitm-release/smoke-plan.json
RUN git clone /tmp/catalog.bundle /app && rm /tmp/catalog.bundle
WORKDIR /app
RUN node -e 'for (const value of process.argv.slice(1)) if (!/^[a-f0-9]{40}$/.test(value)) process.exit(1)' "$RELEASE_CANDIDATE_SHA" "$RELEASE_PREVIOUS_SHA" "$RELEASE_APPROVED_MAIN_SHA" \
    && git checkout --detach "$RELEASE_CANDIDATE_SHA" \
    && git cat-file -e "$RELEASE_PREVIOUS_SHA^{commit}" \
    && git cat-file -e "$RELEASE_APPROVED_MAIN_SHA^{commit}" \
    && git remote remove origin
# Include development dependencies: tsx, Prisma, Playwright and axe are tools
# used by the reviewed jobs, not production web dependencies.
RUN npm ci --no-audit --no-fund && npm run db:generate \
    && node node_modules/playwright/cli.js install --with-deps chromium
COPY --from=release_web /candidate-sha /tmp/web-candidate-sha
COPY --from=release_web /static /app/.next/static
RUN test "$(cat /tmp/web-candidate-sha)" = "$RELEASE_CANDIDATE_SHA" \
    && rm /tmp/web-candidate-sha \
    && test -d .next/static \
    && for job in preflight backup migrate worker_gate postflight smoke cleanup final; do test -f "scripts/release/jobs/$job.mjs" || exit 1; done \
    && git diff --exit-code && test -z "$(git ls-files --others --exclude-standard)" \
    && mkdir -p /var/lib/jitm-release && chown -R node:node /app /opt/playwright /var/lib/jitm-release
ENV NODE_ENV=production JITM_RELEASE_JOB_EVIDENCE_DIR=/var/lib/jitm-release JITM_RELEASE_SMOKE_PLAN=/var/lib/jitm-release/smoke-plan.json
USER node
# A one-off job supplies its reviewed command. The idle service has no loop,
# scheduler, provider call or default database action.
CMD ["node", "-e", "process.stderr.write('Select a reviewed release job command.\\n');process.exit(1)"]
