FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock* ../../bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY src/ ./src/
COPY .env* ./

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/api/auth/status || exit 1

CMD ["bun", "run", "src/index.ts"]
