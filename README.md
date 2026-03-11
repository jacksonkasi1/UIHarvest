# UIHarvest 🌾

UIHarvest is a monorepo for scraping a live website and turning it into a structured design output (tokens, components, screenshots, assets, and AI design memory).

If you only want to run and test quickly, use `apps/scraper`.

## 📦 What Is In This Repo

- `apps/scraper` - main app for URL input, extraction, and output UI
- `apps/server` - backend for studio/chat/project APIs
- `apps/web` - studio frontend
- `packages/*` - shared auth/db/types/ui packages

## 🚀 Quick Start (Scraper)

### 1) Prerequisites

- Bun 1.x
- Node.js 20+
- Chromium binaries for Playwright

### 2) Install

From repo root:

```bash
bun install
bunx playwright install chromium
```

### 3) Configure environment

```bash
cp apps/scraper/.env.example apps/scraper/.env
```

Minimum required in `apps/scraper/.env`:

```bash
GOOGLE_CLOUD_API_KEY=your_key_here
```

Optional:

- `SITE_PASSWORD`
- `GOOGLE_CLOUD_PROJECT`
- `GCS_BUCKET`

### 4) Run

```bash
bun run --cwd apps/scraper dev
```

Open:

- UI: `http://localhost:5173`
- API: `http://localhost:3333`

In the UI:

1. Paste a website URL.
2. Start extraction.
3. Watch progress.
4. Review the final extracted output in the app.

## 🧾 Output You Get

After a successful run, UIHarvest gives you:

- Design tokens (colors, typography, spacing, radii, shadows)
- Component extraction with screenshots and metadata
- Downloaded assets (images, SVGs, fonts)
- Structured JSON output for programmatic use
- AI design memory files (when `GOOGLE_CLOUD_API_KEY` is set)

Typical output is saved under the scraper output folder and shown in the local UI while the job runs.

## ✅ Why This Is Useful

- Faster UI reverse-engineering from any live website
- Better handoff for developers and AI code generation
- Reusable design tokens for new projects
- Visual references (screenshots/assets) for accurate rebuilds
- Repeatable extraction flow for testing and benchmarking

## 🧪 Quick Test

From repo root:

```bash
bun run --cwd apps/scraper test
bun run --cwd apps/scraper typecheck
```

Manual smoke test:

1. Run `bun run --cwd apps/scraper dev`
2. Open `http://localhost:5173`
3. Enter `https://example.com`
4. Confirm extraction starts, progresses, and shows a final result

## 🛠️ Monorepo Commands

From repo root:

```bash
bun run dev
bun run build
bun run typecheck
```

## ☁️ Optional: Deploy Scraper To Cloud Run

```bash
gcloud auth login
gcloud config set project <your-project-id>
cd apps/scraper
./deploy.sh
```

## 📝 Notes

- `apps/scraper/README.md` contains the full reproducibility guide used for submission.
- Without `GOOGLE_CLOUD_API_KEY`, AI phases are skipped.

## 📄 License

MIT
