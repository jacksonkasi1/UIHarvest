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

export interface ExtractOptions {
    url: string;
    outputDir: string;
    force?: boolean;
    resume?: boolean;
    runMemory?: boolean;
    skipVision?: boolean;
    onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
    phase:
    | "init"
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
        await page.evaluate(async () => {
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
        });

        await page.waitForTimeout(6000);

        // Dismiss cookie banners
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
