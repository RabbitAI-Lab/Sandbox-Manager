# Build stage
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/backend/tsconfig.json apps/backend/tsconfig.json
COPY apps/backend/src apps/backend/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sandbox-platform/backend build

# Runtime stage
FROM node:22-alpine
WORKDIR /app

COPY apps/backend/package.json apps/backend/
COPY --from=builder /app/apps/backend/dist apps/backend/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules

EXPOSE 3000
CMD ["node", "apps/backend/dist/index.js"]
