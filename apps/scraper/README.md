# UIHarvest Scraper (Hackathon Reproducibility)

This folder contains the Gemini-powered scraper app used for the Devpost submission.

## Prerequisites

- Bun 1.x
- Node.js 20+
- Chromium browser binaries for Playwright

## Environment

Create local env file:

```bash
cp apps/scraper/.env.example apps/scraper/.env
```

Set at minimum:

- `GOOGLE_CLOUD_API_KEY=<your-key>`

Optional:

- `SITE_PASSWORD` (leave empty to disable login)
- `GOOGLE_CLOUD_PROJECT`
- `GCS_BUCKET`

## Install

From repo root:

```bash
bun install
bunx playwright install chromium
```

## Run locally

Start backend + web UI:

```bash
bun run --cwd apps/scraper dev
```

Expected URLs:

- API: `http://localhost:3333`
- Web UI: `http://localhost:5173`

## Reproducible testing instructions

Run these exactly from repo root.

### 1) Unit tests

```bash
bun run --cwd apps/scraper test
```

Expected result: test run exits with code `0`.

### 2) Type check

```bash
bun run --cwd apps/scraper typecheck
```

Expected result: TypeScript exits with code `0`.

### 3) API smoke test

With local server running:

```bash
curl -s http://localhost:3333/api/auth/status
```

Expected result: JSON response with `requiresPassword` and `authenticated` fields.

### 4) Page discovery smoke test

```bash
curl -s -X POST http://localhost:3333/api/extract/discover \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Expected result: JSON response containing a `pages` array.

### 5) Extraction job smoke test

```bash
curl -s -X POST http://localhost:3333/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Expected result: JSON response containing `jobId` and initial `status`.

Use returned `jobId`:

```bash
curl -s http://localhost:3333/api/extract/<jobId>/status
```

Expected result: JSON status transitions to `done` or `error` with `lastEvent`.

## Deploy to Google Cloud Run

```bash
cd apps/scraper
./deploy.sh
```

This uses Cloud Build + Cloud Run and config from `apps/scraper/.env`.
