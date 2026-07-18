# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl openssl libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM dependencies AS source
COPY . .
RUN npm run db:generate

FROM source AS tools
CMD ["npm", "run", "db:setup"]

FROM source AS operations
RUN apk add --no-cache postgresql-client
CMD ["npm", "run", "doctor"]

FROM source AS development
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM source AS worker
CMD ["npm", "run", "worker"]

FROM source AS builder
ENV NODE_ENV=production
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
RUN apk add --no-cache curl libc6-compat
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
