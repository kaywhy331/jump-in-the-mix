# syntax=docker/dockerfile:1.7
FROM node:22-alpine3.23
WORKDIR /app
RUN apk add --no-cache postgresql16-client aws-cli openssl libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --no-audit --no-fund
COPY scripts ./scripts
COPY src/lib/recovery-hold-query.mjs ./src/lib/recovery-hold-query.mjs
ENV NODE_ENV=production
ENV TZ=UTC
USER node
CMD ["node", "scripts/backup-to-s3.mjs"]
