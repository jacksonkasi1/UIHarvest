import type { Page } from "playwright";

export interface DesignSystemData {
  meta: any;
  tokens: any;
  components: any[];
  patterns: any[];
  sections: any[];
  assets: any;
  interactions: any;
  cssVariables: any[];
  fontFaces: any[];
  layoutSystem: any;
}

export async function extractDesignSystem(page: Page): Promise<DesignSystemData> {
  // ── Step 1: Scroll to trigger lazy load ──
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight + 1000) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          setTimeout(resolve, 800);
        }
      }, 80);
    });
  });
  await page.waitForTimeout(2000);

  // ── Step 2: Extract font files ──
  const fontFaces = await page.evaluate(() => {
    const fonts: any[] = [];
    // From document.fonts API
    try {
      document.fonts.forEach((f: any) => {
        fonts.push({
          family: f.family.replace(/['"]/g, ""),
          style: f.style,
          weight: f.weight,
          status: f.status,
        });
      });
    } catch {}
    // From @font-face rules in stylesheets
    try {
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules || []).forEach((rule: any) => {
            if (rule.type === CSSRule.FONT_FACE_RULE) {
              const src = rule.style.getPropertyValue("src");
              const urls: string[] = [];
              const rx = /url\(["']?([^"')]+)["']?\)/g;
              let m;
              while ((m = rx.exec(src))) urls.push(m[1]);
              fonts.push({
                family: rule.style.getPropertyValue("font-family").replace(/['"]/g, ""),
                weight: rule.style.getPropertyValue("font-weight") || "400",
                style: rule.style.getPropertyValue("font-style") || "normal",
                urls,
                format: src.match(/format\(["']?([^"')]+)/)?.[1] || "",
              });
            }
          });
        } catch {}
      });
    } catch {}
    // Dedup
    const seen = new Set<string>();
    return fonts.filter((f) => {
      const key = `${f.family}|${f.weight}|${f.style}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  // ── Step 3: Extract CSS custom properties ──
  const cssVariables = await page.evaluate(() => {
    const vars: any[] = [];
    const seen = new Set<string>();

    // From :root / html / body
    ["html", "body", ":root"].forEach((sel) => {
      try {
        const el = document.querySelector(sel === ":root" ? "html" : sel);
        if (!el) return;
        const s = getComputedStyle(el);
        // We can't directly enumerate custom properties from getComputedStyle
        // So we check stylesheets
      } catch {}
    });

    // From all stylesheets
    try {
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules || []).forEach((rule: any) => {
            if (rule.style) {
              for (let i = 0; i < rule.style.length; i++) {
                const prop = rule.style[i];
                if (prop.startsWith("--")) {
                  const val = rule.style.getPropertyValue(prop).trim();
                  if (val && !seen.has(prop)) {
                    seen.add(prop);
                    vars.push({
                      name: prop,
                      value: val,
                      selector: rule.selectorText || "",
                    });
                  }
                }
              }
            }
          });
        } catch {}
      });
    } catch {}

    // From data-theme elements
    document.querySelectorAll("[data-theme]").forEach((el) => {
      const theme = el.getAttribute("data-theme") || "";
      if (theme && !seen.has(`--data-theme-${theme}`)) {
        seen.add(`--data-theme-${theme}`);
        vars.push({ name: `[data-theme="${theme}"]`, value: theme, selector: "data-attribute" });
      }
    });

    return vars.slice(0, 200);
  });

  // ── Step 4: Main extraction ──
  const data = await page.evaluate(() => {
    /* ═══════ HELPERS ═══════ */
    function rgbToHex(rgb: string): string | null {
      if (!rgb || rgb === "transparent" || rgb === "rgba(0, 0, 0, 0)" || rgb === "inherit") return null;
      if (rgb.startsWith("#")) return rgb.toLowerCase();
      const m = rgb.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      return "#" + [m[1], m[2], m[3]].map((x) => parseInt(x).toString(16).padStart(2, "0")).join("");
    }

    function vis(el: HTMLElement): boolean {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0" && r.width > 0 && r.height > 0;
    }

    function absRect(el: HTMLElement) {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), width: Math.round(r.width), height: Math.round(r.height) };
    }

    function clip(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }
    function pf(v: string) { return parseFloat(v) || 0; }

    function getDataAttrs(el: HTMLElement): Record<string, string> {
      const d: Record<string, string> = {};
      Array.from(el.attributes).forEach((a) => {
        if (a.name.startsWith("data-") && !a.name.includes("gtm") && !a.name.includes("tracking") && a.name !== "data-extract-id")
          d[a.name] = a.value;
      });
      return d;
    }

    function getTextDirect(el: HTMLElement): string {
      let t = "";
      el.childNodes.forEach((n) => { if (n.nodeType === 3) t += n.textContent || ""; });
      return t.trim();
    }

    function structuralFingerprint(el: HTMLElement, depth = 0): string {
      if (depth > 4) return el.tagName;
      const tag = el.tagName.toLowerCase();
      const kids = Array.from(el.children)
        .filter((c) => vis(c as HTMLElement))
        .map((c) => structuralFingerprint(c as HTMLElement, depth + 1))
        .join(",");
      const da = Array.from(el.attributes)
        .filter((a) => a.name.startsWith("data-") && !a.name.includes("tracking") && !a.name.includes("gtm") && a.name !== "data-extract-id")
        .map((a) => a.name).sort().join(";");
      return `${tag}${da ? `[${da}]` : ""}${kids ? `(${kids})` : ""}`;
    }

    const SKIP_TAGS = new Set(["script", "style", "noscript", "link", "meta", "br", "hr", "head", "title"]);
    const vw = window.innerWidth;

    /* ═══════ TOKEN COLLECTORS ═══════ */
    const colorMap: Record<string, { count: number; usages: string[] }> = {};
    const gradientList: { value: string; element: string }[] = [];
    const typoMap: Record<string, any> = {};
    const spacingSet = new Set<number>();
    const radiusMap: Record<string, number> = {};
    const shadowMap: Record<string, number> = {};
    const borderMap: Record<string, number> = {};
    const transitionMap: Record<string, number> = {};
    const containerWidths = new Set<number>();

    /* ═══════ COMPONENT STORAGE ═══════ */
    const components: any[] = [];
    const patterns: any[] = [];
    let compIdx = 0;
    let patIdx = 0;
    const elementToCompId = new Map<HTMLElement, string>();
    const elementToCompIds = new Map<HTMLElement, string[]>();

    function addComp(el: HTMLElement, type: string, subType: string, name: string, styles: Record<string, string>, maxHtml = 8000): string {
      // Allow multiple types per element but not duplicate type+subType
      const existingIds = elementToCompIds.get(el) || [];
      for (const eid of existingIds) {
        const existing = components.find((c) => c.id === eid);
        if (existing && existing.type === type && existing.subType === subType) return eid;
      }

      const id = `comp-${compIdx++}`;
      el.setAttribute("data-extract-id", id);
      elementToCompId.set(el, id);
      elementToCompIds.set(el, [...existingIds, id]);

      const r = absRect(el);
      const sig = [type, subType, rgbToHex(styles.backgroundColor || "") || "_", styles.borderRadius || "0", styles.fontSize || "_", Math.round(r.width / 20) * 20, Math.round(r.height / 10) * 10].join("|");
      const structSig = structuralFingerprint(el);

      components.push({
        id, type, subType, name: clip(name, 80),
        html: clip(el.outerHTML, maxHtml),
        rect: r, styles, dataAttributes: getDataAttrs(el),
        signature: sig, structuralSignature: structSig,
        children: [] as string[], parentId: null as string | null,
        patternId: null as string | null, instanceIndex: 0,
      });
      return id;
    }

    /* ═══════ ASSET ARRAYS ═══════ */
    const images: any[] = [];
    const svgs: any[] = [];
    const videos: any[] = [];

    /* ═══════════════════════════════════════════
       PHASE 1 — TOKEN EXTRACTION FROM ALL ELEMENTS
       ═══════════════════════════════════════════ */

    const all = document.querySelectorAll("*");
    all.forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el)) return;
      const tag = el.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;

      /* colors */
      (["color", "background-color", "border-color", "border-top-color", "border-bottom-color", "outline-color"] as string[]).forEach((prop) => {
        const val = (s as any)[prop.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase())];
        const hex = rgbToHex(val);
        if (hex) {
          if (!colorMap[hex]) colorMap[hex] = { count: 0, usages: [] };
          colorMap[hex].count++;
          if (!colorMap[hex].usages.includes(prop)) colorMap[hex].usages.push(prop);
        }
      });

      /* gradients */
      if (s.backgroundImage && s.backgroundImage.includes("gradient")) {
        gradientList.push({ value: s.backgroundImage, element: tag });
      }

      /* typography */
      if (el.childNodes.length > 0 && el.children.length === 0 && el.textContent?.trim()) {
        const key = `${s.fontSize}|${s.fontWeight}|${s.fontFamily.split(",")[0].replace(/['"]/g, "").trim()}`;
        if (!typoMap[key]) {
          typoMap[key] = {
            fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily,
            lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color: s.color,
            textTransform: s.textTransform !== "none" ? s.textTransform : "",
            sample: clip(el.textContent.trim(), 60), count: 0,
          };
        }
        typoMap[key].count++;
      }

      /* spacing */
      [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft,
       s.marginTop, s.marginRight, s.marginBottom, s.marginLeft,
       s.gap, s.rowGap, s.columnGap].forEach((v) => {
        const n = pf(v);
        if (n > 0 && n < 300) spacingSet.add(Math.round(n));
      });

      /* radius */
      if (s.borderRadius && s.borderRadius !== "0px") {
        radiusMap[s.borderRadius] = (radiusMap[s.borderRadius] || 0) + 1;
      }

      /* shadow */
      if (s.boxShadow && s.boxShadow !== "none") {
        const short = clip(s.boxShadow, 120);
        shadowMap[short] = (shadowMap[short] || 0) + 1;
      }

      /* borders as tokens */
      if (s.borderStyle !== "none" && pf(s.borderWidth) > 0) {
        const bkey = `${s.borderWidth} ${s.borderStyle} ${rgbToHex(s.borderColor) || s.borderColor}`;
        borderMap[bkey] = (borderMap[bkey] || 0) + 1;
      }

      /* transitions */
      if (s.transition && s.transition !== "all 0s ease 0s" && s.transition !== "none") {
        transitionMap[s.transition] = (transitionMap[s.transition] || 0) + 1;
      }

      /* container widths */
      if (pf(s.maxWidth) > 200 && pf(s.maxWidth) < 2000 && r.width > vw * 0.5) {
        containerWidths.add(Math.round(pf(s.maxWidth)));
      }

      /* images */
      if (tag === "img") {
        const src = (el as HTMLImageElement).src || el.getAttribute("src") || "";
        if (src && !src.startsWith("data:")) {
          images.push({ src, alt: (el as HTMLImageElement).alt || "", width: (el as HTMLImageElement).naturalWidth || r.width, height: (el as HTMLImageElement).naturalHeight || r.height });
        }
      }
      if (s.backgroundImage && s.backgroundImage !== "none" && !s.backgroundImage.includes("gradient")) {
        const rx = /url\("(.+?)"\)/g;
        let m;
        while ((m = rx.exec(s.backgroundImage))) {
          if (!m[1].startsWith("data:")) images.push({ src: m[1], alt: "", width: r.width, height: r.height });
        }
      }

      /* SVGs */
      if (tag === "svg") {
        const html = el.outerHTML;
        if (html.length < 60000) {
          const titleEl = el.querySelector("title");
          svgs.push({ html, viewBox: el.getAttribute("viewBox") || "", width: r.width, height: r.height, title: titleEl?.textContent?.replace(" icon", "").replace(/-/g, " ") || "" });
        }
      }

      /* videos */
      if (tag === "video" || tag === "iframe") {
        const src = (el as HTMLVideoElement).src || el.getAttribute("src") || "";
        videos.push({ tag, src, width: r.width, height: r.height, poster: (el as HTMLVideoElement).poster || "" });
      }

      /* ═══════ ATOM DETECTION ═══════ */

      /* buttons */
      if (tag === "button" || el.getAttribute("role") === "button" || el.getAttribute("type") === "submit") {
        addComp(el, "button", "native", el.textContent?.trim() || "Button", {
          backgroundColor: s.backgroundColor, color: s.color, borderRadius: s.borderRadius,
          padding: s.padding, fontSize: s.fontSize, fontWeight: s.fontWeight,
          border: s.border, boxShadow: s.boxShadow, cursor: s.cursor,
          width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px`,
          transition: s.transition !== "all 0s ease 0s" ? s.transition : "",
        });
      }

      /* inputs */
      if (["input", "textarea", "select"].includes(tag)) {
        addComp(el, "input", tag, (el as HTMLInputElement).placeholder || el.getAttribute("aria-label") || tag, {
          backgroundColor: s.backgroundColor, color: s.color, borderRadius: s.borderRadius,
          padding: s.padding, fontSize: s.fontSize, border: s.border, outline: s.outline,
          width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px`,
        }, 2000);
      }

      /* headings */
      if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
        addComp(el, "heading", tag, el.textContent?.trim() || tag, {
          color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily,
          lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, margin: s.margin,
          textAlign: s.textAlign,
        }, 3000);
      }

      /* paragraphs */
      if (tag === "p" && el.textContent?.trim()) {
        const prevSib = el.previousElementSibling;
        if (prevSib && ["H1", "H2", "H3"].includes(prevSib.tagName)) {
          addComp(el, "text", "subtitle", clip(el.textContent.trim(), 60), {
            color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight,
            lineHeight: s.lineHeight, maxWidth: s.maxWidth, textAlign: s.textAlign,
          }, 2000);
        } else {
          const parent = el.parentElement;
          if (parent && pf(s.fontSize) <= 16 && el.textContent.trim().length > 20) {
            const parentHasHeading = parent.querySelector("h3, h4, h5, h6");
            if (parentHasHeading) {
              addComp(el, "text", "description", clip(el.textContent.trim(), 60), {
                color: s.color, fontSize: s.fontSize, lineHeight: s.lineHeight,
              }, 2000);
            }
          }
        }
      }
    });

    /* ═══════════════════════════════════════════
       PHASE 2 — LINK DETECTION
       ═══════════════════════════════════════════ */
    document.querySelectorAll("a").forEach((el) => {
      if (!vis(el as HTMLElement)) return;
      const hasSvg = el.querySelector("svg");
      const textContent = getTextDirect(el as HTMLElement) || el.textContent?.trim() || "";
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const dataCtaVariant = el.getAttribute("data-cta-variant");
      const href = el.getAttribute("href") || "";

      if (dataCtaVariant === "linkWithArrow" || (hasSvg && textContent && r.width < 400 && r.height < 60)) {
        addComp(el as HTMLElement, "link-arrow", dataCtaVariant || "arrow", textContent, {
          color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight,
          textDecoration: s.textDecoration, gap: s.gap, display: s.display,
          alignItems: s.alignItems, href,
        }, 4000);
        return;
      }

      const bg = rgbToHex(s.backgroundColor);
      const parentBg = el.parentElement ? rgbToHex(getComputedStyle(el.parentElement).backgroundColor) : null;
      const hasOwnBg = bg && parentBg && bg !== parentBg;
      const hasRadius = pf(s.borderRadius) > 0;
      const hasPad = pf(s.paddingTop) > 4 && pf(s.paddingLeft) > 8;

      if (hasOwnBg && hasRadius && hasPad) {
        addComp(el as HTMLElement, "button", "link-button", textContent || "Link Button", {
          backgroundColor: s.backgroundColor, color: s.color, borderRadius: s.borderRadius,
          padding: s.padding, fontSize: s.fontSize, fontWeight: s.fontWeight,
          border: s.border, boxShadow: s.boxShadow, href,
          transition: s.transition !== "all 0s ease 0s" ? s.transition : "",
        });
      } else if (textContent && r.width > 10 && r.width < 500) {
        addComp(el as HTMLElement, "link", "text", textContent, {
          color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight,
          textDecoration: s.textDecoration, href,
        }, 2000);
      }
    });

    /* ═══════════════════════════════════════════
       PHASE 3 — ICON CONTAINERS
       ═══════════════════════════════════════════ */
    document.querySelectorAll("[data-has-icon], [aria-hidden='true']").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 16 || r.width > 120 || r.height < 16 || r.height > 120) return;
      const hasSvg = el.querySelector("svg");
      const hasImg = el.querySelector("img");
      if (!hasSvg && !hasImg) return;
      const s = getComputedStyle(el);
      const iconTitle = hasSvg?.querySelector("title")?.textContent?.replace(" icon", "") || "";
      addComp(el, "icon-container", "wrapper", iconTitle || "Icon", {
        backgroundColor: s.backgroundColor, borderRadius: s.borderRadius,
        width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px`,
        padding: s.padding, display: s.display, alignItems: s.alignItems,
        justifyContent: s.justifyContent,
        "--image-size": el.style.getPropertyValue("--image-size") || "",
      }, 3000);
    });

    // Standalone SVG icons
    document.querySelectorAll("svg").forEach((svgEl) => {
      const el = svgEl as unknown as HTMLElement;
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.width > 80 || r.height < 8 || r.height > 80) return;
      const parent = el.parentElement;
      if (parent && elementToCompId.has(parent)) return;
      const titleEl = svgEl.querySelector("title");
      const iconName = titleEl?.textContent?.replace(" icon", "").replace(/-/g, " ") || "icon";
      addComp(el, "icon", "svg", iconName, {
        width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px`,
        color: getComputedStyle(el).color, fill: getComputedStyle(el).fill,
      }, 5000);
    });

    /* ═══════════════════════════════════════════
       PHASE 4 — BADGES
       ═══════════════════════════════════════════ */
    all.forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 25 || r.width > 250 || r.height < 14 || r.height > 50) return;
      if (el.children.length > 1 || !el.textContent?.trim()) return;
      const s = getComputedStyle(el);
      const bg = rgbToHex(s.backgroundColor);
      const pBg = el.parentElement ? rgbToHex(getComputedStyle(el.parentElement).backgroundColor) : null;
      if (bg && pBg && bg !== pBg && pf(s.borderRadius) > 3) {
        addComp(el, "badge", "tag", el.textContent.trim(), {
          backgroundColor: s.backgroundColor, color: s.color,
          borderRadius: s.borderRadius, padding: s.padding,
          fontSize: s.fontSize, fontWeight: s.fontWeight,
        }, 1500);
      }
    });

    /* ═══════════════════════════════════════════
       PHASE 5 — CARDS
       ═══════════════════════════════════════════ */
    // Method A: data attribute cards
    document.querySelectorAll("[data-with-border]").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.height < 60) return;
      const s = getComputedStyle(el);
      const heading = el.querySelector("h1,h2,h3,h4,h5,h6");
      const desc = el.querySelector("p");
      const link = el.querySelector("a");
      const icon = el.querySelector("svg, img, [data-has-icon]");
      let cardSubType = "generic";
      if (icon && heading && desc && link) cardSubType = "feature-card";
      else if (heading && desc) cardSubType = "content-card";
      else if (icon && heading) cardSubType = "icon-card";
      addComp(el, "card", cardSubType, heading?.textContent?.trim() || desc?.textContent?.trim()?.slice(0, 40) || "Card", {
        backgroundColor: s.backgroundColor, borderRadius: s.borderRadius,
        boxShadow: s.boxShadow, padding: s.padding, border: s.border,
        width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px`,
        display: s.display, flexDirection: s.flexDirection,
        transition: s.transition !== "all 0s ease 0s" ? s.transition : "",
      }, 12000);
    });

    // Method B: structural detection
    all.forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el) || elementToCompId.has(el)) return;
      const tag = el.tagName.toLowerCase();
      if (["button", "a", "img", "svg", "input", "h1", "h2", "h3", "h4", "h5", "h6", "p", "span"].includes(tag)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.width > 800 || r.height < 80 || r.height > 900) return;
      const s = getComputedStyle(el);
      const hasShadow = s.boxShadow !== "none";
      const hasBorder = s.borderStyle !== "none" && pf(s.borderWidth) > 0;
      const hasRadius = pf(s.borderRadius) > 0;
      const bg = rgbToHex(s.backgroundColor);
      const pBg = el.parentElement ? rgbToHex(getComputedStyle(el.parentElement).backgroundColor) : null;
      const diffBg = bg && pBg && bg !== pBg;
      const kids = el.children.length;
      if ((hasShadow || hasBorder || diffBg) && hasRadius && kids >= 2) {
        const heading = el.querySelector("h1,h2,h3,h4,h5,h6");
        addComp(el, "card", "structural", heading?.textContent?.trim() || el.textContent?.trim()?.slice(0, 80) || "Card", {
          backgroundColor: s.backgroundColor, borderRadius: s.borderRadius,
          boxShadow: s.boxShadow, padding: s.padding, border: s.border,
        }, 8000);
      }
    });

    /* ═══════════════════════════════════════════
       PHASE 6 — TESTIMONIAL / QUOTE BLOCKS
       ═══════════════════════════════════════════ */
    document.querySelectorAll("blockquote, [class*='testimonial'], [class*='quote'], [data-theme]").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el) || elementToCompId.has(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.height < 80) return;

      // Check if it contains quote-like content
      const hasQuote = el.querySelector("blockquote, q, [class*='quote']");
      const hasLongText = el.textContent && el.textContent.trim().length > 100;
      const hasAttribution = el.querySelector("[class*='author'], [class*='name'], cite, figcaption");

      if (el.tagName === "BLOCKQUOTE" || hasQuote || (hasLongText && hasAttribution)) {
        const s = getComputedStyle(el);
        addComp(el, "testimonial", "quote", clip(el.textContent?.trim() || "Quote", 60), {
          backgroundColor: s.backgroundColor, borderRadius: s.borderRadius,
          padding: s.padding, borderLeft: s.borderLeft,
          fontStyle: s.fontStyle, fontSize: s.fontSize,
        }, 10000);
      }
    });

    /* ═══════════════════════════════════════════
       PHASE 7 — TAB / ACCORDION DETECTION
       ═══════════════════════════════════════════ */
    // Tabs: look for role="tablist" or groups of clickable elements that switch content
    document.querySelectorAll("[role='tablist'], [role='tab']").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el)) return;
      const s = getComputedStyle(el);

      if (el.getAttribute("role") === "tablist") {
        const tabs = el.querySelectorAll("[role='tab']");
        addComp(el, "tabs", "tablist", `Tab Group (${tabs.length} tabs)`, {
          display: s.display, gap: s.gap, backgroundColor: s.backgroundColor,
          padding: s.padding, borderRadius: s.borderRadius,
        }, 8000);
      } else if (el.getAttribute("role") === "tab") {
        const isSelected = el.getAttribute("aria-selected") === "true";
        addComp(el, "tabs", isSelected ? "tab-active" : "tab-inactive",
          el.textContent?.trim() || "Tab", {
          backgroundColor: s.backgroundColor, color: s.color,
          padding: s.padding, borderRadius: s.borderRadius,
          fontWeight: s.fontWeight, fontSize: s.fontSize,
          border: s.border, cursor: s.cursor,
        }, 3000);
      }
    });

    // Accordion: look for details/summary or clickable headings with expandable content
    document.querySelectorAll("details, [role='accordion'], [data-accordion]").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el)) return;
      const s = getComputedStyle(el);
      const summary = el.querySelector("summary");
      addComp(el, "accordion", "item", summary?.textContent?.trim() || el.textContent?.trim()?.slice(0, 50) || "Accordion", {
        backgroundColor: s.backgroundColor, borderRadius: s.borderRadius,
        padding: s.padding, border: s.border,
      }, 6000);
    });

    // Generic tab-like detection: siblings that look like tabs
    all.forEach((node) => {
      const parent = node as HTMLElement;
      if (!vis(parent)) return;
      const children = Array.from(parent.children).filter((c) => vis(c as HTMLElement)) as HTMLElement[];
      if (children.length < 2 || children.length > 8) return;

      // Check if all children are similar inline/clickable elements
      const allClickable = children.every((c) => {
        const tag2 = c.tagName.toLowerCase();
        const role = c.getAttribute("role");
        const s2 = getComputedStyle(c);
        return (tag2 === "button" || tag2 === "a" || role === "tab" || s2.cursor === "pointer") && c.textContent!.trim().length < 60;
      });

      if (!allClickable) return;

      const parentS = getComputedStyle(parent);
      const isRow = parentS.display === "flex" && (parentS.flexDirection === "row" || parentS.flexDirection === "");

      if (isRow && !elementToCompId.has(parent)) {
        // Check if one child has different styling (selected state)
        const styles = children.map((c) => {
          const cs = getComputedStyle(c);
          return { bg: rgbToHex(cs.backgroundColor), fw: cs.fontWeight, border: cs.borderBottom };
        });
        const uniqueBgs = new Set(styles.map((s2) => s2.bg));
        const uniqueFws = new Set(styles.map((s2) => s2.fw));

        if (uniqueBgs.size > 1 || uniqueFws.size > 1) {
          addComp(parent, "tabs", "detected-tablist", `Tabs (${children.length})`, {
            display: parentS.display, gap: parentS.gap,
            backgroundColor: parentS.backgroundColor,
            padding: parentS.padding,
          }, 6000);
        }
      }
    });

    /* ═══════════════════════════════════════════
       PHASE 8 — CTA BANNER DETECTION
       ═══════════════════════════════════════════ */
    all.forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el) || elementToCompId.has(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.6 || r.height < 80 || r.height > 500) return;
      const s = getComputedStyle(el);

      const bg = rgbToHex(s.backgroundColor);
      const parentBg = el.parentElement ? rgbToHex(getComputedStyle(el.parentElement).backgroundColor) : null;
      if (!bg || bg === parentBg) return;

      const hasHeading = el.querySelector("h1, h2, h3");
      const hasCta = el.querySelector("a[href], button");
      const childCount = el.children.length;

      if (hasHeading && hasCta && childCount <= 10 && childCount >= 2) {
        const tag = el.tagName.toLowerCase();
        if (!["header", "footer", "nav"].includes(tag)) {
          addComp(el, "cta-banner", "full-width", hasHeading.textContent?.trim()?.slice(0, 60) || "CTA Banner", {
            backgroundColor: s.backgroundColor, padding: s.padding,
            textAlign: s.textAlign, borderRadius: s.borderRadius,
          }, 8000);
        }
      }
    });

    /* ═══════════════════════════════════════════
       PHASE 9 — LOGO DETECTION
       ═══════════════════════════════════════════ */
    document.querySelectorAll("header img, nav img, footer img, [class*='logo'], [id*='logo'], a[href='/'] img, a[href='/'] svg").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.width > 300 || r.height < 10 || r.height > 100) return;

      // Only if it's likely a logo (small image in header/nav area)
      const y = r.y;
      const isTop = y < 200;
      const isFooter = y > document.documentElement.scrollHeight - 600;
      if (isTop || isFooter || el.closest("[class*='logo']")) {
        const s = getComputedStyle(el);
        addComp(el, "logo", isTop ? "header" : isFooter ? "footer" : "inline",
          el.getAttribute("alt") || "Logo", {
          width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px`,
        }, 3000);
      }
    });

    /* ═══════════════════════════════════════════
       PHASE 10 — FOOTER STRUCTURE DETECTION
       ═══════════════════════════════════════════ */
    document.querySelectorAll("footer").forEach((footerEl) => {
      const el = footerEl as HTMLElement;
      if (!vis(el)) return;
      const s = getComputedStyle(el);

      addComp(el, "footer", "mega", "Footer", {
        backgroundColor: s.backgroundColor, padding: s.padding,
        color: s.color,
      }, 20000);

      // Detect footer columns
      const columns = Array.from(el.children).filter((c) => {
        const cr = (c as HTMLElement).getBoundingClientRect();
        return vis(c as HTMLElement) && cr.height > 40;
      }) as HTMLElement[];

      // Look for link groups within footer
      el.querySelectorAll("ul, [class*='column'], [class*='group']").forEach((group) => {
        const g = group as HTMLElement;
        if (!vis(g)) return;
        const links = g.querySelectorAll("a");
        if (links.length >= 3) {
          const heading = g.querySelector("h3, h4, h5, h6, strong, b");
          addComp(g, "footer", "link-group",
            heading?.textContent?.trim() || `Link Group (${links.length})`, {
            display: getComputedStyle(g).display,
          }, 4000);
        }
      });
    });

    /* ═══════════════════════════════════════════
       PHASE 11 — NAVIGATION DETECTION
       ═══════════════════════════════════════════ */
    document.querySelectorAll("header, nav, [role='navigation'], [role='banner']").forEach((nav) => {
      const el = nav as HTMLElement;
      if (!vis(el)) return;
      const s = getComputedStyle(el);
      const isSticky = s.position === "sticky" || s.position === "fixed";
      addComp(el, "navigation", isSticky ? "sticky" : "static", "Navigation", {
        display: s.display, alignItems: s.alignItems, justifyContent: s.justifyContent,
        gap: s.gap, backgroundColor: s.backgroundColor, padding: s.padding,
        position: s.position, top: s.top, zIndex: s.zIndex,
        backdropFilter: (s as any).backdropFilter || "",
        height: `${Math.round(el.getBoundingClientRect().height)}px`,
      }, 15000);
    });

    /* ═══════════════════════════════════════════
       PHASE 12 — SECTION HEADER DETECTION
       ═══════════════════════════════════════════ */
    document.querySelectorAll("h1, h2, h3").forEach((heading) => {
      const h = heading as HTMLElement;
      if (!vis(h)) return;
      const parent = h.parentElement;
      if (!parent) return;
      const nextSib = h.nextElementSibling;
      let subtitle: HTMLElement | null = null;
      if (nextSib && nextSib.tagName === "P" && vis(nextSib as HTMLElement)) {
        subtitle = nextSib as HTMLElement;
      } else if (nextSib && vis(nextSib as HTMLElement)) {
        const innerP = nextSib.querySelector("p");
        if (innerP && vis(innerP as HTMLElement)) subtitle = nextSib as HTMLElement;
      }
      if (subtitle && !elementToCompId.has(parent)) {
        addComp(parent, "section-header", "heading-subtitle",
          h.textContent?.trim()?.slice(0, 60) || "Section Header", {
          textAlign: getComputedStyle(parent).textAlign,
          padding: getComputedStyle(parent).padding,
          maxWidth: getComputedStyle(parent).maxWidth,
        }, 4000);
      }
    });

    /* ═══════════════════════════════════════════
       PHASE 13 — PSEUDO-ELEMENT DETECTION
       ═══════════════════════════════════════════ */
    const pseudoElements: any[] = [];
    all.forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el)) return;

      ["::before", "::after"].forEach((pseudo) => {
        try {
          const ps = getComputedStyle(el, pseudo);
          const content = ps.content;
          if (content && content !== "none" && content !== "normal" && content !== '""') {
            const bg = ps.backgroundColor;
            const bgImage = ps.backgroundImage;
            const hasBg = (bg && bg !== "rgba(0, 0, 0, 0)") || (bgImage && bgImage !== "none");
            const w = pf(ps.width);
            const h = pf(ps.height);

            if (hasBg || w > 2 || h > 2 || content.length > 2) {
              pseudoElements.push({
                selector: pseudo,
                parentTag: el.tagName.toLowerCase(),
                content: clip(content.replace(/['"]/g, ""), 50),
                styles: {
                  backgroundColor: bg,
                  backgroundImage: bgImage !== "none" ? clip(bgImage, 80) : "",
                  width: ps.width, height: ps.height,
                  borderRadius: ps.borderRadius,
                  position: ps.position,
                },
              });
            }
          }
        } catch {}
      });
    });

    /* ═══════════════════════════════════════════
       PHASE 14 — REPEATED PATTERN DETECTION
       ═══════════════════════════════════════════ */
    const processedParents = new Set<HTMLElement>();
    all.forEach((node) => {
      const parent = node as HTMLElement;
      if (!vis(parent) || processedParents.has(parent)) return;
      const visibleChildren = Array.from(parent.children).filter((c) => vis(c as HTMLElement)) as HTMLElement[];
      if (visibleChildren.length < 2) return;

      const groups = new Map<string, HTMLElement[]>();
      visibleChildren.forEach((child) => {
        const fp = structuralFingerprint(child);
        if (!groups.has(fp)) groups.set(fp, []);
        groups.get(fp)!.push(child);
      });

      groups.forEach((children, fp) => {
        if (children.length < 2 || !fp.includes("(")) return;
        const r0 = children[0].getBoundingClientRect();
        if (r0.width < 60 || r0.height < 40) return;

        processedParents.add(parent);
        const patternId = `pattern-${patIdx++}`;
        const compIds: string[] = [];

        let patternName = "";
        const parentParent = parent.parentElement;
        if (parentParent) {
          const sh = parentParent.querySelector("h2, h3");
          if (sh) patternName = sh.textContent?.trim()?.slice(0, 40) || "";
        }
        const firstHeading = children[0].querySelector("h1,h2,h3,h4,h5,h6");
        if (!patternName && firstHeading) patternName = firstHeading.textContent?.trim() || "";

        children.forEach((child, idx) => {
          let existingId = elementToCompId.get(child);
          if (!existingId) {
            const heading2 = child.querySelector("h1,h2,h3,h4,h5,h6");
            const s2 = getComputedStyle(child);
            const hasIcon = !!child.querySelector("svg, img, [data-has-icon]");
            const hasLink = !!child.querySelector("a");
            const hasDesc = !!child.querySelector("p");
            let subType = "pattern-item";
            if (hasIcon && heading2 && hasDesc && hasLink) subType = "feature-card";
            else if (hasIcon && heading2) subType = "icon-card";
            else if (heading2 && hasDesc) subType = "content-card";

            existingId = addComp(child, "card", subType,
              heading2?.textContent?.trim() || child.textContent?.trim()?.slice(0, 50) || `Item ${idx + 1}`, {
              backgroundColor: s2.backgroundColor, borderRadius: s2.borderRadius,
              boxShadow: s2.boxShadow, padding: s2.padding, border: s2.border,
              display: s2.display,
              width: `${Math.round(child.getBoundingClientRect().width)}px`,
              height: `${Math.round(child.getBoundingClientRect().height)}px`,
            }, 12000);
          }

          const comp = components.find((c) => c.id === existingId);
          if (comp) { comp.patternId = patternId; comp.instanceIndex = idx; }
          compIds.push(existingId!);
        });

        // Grid container
        const parentS = getComputedStyle(parent);
        addComp(parent, "layout", "grid", `Grid: ${patternName || `${children.length} items`}`, {
          display: parentS.display, gap: parentS.gap,
          gridTemplateColumns: parentS.gridTemplateColumns,
          flexWrap: parentS.flexWrap,
          "--column-count": parent.style.getPropertyValue("--column-count") || "",
        }, 500);

        patterns.push({
          id: patternId, name: patternName || "Repeated Pattern",
          type: "repeated", instanceCount: children.length,
          structure: describeStructure(children[0]),
          componentIds: compIds,
          templateHtml: generateTemplate(children[0]),
        });
      });
    });

    function describeStructure(el: HTMLElement, indent = 0): string {
      if (indent > 4) return "";
      const tag = el.tagName.toLowerCase();
      const lines: string[] = [];
      const prefix = "  ".repeat(indent);
      let desc = `${prefix}<${tag}>`;
      const role = el.getAttribute("role");
      if (role) desc += ` role="${role}"`;
      if (el.children.length === 0 && el.textContent?.trim()) desc += ` → "${clip(el.textContent.trim(), 30)}"`;
      if (tag === "svg") { desc = `${prefix}<svg> → ${el.querySelector("title")?.textContent || "icon"}`; }
      else if (tag === "img") { desc = `${prefix}<img> alt="${(el as HTMLImageElement).alt || ""}"`; }
      else if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) { desc = `${prefix}<${tag}> → "${clip(el.textContent?.trim() || "", 40)}"`; }
      else if (tag === "a") { const v = el.getAttribute("data-cta-variant") || ""; desc = `${prefix}<a${v ? ` [${v}]` : ""}> → "${clip(el.textContent?.trim() || "", 30)}"`; }
      else if (tag === "p") { desc = `${prefix}<p> → "${clip(el.textContent?.trim() || "", 40)}"`; }
      lines.push(desc);
      if (indent < 4) {
        Array.from(el.children).forEach((child) => {
          if (vis(child as HTMLElement)) lines.push(describeStructure(child as HTMLElement, indent + 1));
        });
      }
      return lines.join("\n");
    }

    function generateTemplate(el: HTMLElement): string {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h, i) => { h.textContent = `{{title${i > 0 ? i + 1 : ""}}}`; });
      clone.querySelectorAll("p").forEach((p, i) => { p.textContent = `{{description${i > 0 ? i + 1 : ""}}}`; });
      clone.querySelectorAll("a").forEach((a) => {
        const tn = Array.from(a.childNodes).find((n) => n.nodeType === 3);
        if (tn) tn.textContent = `{{linkText}}`;
        a.setAttribute("href", "{{href}}");
      });
      clone.querySelectorAll("[data-gtm-tracking]").forEach((e) => e.removeAttribute("data-gtm-tracking"));
      clone.querySelectorAll("[data-extract-id]").forEach((e) => e.removeAttribute("data-extract-id"));
      return clip(clone.outerHTML, 6000);
    }

    /* ═══════════════════════════════════════════
       PHASE 15 — PARENT-CHILD RELATIONSHIPS
       ═══════════════════════════════════════════ */
    components.forEach((comp) => {
      const el = document.querySelector(`[data-extract-id="${comp.id}"]`);
      if (!el) return;
      components.forEach((childComp) => {
        if (childComp.id === comp.id) return;
        const childEl = document.querySelector(`[data-extract-id="${childComp.id}"]`);
        if (!childEl || !el.contains(childEl)) return;
        let closest = childEl.parentElement;
        let closestCompId: string | null = null;
        while (closest && closest !== el) {
          const cid = closest.getAttribute("data-extract-id");
          if (cid && cid !== comp.id && cid !== childComp.id) { closestCompId = cid; break; }
          closest = closest.parentElement!;
        }
        if (!closestCompId) {
          if (!comp.children.includes(childComp.id)) comp.children.push(childComp.id);
          if (!childComp.parentId) childComp.parentId = comp.id;
        }
      });
    });

    /* ═══════════════════════════════════════════
       PHASE 16 — SECTION DETECTION
       ═══════════════════════════════════════════ */
    const sections: any[] = [];

    function tryAddSection(el: HTMLElement, idx: number) {
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag) || r.width < vw * 0.6 || r.height < 30) return;

      let name = tag === "header" || el.querySelector("nav") ? "Header / Navigation"
        : tag === "footer" ? "Footer" : tag === "nav" ? "Navigation" : "";
      if (!name) { const h = el.querySelector("h1,h2,h3"); name = h?.textContent?.trim()?.slice(0, 50) || `Section ${idx + 1}`; }

      const id = `section-${sections.length}`;
      el.setAttribute("data-extract-id", id);
      const childCompIds: string[] = [];
      components.forEach((comp) => {
        const compEl = document.querySelector(`[data-extract-id="${comp.id}"]`);
        if (compEl && el.contains(compEl)) childCompIds.push(comp.id);
      });

      sections.push({
        id, name, tag, rect: absRect(el),
        textPreview: clip(el.textContent?.trim() || "", 400),
        styles: { backgroundColor: getComputedStyle(el).backgroundColor, padding: getComputedStyle(el).padding },
        dataAttributes: getDataAttrs(el),
        childComponentIds: childCompIds,
      });
    }

    const semantics = document.querySelectorAll("header, nav, main > section, main > div, main > article, section, footer, [role='banner'], [role='contentinfo']");
    if (semantics.length >= 3) semantics.forEach((el, i) => tryAddSection(el as HTMLElement, i));
    if (sections.length < 3) {
      const root = document.querySelector("main") || document.querySelector("[role='main']") || document.body;
      const kids = Array.from(root.children) as HTMLElement[];
      const targets = kids.length <= 2 && kids[0]?.children.length > 2 ? Array.from(kids[0].children) as HTMLElement[] : kids;
      targets.forEach((el, i) => tryAddSection(el, i));
    }

    /* ═══════════════════════════════════════════
       PHASE 17 — SVG DEDUP WITH REUSE COUNT
       ═══════════════════════════════════════════ */
    const svgContentMap = new Map<string, { svg: any; count: number }>();
    svgs.forEach((svg) => {
      // Normalize: remove size differences, keep path data
      const paths = svg.html.replace(/width="[^"]*"/g, "").replace(/height="[^"]*"/g, "")
        .replace(/class="[^"]*"/g, "").replace(/id="[^"]*"/g, "").replace(/\s+/g, " ").trim();
      const key = paths.length + "|" + svg.viewBox + "|" + (svg.title || "");
      if (svgContentMap.has(key)) {
        svgContentMap.get(key)!.count++;
      } else {
        svgContentMap.set(key, { svg, count: 1 });
      }
    });
    const uniqueSvgs = Array.from(svgContentMap.values()).map((v) => ({ ...v.svg, reuseCount: v.count }));

    /* dedup images */
    const seenSrc = new Set<string>();
    const uniqueImages = images.filter((img) => { if (seenSrc.has(img.src)) return false; seenSrc.add(img.src); return true; });

    /* dedup gradients */
    const seenGrad = new Set<string>();
    const uniqueGradients = gradientList.filter((g) => { if (seenGrad.has(g.value)) return false; seenGrad.add(g.value); return true; });

    /* ═══════════════════════════════════════════
       BUILD RESULT
       ═══════════════════════════════════════════ */
    return {
      meta: {
        title: document.title, url: window.location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        fullHeight: document.documentElement.scrollHeight,
        favicon: (document.querySelector("link[rel*='icon']") as HTMLLinkElement)?.href || "",
        ogImage: (document.querySelector("meta[property='og:image']") as HTMLMetaElement)?.content || "",
        description: (document.querySelector("meta[name='description']") as HTMLMetaElement)?.content || "",
      },
      tokens: {
        colors: Object.entries(colorMap).map(([hex, d]) => ({ hex, count: d.count, usages: d.usages })).sort((a, b) => b.count - a.count).slice(0, 80),
        gradients: uniqueGradients.slice(0, 20),
        typography: Object.values(typoMap).sort((a: any, b: any) => b.count - a.count).slice(0, 50),
        spacing: Array.from(spacingSet).sort((a, b) => a - b).slice(0, 50),
        radii: Object.entries(radiusMap).map(([v, c]) => ({ value: v, count: c })).sort((a, b) => b.count - a.count).slice(0, 25),
        shadows: Object.entries(shadowMap).map(([v, c]) => ({ value: v, count: c })).sort((a, b) => b.count - a.count).slice(0, 25),
        borders: Object.entries(borderMap).map(([v, c]) => ({ value: v, count: c })).sort((a, b) => b.count - a.count).slice(0, 20),
        transitions: Object.entries(transitionMap).map(([v, c]) => ({ value: v, count: c })).sort((a, b) => b.count - a.count).slice(0, 20),
      },
      components: components.slice(0, 500),
      patterns,
      sections,
      assets: {
        images: uniqueImages.slice(0, 120),
        svgs: uniqueSvgs.slice(0, 100),
        videos: videos.slice(0, 20),
        pseudoElements: pseudoElements.slice(0, 50),
      },
      layoutSystem: {
        containerWidths: Array.from(containerWidths).sort((a, b) => a - b),
      },
    };
  });

  // ── Step 5: Capture hover states ──
  const hoverStates = await captureHoverStates(page, data.components);

  return {
    ...data,
    interactions: { hoverStates },
    cssVariables,
    fontFaces,
    layoutSystem: data.layoutSystem,
  };
}

/* ═══════════════════════════════════════════════════════
   HOVER STATE CAPTURE — runs OUTSIDE page.evaluate
   ═══════════════════════════════════════════════════════ */

async function captureHoverStates(page: Page, components: any[]): Promise<any[]> {
  const hoverStates: any[] = [];
  const seen = new Set<string>();

  // Only check unique interactive components
  const interactive = components.filter((c: any) =>
    ["button", "link-arrow", "link", "card", "tabs"].includes(c.type)
  );

  // Dedup by signature
  const unique = interactive.filter((c: any) => {
    if (seen.has(c.signature)) return false;
    seen.add(c.signature);
    return true;
  });

  for (const comp of unique.slice(0, 30)) {
    try {
      const loc = page.locator(`[data-extract-id="${comp.id}"]`).first();
      if (!(await loc.isVisible({ timeout: 200 }))) continue;

      // Get default styles
      const defaultStyles = await page.evaluate((id: string) => {
        const el = document.querySelector(`[data-extract-id="${id}"]`) as HTMLElement;
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          backgroundColor: s.backgroundColor,
          color: s.color,
          borderColor: s.borderColor,
          boxShadow: s.boxShadow,
          transform: s.transform,
          opacity: s.opacity,
          textDecoration: s.textDecoration,
          outline: s.outline,
        };
      }, comp.id);

      if (!defaultStyles) continue;

      // Hover
      await loc.hover({ timeout: 500 });
      await page.waitForTimeout(350);

      const hoverStyles = await page.evaluate((id: string) => {
        const el = document.querySelector(`[data-extract-id="${id}"]`) as HTMLElement;
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          backgroundColor: s.backgroundColor,
          color: s.color,
          borderColor: s.borderColor,
          boxShadow: s.boxShadow,
          transform: s.transform,
          opacity: s.opacity,
          textDecoration: s.textDecoration,
          outline: s.outline,
        };
      }, comp.id);

      // Move mouse away
      await page.mouse.move(0, 0);

      if (!hoverStyles) continue;

      // Compare
      const changes: Record<string, { from: string; to: string }> = {};
      for (const key of Object.keys(defaultStyles) as (keyof typeof defaultStyles)[]) {
        if (defaultStyles[key] !== hoverStyles[key]) {
          changes[key] = { from: defaultStyles[key], to: hoverStyles[key] };
        }
      }

      if (Object.keys(changes).length > 0) {
        hoverStates.push({
          componentId: comp.id,
          componentType: comp.type,
          componentName: comp.name,
          changes,
        });
      }
    } catch {
      /* skip */
    }
  }

  return hoverStates;
}