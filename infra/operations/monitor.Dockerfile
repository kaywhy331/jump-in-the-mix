# syntax=docker/dockerfile:1.7
FROM node:22-alpine3.23
WORKDIR /app
RUN apk add --no-cache aws-cli openssl libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run db:generate
ENV NODE_ENV=production
# A newly attached Render disk is root-owned. Prepare only its private state
# directory, then drop privileges for the continuously supervised process.
RUN apk add --no-cache su-exec
CMD ["sh", "-c", "mkdir -p /var/data/jitm-operations && chown node:node /var/data/jitm-operations && chmod 700 /var/data/jitm-operations && exec su-exec node npm run ops:watch"]
