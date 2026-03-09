# ── Stage 1: Build web frontend ──────────────────────────────
FROM oven/bun:1 AS web-build
WORKDIR /app/web
COPY web/package.json web/bun.lock* ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN echo "Force rebuild 2" && bun run build

# ── Stage 2: Runtime ─────────────────────────────────────────
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
