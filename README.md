# UI Harvest 🌾

UI Harvest is a powerful CLI tool powered by Playwright that automatically extracts a **complete design system** from any live website. It crawls the page, analyzes the DOM and computed styles, takes screenshots, downloads assets, and generates a structured JSON representation of the site's design language — alongside a beautiful local web viewer to explore the extracted data.

Optionally, it runs a **Gemini-powered AI pipeline** (Phase 1.5 Vision + Phase 2 Design Memory) that produces a `design-memory/` folder of structured markdown files that any LLM can consume to rebuild or remix the UI.

## 🚀 Features

- **🎨 Design Tokens:** Automatically extracts Colors, Gradients, Typography (font-families, weights, sizes), Spacing scales, Border Radii, Shadows, Borders, and Transitions.
- **🔧 CSS Variables & Fonts:** Extracts CSS Custom Properties (`var(--...)`) and intercepts actual font files (`.woff2`, `.ttf`, etc.) from the network.
- **🧩 Components:** Intelligently detects and categorizes UI components including Buttons, Cards, Links, Icons, Badges, Headings, Text blocks, Tabs, Accordions, Testimonials, CTA Banners, Logos, and Mega-Footers.
- **👆 Interactions (Hover States):** Uses Playwright to autonomously hover over interactive elements, capturing visual state changes (CSS property diffs) and before/after screenshots.
- **🔄 Repeated Patterns:** Identifies repeated structural patterns (like feature grids) and generates generic HTML templates with placeholders.
- **📐 Layout System:** Extracts container max-widths and identifies high-level page sections (Headers, Footers, Main content areas).
- **📦 Assets & Media:** Downloads images, captures and deduplicates SVGs (with reuse counts), and detects videos and pseudo-elements (`::before` / `::after`).
- **👁️ AI Vision Pass (Phase 1.5):** Uses Gemini Vision to scan the page across multiple viewports, extracting high-quality components with visual understanding.
- **🧠 Design Memory (Phase 2):** Runs an analyze → interpret → render pipeline (powered by Gemini) that produces 14 structured markdown files under `design-memory/` — ready for LLMs to rebuild or remix the UI.
- **🖥️ Explorer UI:** Ships with a standalone viewer interface to browse the extracted tokens, components, patterns, and assets interactively.

## 📦 Installation

This project uses [Bun](https://bun.sh/).

```bash
git clone https://github.com/jacksonkasi1/UIHarvest.git
cd UIHarvest
bun install
bunx playwright install chromium
```

## ⚙️ Environment Setup

Create a `.env` file in the project root:

```bash
cp .env.example .env
# Edit .env → add your GOOGLE_CLOUD_API_KEY
```

Without this key the AI Vision pass (Phase 1.5) and Design Memory (Phase 2) are automatically skipped. The base scraping and extraction always run regardless.

## ✅ Reproducible Testing (Devpost)

Reproducible testing instructions for the submitted scraper app are documented in:

- `apps/scraper/README.md`

## 🌐 Web App

UIHarvest also runs as a deployed web application — enter a URL in the browser and get the full extraction.

```bash
# Development (live reload)
bun run dev

# Production build + serve
bun run start:server
```

### 🚀 Deploy to Google Cloud Run

```bash
./deploy.sh
```

All config is read from `.env` — API key, password, region, service name. See **[DEPLOY.md](./DEPLOY.md)** for the full guide (Docker, GCR, env vars reference).

## 🛠️ Usage

### Basic extraction

```bash
bun run extract <url>
```

**Example:**
```bash
bun run extract https://stripe.com
```

The tool will:
1. Launch a headless Playwright browser.
2. Scroll the page to trigger lazy loading and intercept font files.
3. Dismiss common cookie banners and modal overlays.
4. Extract all tokens, components, assets, and hover states.
5. Run the AI Vision pass (Phase 1.5) if `GOOGLE_CLOUD_API_KEY` is set.
6. Prompt whether to run Design Memory generation (Phase 2).
7. Save output to `./output/` (JSON, screenshots, assets, fonts, and `design-memory/`).
8. Start a local server at `http://localhost:3333` and open the Explorer UI.

### CLI Flags

| Flag | Description |
|---|---|
| `--force` / `-f` | Clean the `output/` folder before running (fresh start) |
| `--resume` | Skip scraping — load existing `output/design-system.json` checkpoint and continue from there |
| `--memory` | Always run Phase 2 Design Memory generation without prompting |
| `--no-memory` | Skip Phase 2 Design Memory generation unconditionally |
| `--no-serve` | Skip starting the local web server after extraction |

### Re-run only the memory phase on existing scraped data

If you already have a scrape checkpoint and just want to (re-)generate the design memory:

```bash
bun run extract <url> --resume --memory
```

**Example:**
```bash
bun run extract https://stripe.com --resume --memory
```

This skips the Playwright scrape entirely and runs only the Gemini analyze → interpret → render pipeline against the existing `output/design-system.json`.

## 📁 Output Structure

All extracted data is saved in the `output/` directory:

```
output/
├── design-system.json          # Complete structured JSON dump
├── screenshots/                # Full-page, section, component, and hover screenshots
├── assets/                     # Downloaded images and SVG files
├── fonts/                      # Intercepted font files
└── design-memory/             # AI-generated design memory (Phase 2)
    ├── INSTRUCTIONS.md         # How to use the memory files
    ├── principles.md           # Core design principles
    ├── style.md                # Color, typography, spacing tokens
    ├── layout.md               # Grid, breakpoints, container widths
    ├── components.md           # Component catalogue with usage notes
    ├── motion.md               # Animation and transition patterns
    ├── qa.md                   # QA checklist for rebuilds
    ├── reference.md            # Quick-reference token tables
    └── skills/
        ├── design-system.md
        ├── color-palette.md
        ├── typography.md
        ├── component-patterns.md
        ├── layout-structure.md
        └── motion-guidelines.md
```

## 🧠 Design Memory Pipeline

When Phase 2 runs, it executes three stages against the scraped `rawData`:

1. **Analyze** — Maps UIHarvest tokens directly to a `DesignIR` intermediate representation (colors, typography, spacing, radii, elevation, layout, components, motion, breakpoints).
2. **Interpret** — Sends the IR to Gemini to produce semantic tokens (color roles, type scale), component narratives, and design doctrine. Includes a Zod-validated repair loop.
3. **Render** — Writes 14 markdown files to `output/design-memory/` that any LLM can load to rebuild or remix the UI.

## 📝 License

MIT License
