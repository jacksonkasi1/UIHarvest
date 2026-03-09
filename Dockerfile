# ── Stage 1: Generate WebContainer base snapshot ─────────────
FROM oven/bun:1 AS snapshot-builder
WORKDIR /app

# Need Node.js + npm for the snapshot builder (uses npm install internally)
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY scripts/ ./scripts/
RUN bun run scripts/generate-base-snapshot.ts

# ── Stage 2: Build web frontend ──────────────────────────────
FROM oven/bun:1 AS web-build
WORKDIR /app/web
ARG CACHEBUST=1
COPY web/package.json web/bun.lock* ./
RUN bun install --frozen-lockfile
COPY web/ ./
# Copy the generated snapshot into web/public before building
COPY --from=snapshot-builder /app/web/public/base-snapshot.bin ./public/base-snapshot.bin
COPY --from=snapshot-builder /app/web/public/snapshot-version.json ./public/snapshot-version.json
RUN bun run build

# ── Stage 3: Runtime ─────────────────────────────────────────
FROM oven/bun:1

# Install Playwright Chromium dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 \
    libnss3 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libxss1 xdg-utils && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Install Playwright browser
RUN bunx playwright install chromium

# Copy source code
COPY src/ ./src/
COPY .env* ./

# Copy compiled web frontend
COPY --from=web-build /app/web/dist ./web/dist

# Runtime configuration
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8080/api/auth/status || exit 1

CMD ["bun", "run", "src/serve.ts"]
