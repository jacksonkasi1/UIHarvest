import "dotenv/config";

// ** import core packages
import { chromium, Page } from "playwright";

// ** import utils
import path from "path";
import fs from "fs";
import os from "os";

// ** import apis
import { extractDesignSystem } from "./extractor.js";
import { AgentDriver } from "./agent-driver.js";
import { GeminiClient } from "./gemini-client.js";
import { runVisionLoop } from "./vision-loop.js";
import { MemoryGenerator } from "./memory/generator.js";

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

export interface PageInfo {
    url: string;
    title: string;
    path: string;
}

export interface ExtractOptions {
    url: string;
    outputDir: string;
    force?: boolean;
    resume?: boolean;
    runMemory?: boolean;
    skipVision?: boolean;
    pages?: string[];           // multi-page: specific URLs to crawl
    crawlAll?: boolean;         // multi-page: auto-discover and crawl all pages
    maxPages?: number;          // limit page count
    onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
    phase:
    | "init"
    | "discovering"
    | "loading"
    | "extracting"
    | "screenshots"
    | "assets"
    | "vision"
    | "memory"
    | "done"
    | "error";
    message: string;
    progress?: number; // 0–100
    pageIndex?: number;  // current page (multi-page)
    pageCount?: number;  // total pages
    summary?: ExtractionSummary;
    error?: string;
}

export interface ExtractionSummary {
    colors: number;
    gradients: number;
    typography: number;
    spacing: number;
    radii: number;
    shadows: number;
    borders: number;
    transitions: number;
    components: number;
    patterns: number;
    sections: number;
    images: number;
    svgs: number;
    videos: number;
    pseudoElements: number;
    hoverStates: number;
    cssVariables: number;
    fontFiles: number;
    fontFaces: number;
    containerWidths: string;
}

export interface ExtractionResult {
    success: boolean;
    data: any;
    summary: ExtractionSummary;
    outputDir: string;
    jsonPath: string;
    error?: string;
}

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════

function loadJsonFile<T>(filePath: string): T | null {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
    } catch {
        return null;
    }
}

function normalizeUrl(input: string): string {
    try {
        const parsed = new URL(input);
        parsed.hash = "";
        if (
            (parsed.protocol === "https:" && parsed.port === "443") ||
            (parsed.protocol === "http:" && parsed.port === "80")
        ) {
            parsed.port = "";
        }
        parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
        return parsed.toString();
    } catch {
        return input.replace(/\/+$/, "") || input;
    }
}

function urlsMatch(a: string, b: string): boolean {
    return normalizeUrl(a) === normalizeUrl(b);
}

async function runInParallel<T>(
    items: T[],
    concurrency: number,
    fn: (item: T, workerId: number) => Promise<void>
) {
    let index = 0;
    const workers = new Array(concurrency).fill(0).map(async (_, workerId) => {
        while (index < items.length) {
            const item = items[index++];
            if (item) await fn(item, workerId);
        }
    });
    await Promise.all(workers);
}

async function waitForStableBoundingBox(loc: any, page: Page, rounds = 3) {
    let prev: any = null;
    let current: any = null;
    for (let i = 0; i < rounds; i++) {
        current = await loc.boundingBox();
        if (!current) return null;
        if (prev) {
            const dx = Math.abs((current.x || 0) - (prev.x || 0));
            const dy = Math.abs((current.y || 0) - (prev.y || 0));
            const dw = Math.abs((current.width || 0) - (prev.width || 0));
            const dh = Math.abs((current.height || 0) - (prev.height || 0));
            if (dx <= 1 && dy <= 1 && dw <= 1 && dh <= 1) {
                return current;
            }
        }
        prev = current;
        await page.waitForTimeout(60);
    }
    return current;
}

async function dismissOverlays(page: Page) {
    for (const sel of [
        'button[aria-label*="close" i]',
        '[role="dialog"] button[aria-label*="close" i]',
        'button:has-text("Close")',
        'button:has-text("Dismiss")',
        ".hds-dialog button",
    ]) {
        try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 150 })) {
                await btn.click({ timeout: 300 });
            }
        } catch { }
    }
    try {
        await page.keyboard.press("Escape");
    } catch { }
}

function buildSummary(rawData: any, fontFileCount: number): ExtractionSummary {
    return {
        colors: rawData.tokens.colors.length,
        gradients: rawData.tokens.gradients.length,
        typography: rawData.tokens.typography.length,
        spacing: rawData.tokens.spacing.length,
        radii: rawData.tokens.radii.length,
        shadows: rawData.tokens.shadows.length,
        borders: rawData.tokens.borders.length,
        transitions: rawData.tokens.transitions.length,
        components: rawData.components.length,
        patterns: rawData.patterns.length,
        sections: rawData.sections.length,
        images: rawData.assets.images.length,
        svgs: rawData.assets.svgs.length,
        videos: rawData.assets.videos.length,
        pseudoElements: rawData.assets.pseudoElements.length,
        hoverStates: rawData.interactions.hoverStates.length,
        cssVariables: rawData.cssVariables.length,
        fontFiles: fontFileCount,
        fontFaces: rawData.fontFaces.length,
        containerWidths: rawData.layoutSystem.containerWidths.join(", ") + "px",
    };
}

// ════════════════════════════════════════════════════
// PAGE DISCOVERY
// ════════════════════════════════════════════════════

/** Noise patterns to filter out from discovered URLs */
const SKIP_PATH_PATTERNS = [
    /\/(login|logout|signup|sign-up|sign-in|register|auth|oauth|callback|reset|forgot)/i,
    /\/(admin|dashboard|account|settings|profile|preferences)/i,
    /\/(api|graphql|webhook|rss|feed|sitemap\.xml)/i,
    /\.(pdf|zip|tar|gz|png|jpg|jpeg|gif|svg|webp|mp4|mp3|woff|woff2|css|js|json)$/i,
    /\?/,  // skip URLs with query strings
    /#/,   // skip fragment-only links
];

/**
 * Discover crawlable pages from a given URL.
 * Scans same-origin `<a>` links on the page and optionally reads sitemap.xml.
 */
export async function discoverPages(url: string): Promise<PageInfo[]> {
    const origin = new URL(url).origin;
    const seenPaths = new Set<string>();
    const pages: PageInfo[] = [];

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
    });

    try {
        const page = await ctx.newPage();

        // Navigate to the target URL
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        } catch {
            // Timeout is acceptable — we still parse whatever loaded
        }

        // Add the landing page itself
        const landingTitle = await page.title().catch(() => "");
        const landingPath = new URL(url).pathname || "/";
        seenPaths.add(landingPath.replace(/\/+$/, "") || "/");
        pages.push({ url, title: landingTitle || "Home", path: landingPath });

        // Collect all same-origin <a> links
        const links = await page.evaluate((pageOrigin: string) => {
            const anchors = Array.from(document.querySelectorAll("a[href]"));
            const results: { href: string; text: string }[] = [];
            for (const a of anchors) {
                const href = (a as HTMLAnchorElement).href;
                if (!href) continue;
                try {
                    const parsed = new URL(href);
                    if (parsed.origin === pageOrigin) {
                        results.push({
                            href: parsed.origin + parsed.pathname,
                            text: (a.textContent || "").trim().slice(0, 80),
                        });
                    }
                } catch { /* invalid URL */ }
            }
            return results;
        }, origin);

        for (const link of links) {
            try {
                const parsed = new URL(link.href);
                const cleanPath = parsed.pathname.replace(/\/+$/, "") || "/";

                // Skip if already seen
                if (seenPaths.has(cleanPath)) continue;

                // Skip noise patterns
                if (SKIP_PATH_PATTERNS.some((p) => p.test(cleanPath))) continue;

                seenPaths.add(cleanPath);
                pages.push({
                    url: link.href,
                    title: link.text || cleanPath,
                    path: cleanPath,
                });
            } catch { /* invalid URL */ }
        }

        // Try sitemap.xml for additional pages
        try {
            const sitemapRes = await ctx.request.get(`${origin}/sitemap.xml`, {
                timeout: 5000,
            });
            if (sitemapRes.ok()) {
                const xml = await sitemapRes.text();
                const locMatches = xml.match(/<loc>(.*?)<\/loc>/g) || [];
                for (const loc of locMatches) {
                    const href = loc.replace(/<\/?loc>/g, "").trim();
                    try {
                        const parsed = new URL(href);
                        if (parsed.origin !== origin) continue;
                        const cleanPath = parsed.pathname.replace(/\/+$/, "") || "/";
                        if (seenPaths.has(cleanPath)) continue;
                        if (SKIP_PATH_PATTERNS.some((p) => p.test(cleanPath))) continue;

                        seenPaths.add(cleanPath);
                        pages.push({
                            url: href,
                            title: cleanPath,
                            path: cleanPath,
                        });
                    } catch { /* invalid URL */ }
                }
            }
        } catch { /* sitemap not available */ }

    } finally {
        await browser.close();
    }

    // Sort: homepage first, then by path depth, then alphabetically
    return pages.sort((a, b) => {
        if (a.path === "/") return -1;
        if (b.path === "/") return 1;
        const depthA = a.path.split("/").length;
        const depthB = b.path.split("/").length;
        if (depthA !== depthB) return depthA - depthB;
        return a.path.localeCompare(b.path);
    });
}

// ════════════════════════════════════════════════════
// MERGE HELPERS (multi-page deduplication)
// ════════════════════════════════════════════════════

/**
 * Merge tokens and components from a subsequent page into the primary data.
 * Deduplicates colors, typography, spacing, etc. Tags components with source page.
 */
function mergePageData(primary: any, secondary: any, pageUrl: string): void {
    // ── Colors: merge by hex ────────────────────────────────────────────
    const existingHexes = new Set(primary.tokens.colors.map((c: any) => c.hex));
    for (const color of secondary.tokens.colors) {
        if (!existingHexes.has(color.hex)) {
            primary.tokens.colors.push(color);
            existingHexes.add(color.hex);
        } else {
            const existing = primary.tokens.colors.find((c: any) => c.hex === color.hex);
            if (existing) existing.count += color.count;
        }
    }

    // ── Gradients: merge by value ───────────────────────────────────────
    const existingGradients = new Set(primary.tokens.gradients.map((g: any) => g.value));
    for (const grad of secondary.tokens.gradients) {
        if (!existingGradients.has(grad.value)) {
            primary.tokens.gradients.push(grad);
        }
    }

    // ── Typography: merge by signature ──────────────────────────────────
    const typoSigs = new Set(
        primary.tokens.typography.map((t: any) => `${t.fontSize}|${t.fontWeight}|${t.fontFamily}`)
    );
    for (const typo of secondary.tokens.typography) {
        const sig = `${typo.fontSize}|${typo.fontWeight}|${typo.fontFamily}`;
        if (!typoSigs.has(sig)) {
            primary.tokens.typography.push(typo);
            typoSigs.add(sig);
        }
    }

    // ── Spacing: merge unique values ────────────────────────────────────
    const spacingSet = new Set(primary.tokens.spacing);
    for (const s of secondary.tokens.spacing) {
        spacingSet.add(s);
    }
    primary.tokens.spacing = (Array.from(spacingSet) as number[]).sort((a, b) => a - b);

    // ── Radii, shadows, borders, transitions: merge by value ────────────
    for (const key of ["radii", "shadows", "borders", "transitions"] as const) {
        const existingVals = new Set(primary.tokens[key].map((v: any) => v.value));
        for (const item of secondary.tokens[key]) {
            if (!existingVals.has(item.value)) {
                primary.tokens[key].push(item);
            } else {
                const existing = primary.tokens[key].find((v: any) => v.value === item.value);
                if (existing) existing.count += item.count;
            }
        }
    }

    // ── CSS Variables: merge by name ────────────────────────────────────
    const existingVarNames = new Set(primary.cssVariables.map((v: any) => v.name));
    for (const cssVar of secondary.cssVariables) {
        if (!existingVarNames.has(cssVar.name)) {
            primary.cssVariables.push(cssVar);
        }
    }

    // ── Font faces: merge by family+weight+style ────────────────────────
    const fontSigs = new Set(
        primary.fontFaces.map((f: any) => `${f.family}|${f.weight}|${f.style}`)
    );
    for (const font of secondary.fontFaces) {
        const sig = `${font.family}|${font.weight}|${font.style}`;
        if (!fontSigs.has(sig)) {
            primary.fontFaces.push(font);
        }
    }

    // ── Components: always append, tagged with source page ──────────────
    for (const comp of secondary.components) {
        comp.sourcePage = pageUrl;
        primary.components.push(comp);
    }

    // ── Sections: always append, tagged with source page ────────────────
    for (const sec of secondary.sections) {
        sec.sourcePage = pageUrl;
        primary.sections.push(sec);
    }

    // ── Patterns: append new unique fingerprints ────────────────────────
    const existingFps = new Set(primary.patterns.map((p: any) => p.fingerprint));
    for (const pat of secondary.patterns) {
        if (!existingFps.has(pat.fingerprint)) {
            pat.sourcePage = pageUrl;
            primary.patterns.push(pat);
        }
    }

    // ── Assets: append all ──────────────────────────────────────────────
    for (const img of secondary.assets.images) {
        primary.assets.images.push(img);
    }
    for (const svg of secondary.assets.svgs) {
        primary.assets.svgs.push(svg);
    }
    for (const vid of secondary.assets.videos) {
        primary.assets.videos.push(vid);
    }
    for (const pseudo of secondary.assets.pseudoElements) {
        primary.assets.pseudoElements.push(pseudo);
    }

    // ── Hover states: append ────────────────────────────────────────────
    for (const hover of secondary.interactions.hoverStates) {
        primary.interactions.hoverStates.push(hover);
    }

    // ── Container widths: merge ─────────────────────────────────────────
    const cwSet = new Set(primary.layoutSystem.containerWidths);
    for (const cw of secondary.layoutSystem.containerWidths) {
        cwSet.add(cw);
    }
    primary.layoutSystem.containerWidths = (Array.from(cwSet) as number[]).sort((a, b) => a - b);
}

// ════════════════════════════════════════════════════
// MAIN EXTRACTION PIPELINE
// ════════════════════════════════════════════════════

export async function runExtraction(
    options: ExtractOptions
): Promise<ExtractionResult> {
    const { url, outputDir, onProgress } = options;
    const force = options.force ?? false;
    const resume = options.resume ?? false;
    const skipVision = options.skipVision ?? false;
    let runMemory = options.runMemory ?? false;

    const emit = (event: ProgressEvent) => {
        if (onProgress) onProgress(event);
    };

    const CHECKPOINTS = path.join(outputDir, "checkpoints");
    const SHOTS = path.join(outputDir, "screenshots");
    const ASSETS = path.join(outputDir, "assets");
    const FONTS = path.join(outputDir, "fonts");

    try {
        // ── Setup ───────────────────────────────────────────────────────────
        emit({ phase: "init", message: "Setting up output directories…" });

        if (force && fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
        }

        [outputDir, CHECKPOINTS, SHOTS, ASSETS, FONTS].forEach((d) =>
            fs.mkdirSync(d, { recursive: true })
        );

        // ── Validate resume ─────────────────────────────────────────────────
        const jsonPath = path.join(outputDir, "design-system.json");

        if (resume) {
            const existingData = loadJsonFile<any>(jsonPath);
            if (!existingData) {
                throw new Error(
                    "--resume requested but no existing output checkpoint was found."
                );
            }
            const existingUrl = existingData?.meta?.url as string | undefined;
            if (existingUrl && !urlsMatch(existingUrl, url)) {
                throw new Error(
                    `--resume target mismatch. Existing output is for ${existingUrl}.`
                );
            }
        }

        // ── System specs ────────────────────────────────────────────────────
        const cpuCount = os.cpus().length;
        const memGb = os.totalmem() / 1024 ** 3;
        let concurrency = Math.max(1, Math.min(cpuCount, Math.floor(memGb / 2)));
        if (process.env.MAX_CONCURRENCY)
            concurrency = parseInt(process.env.MAX_CONCURRENCY, 10);

        emit({
            phase: "init",
            message: `System: ${cpuCount} cores, ${memGb.toFixed(1)}GB RAM, concurrency=${concurrency}`,
        });

        // ═══════════════════════════════════════════════════════════
        // PHASE 1: PLAYWRIGHT EXTRACTION
        // ═══════════════════════════════════════════════════════════

        emit({ phase: "loading", message: `Launching browser for ${url}…`, progress: 5 });

        const browser = await chromium.launch({ headless: true });
        const ctx = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            deviceScaleFactor: 2,
            ignoreHTTPSErrors: true,
        });

        // Aggressive network blocking
        await ctx.route("**/*", (route) => {
            const rType = route.request().resourceType();
            const rUrl = route.request().url().toLowerCase();
            const isTracker = [
                "google-analytics", "analytics", "tracker", "doubleclick",
                "facebook", "mixpanel", "segment",
            ].some((t) => rUrl.includes(t));
            if (isTracker || ["media", "websocket", "manifest"].includes(rType)) {
                return route.abort();
            }
            return route.continue();
        });

        // Intercept font files
        const fontFiles: { url: string; body: Buffer }[] = [];
        const page = await ctx.newPage();
        page.on("response", async (response) => {
            const url2 = response.url();
            const ct = response.headers()["content-type"] || "";
            if (ct.includes("font") || url2.match(/\.(woff2?|ttf|otf|eot)(\?|$)/)) {
                try {
                    const body = await response.body();
                    fontFiles.push({ url: url2, body });
                } catch { }
            }
        });

        emit({ phase: "loading", message: "Loading page…", progress: 10 });
        try {
            await page.goto(url, { waitUntil: "load", timeout: 90_000 });
        } catch {
            emit({ phase: "loading", message: "Navigation timeout, continuing…" });
        }

        try {
            await page.waitForLoadState("load", { timeout: 15_000 });
        } catch { }
        await page.waitForTimeout(500);

        // Scroll to trigger lazy loading
        emit({ phase: "loading", message: "Triggering lazy loading…", progress: 15 });
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await page.evaluate(async () => {
                    const OriginalObserver = window.IntersectionObserver;
                    window.IntersectionObserver = function (
                        callback: any,
                        options: any
                    ) {
                        const observer = new OriginalObserver(callback, options);
                        const originalObserve = observer.observe.bind(observer);
                        observer.observe = (element) => {
                            originalObserve(element);
                            callback(
                                [
                                    {
                                        isIntersecting: true,
                                        target: element,
                                        intersectionRatio: 1,
                                        boundingClientRect: element.getBoundingClientRect(),
                                        intersectionRect: element.getBoundingClientRect(),
                                        rootBounds: null,
                                        time: Date.now(),
                                    },
                                ] as IntersectionObserverEntry[],
                                observer
                            );
                        };
                        return observer;
                    } as any;

                    await new Promise<void>((resolve) => {
                        let totalHeight = 0;
                        const distance = 800;
                        const timer = setInterval(() => {
                            const scrollHeight = document.body.scrollHeight;
                            window.scrollBy(0, distance);
                            totalHeight += distance;
                            if (totalHeight >= scrollHeight) {
                                clearInterval(timer);
                                window.scrollTo(0, 0);
                                resolve();
                            }
                        }, 50);
                    });
                });
                break;
            } catch (err: any) {
                if (
                    attempt < 3 &&
                    err?.message?.includes("Execution context was destroyed")
                ) {
                    await page
                        .waitForLoadState("load", { timeout: 15_000 })
                        .catch(() => { });
                    await page.waitForTimeout(500);
                } else {
                    break;
                }
            }
        }

        try {
            await page.waitForLoadState("networkidle", { timeout: 15000 });
        } catch { }

        emit({ phase: "loading", message: "Waiting for fonts and images…", progress: 20 });
        try {
            await Promise.race([
                page.evaluate(async () => {
                    await document.fonts.ready;
                    await Promise.all(
                        Array.from(document.images).map((img) => {
                            if (img.complete) return Promise.resolve();
                            return new Promise((resolve) => {
                                img.onload = img.onerror = resolve;
                                setTimeout(resolve, 8000);
                            });
                        })
                    );
                }),
                new Promise((resolve) => setTimeout(resolve, 30_000)), // 30s max wait
            ]);
        } catch (err) {
            emit({ phase: "loading", message: `Font/image wait interrupted: ${(err as Error).message?.slice(0, 80)}, continuing…` });
        }

        try {
            await page.waitForTimeout(6000);
        } catch {
            emit({ phase: "loading", message: "Page wait interrupted, continuing…" });
        }

        // Dismiss cookie banners
        try {
            for (const sel of [
                'button:has-text("Accept")',
                'button:has-text("Accept all")',
                'button:has-text("Got it")',
                'button:has-text("OK")',
                '[id*="cookie"] button',
                '[class*="cookie"] button',
                '[id*="consent"] button',
            ]) {
                try {
                    const btn = page.locator(sel).first();
                    if (await btn.isVisible({ timeout: 500 })) await btn.click();
                } catch { }
            }
            await page.waitForTimeout(1000);
            await dismissOverlays(page);
            await page.waitForTimeout(150);
        } catch {
            emit({ phase: "loading", message: "Cookie/overlay dismissal interrupted, continuing…" });
        }

        // ── Extract design system ───────────────────────────────────────────
        emit({ phase: "extracting", message: "Extracting design system…", progress: 25 });

        let rawData: any;
        if (resume && fs.existsSync(jsonPath)) {
            rawData = loadJsonFile(jsonPath);
            emit({ phase: "extracting", message: "Loaded Phase 1 from checkpoint." });
        } else {
            rawData = await extractDesignSystem(page);
        }

        const summary = buildSummary(rawData, fontFiles.length);
        emit({
            phase: "extracting",
            message: `Extracted ${summary.components} components, ${summary.colors} colors, ${summary.typography} typography tokens`,
            progress: 40,
            summary,
        });

        // ── Screenshots ─────────────────────────────────────────────────────
        emit({ phase: "screenshots", message: "Stabilizing layout for screenshots…", progress: 42 });

        await page.evaluate(() => {
            const style = document.createElement("style");
            style.setAttribute("data-extract-screenshot-style", "1");
            style.textContent = `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          scroll-behavior: auto !important;
        }
      `;
            document.head.appendChild(style);
            const elements = document.querySelectorAll("*");
            elements.forEach((el) => {
                const node = el as HTMLElement;
                const cs = window.getComputedStyle(node);
                if (cs.position === "fixed" || cs.position === "sticky") {
                    node.style.setProperty("position", "absolute", "important");
                }
            });
        });
        await page.waitForTimeout(200);

        // Full page screenshot
        emit({ phase: "screenshots", message: "Full page screenshot…", progress: 44 });
        try {
            await page.screenshot({
                path: path.join(SHOTS, "full-page.png"),
                fullPage: true,
                type: "png",
                timeout: 45000,
                animations: "disabled",
            });
            (rawData as any).fullPageScreenshot = "screenshots/full-page.png";
        } catch {
            emit({ phase: "screenshots", message: "Full page screenshot failed, skipping…" });
        }

        // Section screenshots
        emit({
            phase: "screenshots",
            message: `Section screenshots (${rawData.sections.length})…`,
            progress: 46,
        });
        let secCount = 0;
        for (const sec of rawData.sections) {
            secCount++;
            try {
                const loc = page.locator(`[data-extract-id="${sec.id}"]`).first();
                await loc
                    .evaluate((el: HTMLElement) => {
                        el.scrollIntoView({
                            block: "center",
                            inline: "center",
                            behavior: "auto",
                        });
                    })
                    .catch(() => { });
                await page.waitForTimeout(100);
                if ((await loc.count()) > 0) {
                    const fname = `${sec.id}.png`;
                    try {
                        await loc.screenshot({
                            path: path.join(SHOTS, fname),
                            type: "png",
                            timeout: 30000,
                            animations: "disabled",
                        });
                    } catch {
                        const box = await loc.boundingBox();
                        if (box && box.width > 10 && box.height > 10) {
                            const maxH = Math.min(box.height, 2200);
                            await page.screenshot({
                                path: path.join(SHOTS, fname),
                                type: "png",
                                animations: "disabled",
                                clip: {
                                    x: Math.max(0, box.x),
                                    y: Math.max(0, box.y),
                                    width: Math.max(10, box.width),
                                    height: Math.max(10, maxH),
                                },
                                timeout: 30000,
                            });
                        }
                    }
                    const outPath = path.join(SHOTS, fname);
                    if (fs.existsSync(outPath)) {
                        (sec as any).screenshot = `screenshots/${fname}`;
                    }
                }
            } catch { }
        }

        // Component screenshots
        emit({
            phase: "screenshots",
            message: `Component screenshots (up to 200)…`,
            progress: 55,
        });

        const typePriority = (type: string) => {
            if (type === "card") return 1;
            if (type === "button") return 2;
            if (type === "media") return 3;
            if (type === "link-arrow") return 4;
            if (type === "navigation") return 5;
            return 10;
        };

        const compsToProcess = [...rawData.components].sort((a: any, b: any) => {
            const p = typePriority(a.type) - typePriority(b.type);
            if (p !== 0) return p;
            return (b.confidence || 0) - (a.confidence || 0);
        });

        let shotCount = 0;
        await runInParallel(compsToProcess, 1, async (comp) => {
            try {
                const rect = comp.rect || { width: 0, height: 0 };
                const aspect =
                    (rect.width || 0) / Math.max(1, rect.height || 1);
                if (comp.type === "component") {
                    if (
                        rect.height < 28 ||
                        aspect > 14 ||
                        (rect.width < 40 && rect.height < 40)
                    ) {
                        return;
                    }
                }

                const loc = page.locator(`[data-extract-id="${comp.id}"]`).first();
                if ((await loc.count()) === 0) return;

                await loc
                    .evaluate((el: HTMLElement) => {
                        el.scrollIntoView({
                            block: "center",
                            inline: "center",
                            behavior: "auto",
                        });
                    })
                    .catch(() => { });
                await loc.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => { });
                await page.waitForTimeout(120);

                if (await loc.isVisible({ timeout: 500 })) {
                    const box = await waitForStableBoundingBox(loc, page);
                    if (box && box.width > 5 && box.height > 5) {
                        const fname = `${comp.id}.png`;
                        await loc
                            .evaluate((el: HTMLElement) => {
                                el.dataset.extractPrevOverflow = el.style.overflow || "";
                                el.style.overflow = "hidden";
                            })
                            .catch(() => { });

                        try {
                            await loc.screenshot({
                                path: path.join(SHOTS, fname),
                                type: "png",
                                timeout: 5000,
                                animations: "disabled",
                            });
                        } finally {
                            await loc
                                .evaluate((el: HTMLElement) => {
                                    const prev = el.dataset.extractPrevOverflow || "";
                                    el.style.overflow = prev;
                                    delete el.dataset.extractPrevOverflow;
                                })
                                .catch(() => { });
                        }

                        (comp as any).screenshot = `screenshots/${fname}`;
                        shotCount++;
                    }
                }
            } catch { }
        });

        // Hover screenshots
        emit({
            phase: "screenshots",
            message: `Hover screenshots (${rawData.interactions.hoverStates.length})…`,
            progress: 65,
        });
        await runInParallel(
            rawData.interactions.hoverStates as any[],
            1,
            async (hover: any) => {
                try {
                    const loc = page
                        .locator(`[data-extract-id="${hover.componentId}"]`)
                        .first();
                    if (await loc.isVisible({ timeout: 300 })) {
                        await loc.hover({ timeout: 500 });
                        await page.waitForTimeout(350);
                        const fname = `${hover.componentId}-hover.png`;
                        await loc.screenshot({
                            path: path.join(SHOTS, fname),
                            type: "png",
                            timeout: 15000,
                            animations: "disabled",
                        });
                        (hover as any).screenshotHover = `screenshots/${fname}`;
                        await page.mouse.move(0, 0);
                        await page.waitForTimeout(200);
                    }
                } catch { }
            }
        );

        // ── Download assets ─────────────────────────────────────────────────
        emit({ phase: "assets", message: "Downloading image assets…", progress: 70 });

        const totalImages = Math.min(rawData.assets.images.length, 80);
        let downloadedCount = 0;
        await runInParallel(
            rawData.assets.images.slice(0, totalImages),
            concurrency,
            async (img) => {
                downloadedCount++;
                try {
                    const resp = await ctx.request.get((img as any).src, {
                        timeout: 8000,
                    });
                    if (resp.ok()) {
                        const ct = resp.headers()["content-type"] || "";
                        let ext = "png";
                        if (ct.includes("jpeg") || ct.includes("jpg")) ext = "jpg";
                        else if (ct.includes("webp")) ext = "webp";
                        else if (ct.includes("svg")) ext = "svg";
                        else if (ct.includes("gif")) ext = "gif";
                        const fname = `image-${downloadedCount}.${ext}`;
                        fs.writeFileSync(path.join(ASSETS, fname), await resp.body());
                        (img as any).localPath = `assets/${fname}`;
                    }
                } catch { }
            }
        );

        // Save SVGs
        for (let i = 0; i < Math.min(rawData.assets.svgs.length, 80); i++) {
            const svg = rawData.assets.svgs[i];
            const fname = `icon-${i}.svg`;
            fs.writeFileSync(path.join(ASSETS, fname), svg.html);
            (svg as any).localPath = `assets/${fname}`;
        }

        // Save font files
        for (let i = 0; i < fontFiles.length; i++) {
            const f = fontFiles[i];
            const ext = f.url.match(/\.(woff2?|ttf|otf|eot)/)?.[1] || "woff2";
            const fname = `font-${i}.${ext}`;
            fs.writeFileSync(path.join(FONTS, fname), f.body);
            if (rawData.fontFaces[i])
                (rawData.fontFaces[i] as any).localPath = `fonts/${fname}`;
        }

        // ═══════════════════════════════════════════════════════════
        // MULTI-PAGE EXTRACTION (if pages array has > 1 entry)
        // ═══════════════════════════════════════════════════════════

        const pagesToCrawl = options.pages ?? [];
        if (pagesToCrawl.length > 1) {
            const totalPages = pagesToCrawl.length;
            // First page is already extracted above — iterate remaining pages
            for (let pageIdx = 1; pageIdx < totalPages; pageIdx++) {
                const pageUrl = pagesToCrawl[pageIdx];
                emit({
                    phase: "extracting",
                    message: `[Page ${pageIdx + 1}/${totalPages}] Navigating to ${pageUrl}…`,
                    progress: Math.round(40 + (pageIdx / totalPages) * 25),
                    pageIndex: pageIdx,
                    pageCount: totalPages,
                });

                try {
                    // Navigate to the next page in the same context
                    await page.goto(pageUrl, { waitUntil: "load", timeout: 60_000 });
                } catch {
                    emit({
                        phase: "extracting",
                        message: `[Page ${pageIdx + 1}/${totalPages}] Navigation timeout, continuing…`,
                        pageIndex: pageIdx,
                        pageCount: totalPages,
                    });
                }

                try {
                    await page.waitForLoadState("load", { timeout: 10_000 });
                } catch { }
                try { await page.waitForTimeout(500); } catch { }

                // Trigger lazy loading on this page
                try {
                    await page.evaluate(async () => {
                        await new Promise<void>((resolve) => {
                            let totalHeight = 0;
                            const distance = 800;
                            const timer = setInterval(() => {
                                const scrollHeight = document.body.scrollHeight;
                                window.scrollBy(0, distance);
                                totalHeight += distance;
                                if (totalHeight >= scrollHeight) {
                                    clearInterval(timer);
                                    window.scrollTo(0, 0);
                                    resolve();
                                }
                            }, 50);
                        });
                    });
                } catch { }

                try {
                    await page.waitForLoadState("networkidle", { timeout: 10_000 });
                } catch { }

                // Wait for fonts/images
                try {
                    await Promise.race([
                        page.evaluate(async () => { await document.fonts.ready; }),
                        new Promise((resolve) => setTimeout(resolve, 10_000)),
                    ]);
                } catch { }
                try { await page.waitForTimeout(2000); } catch { }

                // Dismiss overlays
                try { await dismissOverlays(page); } catch { }

                // Extract this page's design system
                emit({
                    phase: "extracting",
                    message: `[Page ${pageIdx + 1}/${totalPages}] Extracting tokens & components…`,
                    progress: Math.round(40 + ((pageIdx + 0.5) / totalPages) * 25),
                    pageIndex: pageIdx,
                    pageCount: totalPages,
                });

                try {
                    const pageData = await extractDesignSystem(page);

                    // Merge into primary data
                    mergePageData(rawData, pageData, pageUrl);

                    emit({
                        phase: "extracting",
                        message: `[Page ${pageIdx + 1}/${totalPages}] Merged ${pageData.components.length} components, ${pageData.tokens.colors.length} colors`,
                        progress: Math.round(40 + ((pageIdx + 1) / totalPages) * 25),
                        pageIndex: pageIdx,
                        pageCount: totalPages,
                    });
                } catch (err) {
                    emit({
                        phase: "extracting",
                        message: `[Page ${pageIdx + 1}/${totalPages}] Extraction failed: ${(err as Error).message}`,
                        pageIndex: pageIdx,
                        pageCount: totalPages,
                    });
                    // Continue to next page even if one fails
                }
            }

            // Update summary after multi-page merge
            const updatedSummary = buildSummary(rawData, fontFiles.length);
            emit({
                phase: "extracting",
                message: `Multi-page extraction complete: ${updatedSummary.components} total components, ${updatedSummary.colors} colors across ${totalPages} pages`,
                progress: 65,
                summary: updatedSummary,
                pageCount: totalPages,
            });
        }

        await browser.close();

        // ── Checkpoint save ─────────────────────────────────────────────────
        emit({ phase: "assets", message: "Saving Phase 1 checkpoint…", progress: 75 });
        fs.writeFileSync(
            jsonPath,
            JSON.stringify({ ...rawData, analysis: null }, null, 2)
        );

        // ═══════════════════════════════════════════════════════════
        // PHASE 1.5: VISION LOOP (skipped in web mode)
        // ═══════════════════════════════════════════════════════════

        const gemini = new GeminiClient();

        if (!skipVision && gemini.isAvailable) {
            emit({ phase: "vision", message: "AI Vision extraction pass…", progress: 78 });

            const abDir = path.join(os.homedir(), ".agent-browser");
            for (const ext of ["sock", "pid"]) {
                const f = path.join(abDir, `harvest.${ext}`);
                if (fs.existsSync(f)) {
                    try {
                        fs.unlinkSync(f);
                    } catch { }
                }
            }

            const driver = new AgentDriver("harvest");
            try {
                await driver.open(url);
                await driver.waitLoad("networkidle");
                await driver.wait(3000);

                const visionComps = await runVisionLoop(
                    driver,
                    gemini,
                    url,
                    outputDir,
                    SHOTS
                );
                if (visionComps && visionComps.length > 0) {
                    rawData.components.push(...visionComps);
                    emit({
                        phase: "vision",
                        message: `Added ${visionComps.length} components from Vision Agent`,
                        progress: 82,
                    });
                }
            } catch (e) {
                emit({
                    phase: "vision",
                    message: `Vision pass failed: ${(e as Error).message}`,
                });
            } finally {
                await driver.close();
            }
        } else if (!skipVision) {
            emit({ phase: "vision", message: "Skipping vision (no API key)", progress: 82 });
        } else {
            emit({ phase: "vision", message: "Vision pass skipped (web mode)", progress: 82 });
        }

        // ═══════════════════════════════════════════════════════════
        // PHASE 2: DESIGN MEMORY GENERATION
        // ═══════════════════════════════════════════════════════════

        let analysis: any = null;

        if (gemini.isAvailable && runMemory) {
            emit({
                phase: "memory",
                message: "Generating design memory with Gemini…",
                progress: 85,
            });

            try {
                const memoryGen = new MemoryGenerator(gemini, rawData, outputDir);
                const memoryResult = await memoryGen.generateAll();

                analysis = {
                    memoryOutputs: memoryResult.dir,
                    aiUsage: {
                        calls: gemini.calls,
                        tokens: gemini.usage.totalTokens,
                    },
                };

                emit({
                    phase: "memory",
                    message: `Design memory complete — ${analysis.aiUsage.calls} API calls`,
                    progress: 95,
                });
            } catch (err) {
                emit({
                    phase: "memory",
                    message: `Design memory generation failed: ${(err as Error).message}`,
                });
            }
        } else {
            emit({
                phase: "memory",
                message: gemini.isAvailable
                    ? "Skipping design memory (not requested)"
                    : "Skipping design memory (no API key)",
                progress: 95,
            });
        }

        // ── Final save ──────────────────────────────────────────────────────
        const finalData = {
            ...rawData,
            analysis: analysis || null,
        };

        fs.writeFileSync(jsonPath, JSON.stringify(finalData, null, 2));

        const finalSummary = buildSummary(finalData, fontFiles.length);

        emit({
            phase: "done",
            message: "Extraction complete!",
            progress: 100,
            summary: finalSummary,
        });

        return {
            success: true,
            data: finalData,
            summary: finalSummary,
            outputDir,
            jsonPath,
        };
    } catch (err) {
        const errorMsg = (err as Error).message || "Unknown error";
        emit({ phase: "error", message: errorMsg, error: errorMsg });
        return {
            success: false,
            data: null,
            summary: {} as ExtractionSummary,
            outputDir,
            jsonPath: path.join(outputDir, "design-system.json"),
            error: errorMsg,
        };
    }
}
