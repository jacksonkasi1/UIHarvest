# Deployment & Local Run Guide

## Prerequisites

- [Bun](https://bun.sh/) (v1.1+)
- [Docker](https://docs.docker.com/get-docker/) (for containerized runs)
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (for GCR deployment)
- A [Gemini API key](https://aistudio.google.com/app/apikey) (optional — base extraction works without it)

---

## 1. Local Development

```bash
# Install dependencies
bun install
bunx playwright install chromium

# Create .env (see .env.example)
cp .env.example .env
# Edit .env → add your GOOGLE_CLOUD_API_KEY

# Run the web app (frontend + backend, live reload)
bun run dev
# → Opens at http://localhost:5173 (frontend) + API at http://localhost:3333

# Or run CLI extraction directly
bun run extract https://stripe.com
```

---

## 2. Production Build (Local)

```bash
# Build the frontend and start the server
bun run start:server
# → http://localhost:3333
```

This compiles the Vite frontend into `web/dist/` and serves everything from a single Express server.

---

## 3. Docker

```bash
# Build the image
bun run docker:build
# or: docker build -t uiharvest .

# Run it
bun run docker:run
# or: docker run -p 8080:8080 --env-file .env uiharvest

# → http://localhost:8080
```

---

## 4. Deploy to Google Cloud Run

### One Command

```bash
./deploy.sh
```

That's it. The script auto-reads your `.env` file for all config.

### What `.env` Controls

```env
# Required
GOOGLE_CLOUD_API_KEY=your_key_here

# Optional
SITE_PASSWORD=your_password      # Password-protect the web UI
SERVICE_NAME=uiharvest            # Cloud Run service name
GCP_REGION=asia-south1            # Deployment region
```

### Manual Deploy (if you prefer)

```bash
gcloud run deploy uiharvest \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --memory 8Gi \
  --cpu 4 \
  --timeout 3600 \
  --session-affinity \
  --set-env-vars "GOOGLE_CLOUD_API_KEY=xxx,SITE_PASSWORD=yyy"
```

### Get Your Deployed URL

```bash
gcloud run services describe uiharvest \
  --region asia-south1 \
  --format 'value(status.url)'
```

---

## 5. Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLOUD_API_KEY` | Yes | — | Gemini API key for AI features |
| `SITE_PASSWORD` | No | — | Password to protect the web UI |
| `SERVICE_NAME` | No | `uiharvest` | Cloud Run service name |
| `GCP_REGION` | No | `asia-south1` | Cloud Run deployment region |
| `GEMINI_MODEL_VISION` | No | `gemini-2.0-flash` | Model for vision pass |
| `GEMINI_MODEL_ANALYSIS` | No | `gemini-2.0-flash` | Model for analysis |
| `GEMINI_CONCURRENCY` | No | `10` | Max parallel Gemini calls |
| `PORT` | No | `3333` (dev) / `8080` (Docker) | Server port |

---

## npm Scripts Reference

| Script | What It Does |
|--------|-------------|
| `bun run dev` | Start frontend (Vite) + backend (Express) with live reload |
| `bun run extract <url>` | CLI extraction |
| `bun run start:server` | Build frontend + start production server |
| `bun run build` | Build frontend only |
| `bun run docker:build` | Build Docker image |
| `bun run docker:run` | Run Docker container with `.env` |
| `bun run deploy` | Deploy to Google Cloud Run |
