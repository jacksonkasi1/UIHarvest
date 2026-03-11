# ── Stage 1: Build scraper web frontend ──────────────────────
FROM oven/bun:1 AS web-build
WORKDIR /app/web

COPY apps/scraper/web/package.json ./
RUN bun install

COPY apps/scraper/web/ ./
RUN bun run build

# ── Stage 2: Runtime ─────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

RUN curl -fsSL https://bun.sh/install | bash && \
    ln -sf /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -sf /root/.bun/bin/bunx /usr/local/bin/bunx

WORKDIR /app

# Copy all workspace package.json files (required for bun workspace resolution)
COPY package.json bun.lock ./
COPY packages/auth/package.json    ./packages/auth/package.json
COPY packages/db/package.json      ./packages/db/package.json
COPY packages/types/package.json   ./packages/types/package.json
COPY packages/ui/package.json      ./packages/ui/package.json
COPY apps/scraper/package.json     ./apps/scraper/package.json
COPY apps/server/package.json      ./apps/server/package.json
COPY apps/web/package.json         ./apps/web/package.json
COPY apps/scraper/web/package.json ./apps/scraper/web/package.json

RUN bun install --production

# Copy workspace package sources
COPY packages/auth/  ./packages/auth/
COPY packages/db/    ./packages/db/
COPY packages/types/ ./packages/types/

COPY apps/scraper/src/   ./apps/scraper/src/
COPY apps/scraper/.env*  ./apps/scraper/

COPY --from=web-build /app/web/dist ./apps/scraper/web/dist

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8080/api/auth/status || exit 1

CMD ["bun", "run", "apps/scraper/src/serve.ts"]
