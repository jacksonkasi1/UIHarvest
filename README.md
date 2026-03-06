# UI Harvest 🌾

UI Harvest is a powerful CLI tool powered by Playwright that automatically extracts a **complete design system** from any live website. It crawls the page, analyzes the DOM and computed styles, takes screenshots, downloads assets, and generates a structured JSON representation of the site's design language, alongside a beautiful local web viewer to explore the extracted data.

## 🚀 Features

- **🎨 Design Tokens:** Automatically extracts Colors, Gradients, Typography (font-families, weights, sizes), Spacing scales, Border Radii, Shadows, Borders, and Transitions.
- **🔧 CSS Variables & Fonts:** Extracts CSS Custom Properties (`var(--...)`) and intercepts actual font files (`.woff2`, `.ttf`, etc.) from the network.
- **🧩 Components:** Intelligently detects and categorizes UI components including Buttons, Cards, Links, Icons, Badges, Headings, Text blocks, Tabs, Accordions, Testimonials, CTA Banners, Logos, and Mega-Footers.
- **👆 Interactions (Hover States):** Uses Playwright to autonomously hover over interactive elements, capturing visual state changes (CSS property diffs) and before/after screenshots.
- **🔄 Repeated Patterns:** Identifies repeated structural patterns (like feature grids) and generates generic HTML templates with placeholders.
- **📐 Layout System:** Extracts container max-widths and identifies high-level page sections (Headers, Footers, Main content areas).
- **📦 Assets & Media:** Downloads images, captures and deduplicates SVGs (with reuse counts), and detects videos and pseudo-elements (`::before` / `::after`).
- **🖥️ Explorer UI:** Ships with a standalone viewer interface to browse the extracted tokens, components, patterns, and assets interactively.

## 📦 Installation

This project uses [Bun](https://bun.sh/).

```bash
git clone https://github.com/yourusername/UIHarvest.git
cd UIHarvest
bun install
```

## 🛠️ Usage

To extract a design system from a website, run:

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
3. Dismiss common cookie banners.
4. Extract all tokens, components, assets, and hover states.
5. Save the output to the `./output` directory (including downloaded images, fonts, and screenshots).
6. Automatically start a local server (`http://localhost:3333`) and open the Explorer UI to view the results.

## 📁 Output Structure

All extracted data is saved in the `output/` directory:

- `design-system.json`: The complete structured JSON dump of the design system.
- `screenshots/`: Full-page, section, component, and hover state screenshots.
- `assets/`: Downloaded images and SVG files.
- `fonts/`: Intercepted font files.

## 📝 License

MIT License
