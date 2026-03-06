import type { Page } from "playwright";

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

export interface ExtractedDesignSystem {
  meta: PageMeta;
  tokens: DesignTokens;
  components: DetectedComponent[];
  patterns: DetectedPattern[];
  sections: DetectedSection[];
  assets: ExtractedAssets;
  interactions: { hoverStates: HoverState[] };
  cssVariables: CssVariable[];
  fontFaces: FontFace[];
  layoutSystem: { containerWidths: number[] };
}

interface PageMeta {
  title: string;
  url: string;
  viewport: { width: number; height: number };
  fullHeight: number;
  favicon: string;
  ogImage: string;
  description: string;
}

interface DesignTokens {
  colors: ColorToken[];
  gradients: GradientToken[];
  typography: TypographyToken[];
  spacing: number[];
  radii: CountedValue[];
  shadows: CountedValue[];
  borders: CountedValue[];
  transitions: CountedValue[];
}

interface ColorToken {
  hex: string;
  count: number;
  usages: string[];
}

interface GradientToken {
  value: string;
  element: string;
}

interface TypographyToken {
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  lineHeight: string;
  letterSpacing: string;
  textTransform: string;
  color: string;
  sample: string;
  count: number;
}

interface CountedValue {
  value: string;
  count: number;
}

interface DetectedComponent {
  id: string;
  type: string;
  subType: string;
  name: string;
  html: string;
  rect: Rect;
  styles: Record<string, string>;
  dataAttributes: Record<string, string>;
  signature: string;
  structuralSignature: string;
  semanticSlots: SemanticSlot[];
  children: string[];
  parentId: string | null;
  patternId: string | null;
  instanceIndex: number;
  confidence: number;
  screenshot?: string;
}

interface DetectedPattern {
  id: string;
  name: string;
  type: string;
  fingerprint: string;
  instanceCount: number;
  structure: string;
  componentIds: string[];
  templateHtml: string;
  slots: SemanticSlot[];
  score: number;
}

interface DetectedSection {
  id: string;
  name: string;
  tag: string;
  rect: Rect;
  textPreview: string;
  styles: Record<string, string>;
  dataAttributes: Record<string, string>;
  childComponentIds: string[];
  screenshot?: string;
}

interface SemanticSlot {
  role: string; // icon, title, subtitle, description, action, media, badge, list
  tag: string;
  sample: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ExtractedAssets {
  images: ImageAsset[];
  svgs: SvgAsset[];
  videos: VideoAsset[];
  pseudoElements: PseudoElement[];
}

interface ImageAsset {
  src: string;
  alt: string;
  width: number;
  height: number;
  localPath?: string;
}

interface SvgAsset {
  html: string;
  viewBox: string;
  width: number;
  height: number;
  title: string;
  reuseCount: number;
  localPath?: string;
}

interface VideoAsset {
  tag: string;
  src: string;
  width: number;
  height: number;
  poster: string;
}

interface PseudoElement {
  selector: string;
  parentTag: string;
  content: string;
  styles: Record<string, string>;
}

interface HoverState {
  componentId: string;
  componentType: string;
  componentName: string;
  changes: Record<string, { from: string; to: string }>;
  screenshotHover?: string;
}

interface CssVariable {
  name: string;
  value: string;
  selector: string;
}

interface FontFace {
  family: string;
  weight: string;
  style: string;
  status?: string;
  urls?: string[];
  format?: string;
  localPath?: string;
}

// ════════════════════════════════════════════════════
// MAIN EXPORT
// ════════════════════════════════════════════════════

export async function extractDesignSystem(page: Page): Promise<ExtractedDesignSystem> {
  // Step 1: Scroll to trigger lazy loading
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight + 1200) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          setTimeout(resolve, 1000);
        }
      }, 60);
    });
  });
  await page.waitForTimeout(2500);

  // Step 2: Extract font faces
  const fontFaces = await extractFontFaces(page);

  // Step 3: Extract CSS variables
  const cssVariables = await extractCssVariables(page);

  // Step 4: Main extraction — runs inside browser
  const data = await page.evaluate(() => {
    // ═══════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════

    const SKIP_TAGS = new Set([
      "script", "style", "noscript", "link", "meta", "br", "hr",
      "head", "title", "base", "template", "slot",
    ]);

    const SEMANTIC_TAGS: Record<string, string> = {
      h1: "title", h2: "title", h3: "title", h4: "title", h5: "title", h6: "title",
      p: "text", span: "text", a: "action", button: "action",
      img: "media", video: "media", picture: "media", figure: "media",
      svg: "icon", nav: "navigation", footer: "footer", header: "header",
      ul: "list", ol: "list", li: "list-item",
      input: "input", textarea: "input", select: "input",
      blockquote: "quote", q: "quote", cite: "citation",
      form: "form", label: "label",
    };

    function vis(el: HTMLElement): boolean {
      try {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          s.display !== "none" &&
          s.visibility !== "hidden" &&
          s.opacity !== "0" &&
          r.width > 0 &&
          r.height > 0
        );
      } catch {
        return false;
      }
    }

    function absRect(el: HTMLElement): { x: number; y: number; width: number; height: number } {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y + window.scrollY),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }

    function clip(s: string, n: number): string {
      return s.length > n ? s.slice(0, n) + "…" : s;
    }

    function pf(v: string): number {
      return parseFloat(v) || 0;
    }

    function rgbToHex(rgb: string): string | null {
      if (!rgb || rgb === "transparent" || rgb === "rgba(0, 0, 0, 0)" || rgb === "inherit") return null;
      if (rgb.startsWith("#")) return rgb.toLowerCase();
      const m = rgb.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      return "#" + [m[1], m[2], m[3]].map((x) => parseInt(x).toString(16).padStart(2, "0")).join("");
    }

    function getDataAttrs(el: HTMLElement): Record<string, string> {
      const d: Record<string, string> = {};
      Array.from(el.attributes).forEach((a) => {
        if (
          a.name.startsWith("data-") &&
          !a.name.includes("gtm") &&
          !a.name.includes("tracking") &&
          !a.name.includes("analytics") &&
          a.name !== "data-extract-id"
        ) {
          d[a.name] = a.value;
        }
      });
      return d;
    }

    function getDirectText(el: HTMLElement): string {
      let t = "";
      el.childNodes.forEach((n) => {
        if (n.nodeType === 3) t += n.textContent || "";
      });
      return t.trim();
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fullH = document.documentElement.scrollHeight;

    // ═══════════════════════════════════════════
    // PHASE 1: TOKEN EXTRACTION
    // ═══════════════════════════════════════════

    const colorMap: Record<string, { count: number; usages: string[] }> = {};
    const gradientList: { value: string; element: string }[] = [];
    const typoMap: Record<string, any> = {};
    const spacingSet = new Set<number>();
    const radiusMap: Record<string, number> = {};
    const shadowMap: Record<string, number> = {};
    const borderMap: Record<string, number> = {};
    const transitionMap: Record<string, number> = {};
    const containerWidths = new Set<number>();

    const images: any[] = [];
    const svgs: any[] = [];
    const videos: any[] = [];
    const pseudoElements: any[] = [];

    const all = document.querySelectorAll("*");

    all.forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el)) return;
      const tag = el.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;

      // Colors
      (["color", "backgroundColor", "borderColor", "borderTopColor", "borderBottomColor"] as const).forEach((prop) => {
        const val = s[prop as any];
        const hex = rgbToHex(val);
        if (hex) {
          if (!colorMap[hex]) colorMap[hex] = { count: 0, usages: [] };
          colorMap[hex].count++;
          const usage = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
          if (!colorMap[hex].usages.includes(usage)) colorMap[hex].usages.push(usage);
        }
      });

      // Gradients
      if (s.backgroundImage?.includes("gradient")) {
        gradientList.push({ value: s.backgroundImage, element: tag });
      }

      // Typography
      if (el.childNodes.length > 0 && el.children.length === 0 && el.textContent?.trim()) {
        const key = `${s.fontSize}|${s.fontWeight}|${s.fontFamily.split(",")[0].replace(/['"]/g, "").trim()}`;
        if (!typoMap[key]) {
          typoMap[key] = {
            fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily,
            lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
            textTransform: s.textTransform !== "none" ? s.textTransform : "",
            color: s.color, sample: clip(el.textContent.trim(), 60), count: 0,
          };
        }
        typoMap[key].count++;
      }

      // Spacing
      [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft,
       s.marginTop, s.marginRight, s.marginBottom, s.marginLeft,
       s.gap, s.rowGap, s.columnGap,
      ].forEach((v) => {
        const n = pf(v);
        if (n > 0 && n < 400) spacingSet.add(Math.round(n));
      });

      // Radius
      if (s.borderRadius && s.borderRadius !== "0px") {
        radiusMap[s.borderRadius] = (radiusMap[s.borderRadius] || 0) + 1;
      }

      // Shadow
      if (s.boxShadow && s.boxShadow !== "none") {
        const short = clip(s.boxShadow, 120);
        shadowMap[short] = (shadowMap[short] || 0) + 1;
      }

      // Borders
      if (s.borderStyle !== "none" && pf(s.borderWidth) > 0) {
        const bkey = `${s.borderWidth} ${s.borderStyle} ${rgbToHex(s.borderColor) || s.borderColor}`;
        borderMap[bkey] = (borderMap[bkey] || 0) + 1;
      }

      // Transitions
      if (s.transition && s.transition !== "all 0s ease 0s" && s.transition !== "none" && s.transition.length < 200) {
        transitionMap[s.transition] = (transitionMap[s.transition] || 0) + 1;
      }

      // Container widths
      if (pf(s.maxWidth) > 200 && pf(s.maxWidth) < 2000 && r.width > vw * 0.5) {
        containerWidths.add(Math.round(pf(s.maxWidth)));
      }

      // Images
      if (tag === "img") {
        const src = (el as HTMLImageElement).src || el.getAttribute("src") || "";
        if (src && !src.startsWith("data:")) {
          images.push({
            src, alt: (el as HTMLImageElement).alt || "",
            width: (el as HTMLImageElement).naturalWidth || r.width,
            height: (el as HTMLImageElement).naturalHeight || r.height,
          });
        }
      }
      if (s.backgroundImage && s.backgroundImage !== "none" && !s.backgroundImage.includes("gradient")) {
        const rx = /url\("(.+?)"\)/g;
        let m;
        while ((m = rx.exec(s.backgroundImage))) {
          if (!m[1].startsWith("data:")) images.push({ src: m[1], alt: "", width: r.width, height: r.height });
        }
      }

      // SVGs
      if (tag === "svg" && el.outerHTML.length < 60000) {
        const titleEl = el.querySelector("title");
        svgs.push({
          html: el.outerHTML,
          viewBox: el.getAttribute("viewBox") || "",
          width: r.width, height: r.height,
          title: titleEl?.textContent?.replace(" icon", "").replace(/-/g, " ") || "",
        });
      }

      // Videos
      if (tag === "video" || tag === "iframe") {
        videos.push({
          tag, src: (el as HTMLVideoElement).src || el.getAttribute("src") || "",
          width: r.width, height: r.height,
          poster: (el as HTMLVideoElement).poster || "",
        });
      }

      // Pseudo elements
      ["::before", "::after"].forEach((pseudo) => {
        try {
          const ps = getComputedStyle(el, pseudo);
          const content = ps.content;
          if (content && content !== "none" && content !== "normal" && content !== '""') {
            const bg = ps.backgroundColor;
            const bgImg = ps.backgroundImage;
            const hasBg = (bg && bg !== "rgba(0, 0, 0, 0)") || (bgImg && bgImg !== "none");
            if (hasBg || pf(ps.width) > 2 || pf(ps.height) > 2) {
              pseudoElements.push({
                selector: pseudo, parentTag: tag,
                content: clip(content.replace(/['"]/g, ""), 50),
                styles: { backgroundColor: bg, width: ps.width, height: ps.height, borderRadius: ps.borderRadius },
              });
            }
          }
        } catch {}
      });
    });

    // ═══════════════════════════════════════════
    // PHASE 2: STRUCTURAL FINGERPRINTING
    // ═══════════════════════════════════════════

    // Compute semantic role for an element
    function getSemanticRole(el: HTMLElement): string {
      const tag = el.tagName.toLowerCase();

      // Direct semantic tag
      if (SEMANTIC_TAGS[tag]) return SEMANTIC_TAGS[tag];

      // Check attributes
      const role = el.getAttribute("role");
      if (role === "button" || role === "link") return "action";
      if (role === "navigation") return "navigation";
      if (role === "tab") return "tab";
      if (role === "tablist") return "tab-group";
      if (role === "tabpanel") return "tab-content";

      // Check data attributes
      if (el.hasAttribute("data-has-icon")) return "icon-wrapper";
      if (el.getAttribute("data-cta-variant")) return "action";

      // Check content
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();

      // Small SVG-containing element = icon wrapper
      if (r.width < 80 && r.height < 80 && el.querySelector("svg") && !el.querySelector("p, h1, h2, h3, h4, h5, h6")) {
        return "icon-wrapper";
      }

      return "container";
    }

    // Compute semantic signature (what roles are present in subtree)
    function getSemanticSlots(el: HTMLElement): { role: string; tag: string; sample: string }[] {
      const slots: { role: string; tag: string; sample: string }[] = [];
      const seen = new Set<string>();

      function walk(node: HTMLElement) {
        if (!vis(node)) return;
        const tag = node.tagName.toLowerCase();
        if (SKIP_TAGS.has(tag)) return;

        const role = getSemanticRole(node);

        if (role !== "container" && !seen.has(role)) {
          seen.add(role);
          slots.push({
            role,
            tag,
            sample: clip(node.textContent?.trim() || "", 40),
          });
        }

        // Only recurse into non-semantic children
        if (role === "container" || role === "list") {
          Array.from(node.children).forEach((child) => walk(child as HTMLElement));
        }
      }

      Array.from(el.children).forEach((child) => walk(child as HTMLElement));
      return slots;
    }

    // Compute structural fingerprint — the key algorithm
    function computeFingerprint(el: HTMLElement, maxDepth: number): string {
      function fp(node: HTMLElement, depth: number): string {
        if (depth > maxDepth) return "";
        if (!vis(node)) return "";
        const tag = node.tagName.toLowerCase();
        if (SKIP_TAGS.has(tag)) return "";

        const role = getSemanticRole(node);

        // For semantic elements, use role instead of tag
        const label = role !== "container" ? `[${role}]` : tag;

        // Get meaningful data attributes
        const dataAttrs: string[] = [];
        ["data-with-border", "data-has-icon", "data-cta-variant", "data-columns", "data-theme", "data-full-bleed"].forEach((attr) => {
          if (node.hasAttribute(attr)) dataAttrs.push(attr);
        });
        const attrStr = dataAttrs.length ? `{${dataAttrs.join(",")}}` : "";

        // Get visible children fingerprints
        const childFps = Array.from(node.children)
          .map((c) => fp(c as HTMLElement, depth + 1))
          .filter((f) => f.length > 0);

        if (childFps.length === 0) {
          return `${label}${attrStr}`;
        }

        return `${label}${attrStr}(${childFps.join(",")})`;
      }

      return fp(el, 0);
    }

    // Check if element is a layout-only container
    function isLayoutContainer(el: HTMLElement): boolean {
      const s = getComputedStyle(el);
      const tag = el.tagName.toLowerCase();

      // Semantic tags are never layout containers
      if (["nav", "header", "footer", "main", "article", "section", "aside"].includes(tag)) return false;

      // Has no visual styling of its own
      const hasBg = rgbToHex(s.backgroundColor) !== null;
      const parentBg = el.parentElement ? rgbToHex(getComputedStyle(el.parentElement).backgroundColor) : null;
      const ownBg = hasBg && rgbToHex(s.backgroundColor) !== parentBg;
      const hasBorder = s.borderStyle !== "none" && pf(s.borderWidth) > 0;
      const hasShadow = s.boxShadow !== "none";
      const hasRadius = pf(s.borderRadius) > 0;
      const hasPadding = pf(s.paddingTop) > 0 || pf(s.paddingLeft) > 0;

      // Has visual styling → not a layout container
      if (ownBg || hasBorder || hasShadow) return false;

      // Is a flex/grid wrapper with no visual properties
      const isFlexGrid = s.display === "flex" || s.display === "grid" || s.display === "inline-flex" || s.display === "inline-grid";

      // Single child wrapper → likely layout container
      const visibleChildren = Array.from(el.children).filter((c) => vis(c as HTMLElement));
      if (visibleChildren.length === 1 && !ownBg && !hasBorder && !hasShadow && !hasRadius) {
        return true;
      }

      // Flex/grid with no styling, many children, no text → layout container
      if (isFlexGrid && !ownBg && !hasBorder && !hasPadding && visibleChildren.length > 6) {
        return true;
      }

      return false;
    }

    // Unwrap meaningless wrapper divs to find the "real" component root
    function findComponentRoot(el: HTMLElement): HTMLElement {
      let current = el;
      let depth = 0;

      // Walk UP: if parent is a single-child layout container, use parent instead
      while (depth < 3) {
        const parent = current.parentElement;
        if (!parent || parent === document.body) break;

        const siblings = Array.from(parent.children).filter((c) => vis(c as HTMLElement));
        if (siblings.length === 1 && isLayoutContainer(parent)) {
          current = parent;
          depth++;
        } else {
          break;
        }
      }

      // Walk DOWN: if current is a single-child layout container, use child instead
      depth = 0;
      while (depth < 5) {
        const visChildren = Array.from(current.children).filter((c) => vis(c as HTMLElement));
        if (visChildren.length === 1 && isLayoutContainer(current)) {
          current = visChildren[0] as HTMLElement;
          depth++;
        } else {
          break;
        }
      }

      return current;
    }

    // ═══════════════════════════════════════════
    // PHASE 3: CLUSTER BY FINGERPRINT
    // ═══════════════════════════════════════════

    interface ComponentCluster {
      fingerprint: string;
      elements: HTMLElement[];
      depth: number;
      avgWidth: number;
      avgHeight: number;
      widthVariance: number;
      heightVariance: number;
      slots: { role: string; tag: string; sample: string }[];
      score: number;
      resolvedType: string;
      resolvedSubType: string;
    }

    // Build fingerprint map at multiple depths
    const fingerprintMap = new Map<string, HTMLElement[]>();
    const elementFingerprints = new Map<HTMLElement, string>();

    // Walk all visible elements and compute fingerprints
    const walkElements: HTMLElement[] = [];
    all.forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el)) return;
      const tag = el.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return;
      const r = el.getBoundingClientRect();
      // Skip very tiny elements
      if (r.width < 40 || r.height < 30) return;
      // Skip very large elements (likely page-level containers)
      if (r.width > vw * 0.95 && r.height > fullH * 0.5) return;

      walkElements.push(el);
    });

    // Compute fingerprints at depth 3 (good balance of detail vs generalization)
    walkElements.forEach((el) => {
      const fp = computeFingerprint(el, 3);
      if (fp.length < 5) return; // Skip trivial fingerprints
      if (!fp.includes("(")) return; // Must have children to be a component

      const root = findComponentRoot(el);
      const rootFp = computeFingerprint(root, 3);

      // Use the root's fingerprint
      if (!fingerprintMap.has(rootFp)) fingerprintMap.set(rootFp, []);
      const existing = fingerprintMap.get(rootFp)!;

      // Avoid adding the same element twice
      if (!existing.includes(root)) {
        existing.push(root);
        elementFingerprints.set(root, rootFp);
      }
    });

    // Filter to clusters with 2+ instances
    const clusters: ComponentCluster[] = [];

    fingerprintMap.forEach((elements, fingerprint) => {
      if (elements.length < 2) return;

      // Skip if fingerprint is too simple (just a container with one child type)
      const complexity = (fingerprint.match(/\(/g) || []).length;
      if (complexity < 1) return;

      // Check that elements have similar dimensions
      const rects = elements.map((el) => el.getBoundingClientRect());
      const widths = rects.map((r) => r.width);
      const heights = rects.map((r) => r.height);
      const avgW = widths.reduce((s, w) => s + w, 0) / widths.length;
      const avgH = heights.reduce((s, h) => s + h, 0) / heights.length;
      const wVar = widths.reduce((s, w) => s + Math.abs(w - avgW), 0) / widths.length / Math.max(avgW, 1);
      const hVar = heights.reduce((s, h) => s + Math.abs(h - avgH), 0) / heights.length / Math.max(avgH, 1);

      // Skip if dimensions are wildly inconsistent (>50% variance)
      if (wVar > 0.5 && hVar > 0.5) return;

      // Get semantic slots from first element
      const slots = getSemanticSlots(elements[0]);

      clusters.push({
        fingerprint,
        elements,
        depth: complexity,
        avgWidth: Math.round(avgW),
        avgHeight: Math.round(avgH),
        widthVariance: Math.round(wVar * 100),
        heightVariance: Math.round(hVar * 100),
        slots,
        score: 0,
        resolvedType: "",
        resolvedSubType: "",
      });
    });

    // ═══════════════════════════════════════════
    // PHASE 4: SCORE AND CLASSIFY CLUSTERS
    // ═══════════════════════════════════════════

    clusters.forEach((cluster) => {
      let score = 0;

      // Instance count bonus (more instances = more likely a real component)
      score += Math.min(cluster.elements.length * 10, 50);

      // Structural complexity bonus
      score += Math.min(cluster.depth * 5, 30);

      // Semantic richness bonus
      const hasTitle = cluster.slots.some((s) => s.role === "title");
      const hasText = cluster.slots.some((s) => s.role === "text");
      const hasAction = cluster.slots.some((s) => s.role === "action");
      const hasIcon = cluster.slots.some((s) => s.role === "icon" || s.role === "icon-wrapper");
      const hasMedia = cluster.slots.some((s) => s.role === "media");

      if (hasTitle) score += 15;
      if (hasText) score += 10;
      if (hasAction) score += 10;
      if (hasIcon) score += 8;
      if (hasMedia) score += 8;

      // Dimension consistency bonus
      if (cluster.widthVariance < 10) score += 10;
      if (cluster.heightVariance < 10) score += 10;

      // Size appropriateness
      if (cluster.avgWidth > 100 && cluster.avgWidth < 600) score += 10;
      if (cluster.avgHeight > 50 && cluster.avgHeight < 500) score += 10;

      // Penalize layout containers
      if (cluster.elements.every((el) => isLayoutContainer(el))) {
        score -= 50;
      }

      // Penalize if all elements are direct children of body
      if (cluster.elements.every((el) => el.parentElement === document.body)) {
        score -= 20;
      }

      cluster.score = score;

      // Classify component type based on semantic slots
      if (hasIcon && hasTitle && hasText && hasAction) {
        cluster.resolvedType = "card";
        cluster.resolvedSubType = "feature-card";
      } else if (hasMedia && hasTitle && hasText) {
        cluster.resolvedType = "card";
        cluster.resolvedSubType = "content-card";
      } else if (hasIcon && hasTitle) {
        cluster.resolvedType = "card";
        cluster.resolvedSubType = "icon-card";
      } else if (hasTitle && hasText) {
        cluster.resolvedType = "card";
        cluster.resolvedSubType = "text-card";
      } else if (hasTitle && hasAction) {
        cluster.resolvedType = "card";
        cluster.resolvedSubType = "action-card";
      } else if (hasAction && !hasTitle && !hasText) {
        cluster.resolvedType = "button";
        cluster.resolvedSubType = "repeated-button";
      } else if (hasMedia && !hasTitle) {
        cluster.resolvedType = "media";
        cluster.resolvedSubType = "media-block";
      } else if (cluster.slots.some((s) => s.role === "list-item")) {
        cluster.resolvedType = "list";
        cluster.resolvedSubType = "list-group";
      } else {
        cluster.resolvedType = "component";
        cluster.resolvedSubType = "detected";
      }
    });

    // Sort by score descending
    clusters.sort((a, b) => b.score - a.score);

    // ═══════════════════════════════════════════
    // PHASE 5: RESOLVE OVERLAPS
    // ═══════════════════════════════════════════

    // Remove clusters whose elements are subsets of higher-scoring clusters
    const usedElements = new Set<HTMLElement>();
    const resolvedClusters: ComponentCluster[] = [];

    clusters.forEach((cluster) => {
      // Check if most elements are already used by a higher-scoring cluster
      const unused = cluster.elements.filter((el) => !usedElements.has(el));
      if (unused.length < 2 && cluster.elements.length >= 2) return;

      // Also check if this cluster's elements are all INSIDE elements of a higher-scoring cluster
      const allContained = cluster.elements.every((el) => {
        for (const used of usedElements) {
          if (used.contains(el) && used !== el) return true;
        }
        return false;
      });

      // Allow contained elements if they're significantly different
      if (allContained && cluster.score < 30) return;

      resolvedClusters.push(cluster);
      cluster.elements.forEach((el) => usedElements.add(el));
    });

    // ═══════════════════════════════════════════
    // PHASE 6: BUILD COMPONENTS AND PATTERNS
    // ═══════════════════════════════════════════

    const components: any[] = [];
    const patterns: any[] = [];
    let compIdx = 0;
    let patIdx = 0;
    const elementToCompId = new Map<HTMLElement, string>();

    function addComponent(
      el: HTMLElement,
      type: string,
      subType: string,
      name: string,
      styles: Record<string, string>,
      slots: { role: string; tag: string; sample: string }[],
      confidence: number,
      maxHtml = 10000
    ): string {
      const existing = elementToCompId.get(el);
      if (existing) return existing;

      const id = `comp-${compIdx++}`;
      el.setAttribute("data-extract-id", id);
      elementToCompId.set(el, id);

      const r = absRect(el);
      const fp = elementFingerprints.get(el) || computeFingerprint(el, 2);
      const sig = [type, subType, rgbToHex(styles.backgroundColor || "") || "_",
        styles.borderRadius || "0", Math.round(r.width / 20) * 20, Math.round(r.height / 10) * 10,
      ].join("|");

      components.push({
        id, type, subType, name: clip(name, 80),
        html: clip(el.outerHTML, maxHtml),
        rect: r, styles, dataAttributes: getDataAttrs(el),
        signature: sig, structuralSignature: fp,
        semanticSlots: slots, children: [] as string[],
        parentId: null as string | null,
        patternId: null as string | null,
        instanceIndex: 0, confidence,
      });

      return id;
    }

    // Generate template with placeholders
    function generateTemplate(el: HTMLElement): string {
      const clone = el.cloneNode(true) as HTMLElement;
      let titleIdx = 0, descIdx = 0;

      clone.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
        h.textContent = `{{title${titleIdx > 0 ? titleIdx + 1 : ""}}}`;
        titleIdx++;
      });
      clone.querySelectorAll("p").forEach((p) => {
        p.textContent = `{{description${descIdx > 0 ? descIdx + 1 : ""}}}`;
        descIdx++;
      });
      clone.querySelectorAll("a").forEach((a) => {
        const tn = Array.from(a.childNodes).find((n) => n.nodeType === 3);
        if (tn) tn.textContent = "{{linkText}}";
        a.setAttribute("href", "{{href}}");
      });
      clone.querySelectorAll("img").forEach((img) => {
        img.setAttribute("src", "{{imageSrc}}");
        img.setAttribute("alt", "{{imageAlt}}");
      });

      // Clean up tracking/generated attributes
      clone.querySelectorAll("[data-gtm-tracking]").forEach((e) => e.removeAttribute("data-gtm-tracking"));
      clone.querySelectorAll("[data-extract-id]").forEach((e) => e.removeAttribute("data-extract-id"));

      // Remove hashed class names (css-xxxxx, e1xxxxx patterns)
      clone.querySelectorAll("*").forEach((e) => {
        const classes = Array.from(e.classList).filter((c) =>
          !c.match(/^css-/) && !c.match(/^e[0-9a-z]{5,}/) && !c.match(/^[a-z]{1,2}\d{4,}/)
        );
        if (classes.length > 0) {
          e.className = classes.join(" ");
        } else {
          e.removeAttribute("class");
        }
      });

      return clip(clone.outerHTML, 8000);
    }

    // Describe structure in readable format
    function describeStructure(el: HTMLElement, indent = 0): string {
      if (indent > 5) return "";
      const tag = el.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return "";
      if (!vis(el)) return "";

      const prefix = "  ".repeat(indent);
      const role = getSemanticRole(el);
      const roleStr = role !== "container" ? ` [${role}]` : "";
      const text = el.children.length === 0 && el.textContent?.trim()
        ? ` → "${clip(el.textContent.trim(), 30)}"`
        : "";

      let desc = `${prefix}<${tag}>${roleStr}${text}`;

      if (tag === "svg") {
        const title = el.querySelector("title")?.textContent || "";
        return `${prefix}<svg> [icon] → ${title || "icon"}`;
      }

      const lines = [desc];
      Array.from(el.children).forEach((child) => {
        const childDesc = describeStructure(child as HTMLElement, indent + 1);
        if (childDesc) lines.push(childDesc);
      });

      return lines.join("\n");
    }

    // Process each resolved cluster into components and patterns
    resolvedClusters.forEach((cluster) => {
      if (cluster.score < 10) return;

      const patternId = `pattern-${patIdx++}`;
      const compIds: string[] = [];

      // Get name from the first instance's heading or parent section heading
      let patternName = "";
      const firstHeading = cluster.elements[0].querySelector("h1,h2,h3,h4,h5,h6");
      if (firstHeading) {
        patternName = firstHeading.textContent?.trim()?.slice(0, 40) || "";
      }
      if (!patternName) {
        // Look at parent for a section heading
        const parent = cluster.elements[0].parentElement;
        if (parent?.parentElement) {
          const sectionHeading = parent.parentElement.querySelector(":scope > h2, :scope > h3, :scope > div > h2, :scope > div > h3");
          if (sectionHeading) patternName = sectionHeading.textContent?.trim()?.slice(0, 40) || "";
        }
      }

      cluster.elements.forEach((el, idx) => {
        const heading = el.querySelector("h1,h2,h3,h4,h5,h6");
        const s = getComputedStyle(el);

        const compId = addComponent(
          el,
          cluster.resolvedType,
          cluster.resolvedSubType,
          heading?.textContent?.trim() || el.textContent?.trim()?.slice(0, 50) || `${cluster.resolvedType} ${idx + 1}`,
          {
            backgroundColor: s.backgroundColor,
            borderRadius: s.borderRadius,
            boxShadow: s.boxShadow,
            padding: s.padding,
            border: s.border,
            display: s.display,
            width: `${Math.round(el.getBoundingClientRect().width)}px`,
            height: `${Math.round(el.getBoundingClientRect().height)}px`,
            transition: s.transition !== "all 0s ease 0s" ? clip(s.transition, 100) : "",
          },
          cluster.slots,
          cluster.score,
          12000
        );

        const comp = components.find((c: any) => c.id === compId);
        if (comp) {
          comp.patternId = patternId;
          comp.instanceIndex = idx;
        }
        compIds.push(compId);
      });

      patterns.push({
        id: patternId,
        name: patternName || `${cluster.resolvedType} pattern`,
        type: cluster.resolvedType,
        fingerprint: cluster.fingerprint,
        instanceCount: cluster.elements.length,
        structure: describeStructure(cluster.elements[0]),
        componentIds: compIds,
        templateHtml: generateTemplate(cluster.elements[0]),
        slots: cluster.slots,
        score: cluster.score,
      });
    });

    // ═══════════════════════════════════════════
    // PHASE 7: DETECT STANDALONE COMPONENTS
    // ═══════════════════════════════════════════

    // Navigation
    document.querySelectorAll("header, nav, [role='navigation'], [role='banner']").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el) || elementToCompId.has(el)) return;
      const s = getComputedStyle(el);
      const isSticky = s.position === "sticky" || s.position === "fixed";
      addComponent(el, "navigation", isSticky ? "sticky" : "static", "Navigation", {
        display: s.display, alignItems: s.alignItems, justifyContent: s.justifyContent,
        backgroundColor: s.backgroundColor, padding: s.padding,
        position: s.position, zIndex: s.zIndex,
        height: `${Math.round(el.getBoundingClientRect().height)}px`,
      }, [], 90, 20000);
    });

    // Footer
    document.querySelectorAll("footer, [role='contentinfo']").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el) || elementToCompId.has(el)) return;
      const s = getComputedStyle(el);
      addComponent(el, "footer", "mega", "Footer", {
        backgroundColor: s.backgroundColor, padding: s.padding, color: s.color,
      }, [], 85, 20000);
    });

    // Buttons (atoms)
    document.querySelectorAll("button, [role='button'], [type='submit']").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el) || elementToCompId.has(el)) return;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 15) return;
      addComponent(el, "button", "native", el.textContent?.trim() || "Button", {
        backgroundColor: s.backgroundColor, color: s.color, borderRadius: s.borderRadius,
        padding: s.padding, fontSize: s.fontSize, fontWeight: s.fontWeight,
        border: s.border, cursor: s.cursor,
        width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px`,
      }, [], 60, 3000);
    });

    // Link buttons (styled <a> elements)
    document.querySelectorAll("a").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el) || elementToCompId.has(el)) return;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const text = getDirectText(el) || el.textContent?.trim() || "";
      if (!text || r.width < 20) return;

      const bg = rgbToHex(s.backgroundColor);
      const parentBg = el.parentElement ? rgbToHex(getComputedStyle(el.parentElement).backgroundColor) : null;
      const hasOwnBg = bg && parentBg && bg !== parentBg;
      const hasBtnStyles = hasOwnBg && pf(s.borderRadius) > 0 && pf(s.paddingTop) > 4;
      const hasSvg = el.querySelector("svg");
      const ctaVariant = el.getAttribute("data-cta-variant");

      if (ctaVariant === "linkWithArrow" || (hasSvg && text && r.width < 400 && r.height < 60)) {
        addComponent(el, "link-arrow", ctaVariant || "arrow", text, {
          color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight,
          display: s.display, gap: s.gap,
        }, [], 50, 4000);
      } else if (hasBtnStyles) {
        addComponent(el, "button", "link-button", text, {
          backgroundColor: s.backgroundColor, color: s.color, borderRadius: s.borderRadius,
          padding: s.padding, fontSize: s.fontSize, fontWeight: s.fontWeight,
        }, [], 55, 3000);
      }
    });

    // Headings (as standalone components)
    document.querySelectorAll("h1, h2").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el) || elementToCompId.has(el)) return;
      const s = getComputedStyle(el);
      addComponent(el, "heading", el.tagName.toLowerCase(), el.textContent?.trim() || "Heading", {
        color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight,
        fontFamily: s.fontFamily, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
      }, [], 40, 2000);
    });

    // Tabs
    document.querySelectorAll("[role='tablist']").forEach((node) => {
      const el = node as HTMLElement;
      if (!vis(el) || elementToCompId.has(el)) return;
      const s = getComputedStyle(el);
      const tabs = el.querySelectorAll("[role='tab']");
      addComponent(el, "tabs", "tablist", `Tab Group (${tabs.length})`, {
        display: s.display, gap: s.gap, backgroundColor: s.backgroundColor,
        padding: s.padding, borderRadius: s.borderRadius,
      }, [], 70, 8000);
    });

    // ═══════════════════════════════════════════
    // PHASE 8: BUILD PARENT-CHILD TREE
    // ═══════════════════════════════════════════

    components.forEach((comp: any) => {
      const el = document.querySelector(`[data-extract-id="${comp.id}"]`);
      if (!el) return;

      components.forEach((childComp: any) => {
        if (childComp.id === comp.id) return;
        const childEl = document.querySelector(`[data-extract-id="${childComp.id}"]`);
        if (!childEl || !el.contains(childEl)) return;

        // Check if this is the closest parent component
        let closest = childEl.parentElement;
        let closestCompId: string | null = null;
        while (closest && closest !== el) {
          const cid = closest.getAttribute("data-extract-id");
          if (cid && cid !== comp.id && cid !== childComp.id) {
            closestCompId = cid;
            break;
          }
          closest = closest.parentElement!;
        }

        if (!closestCompId) {
          if (!comp.children.includes(childComp.id)) comp.children.push(childComp.id);
          if (!childComp.parentId) childComp.parentId = comp.id;
        }
      });
    });

    // ═══════════════════════════════════════════
    // PHASE 9: SECTION DETECTION
    // ═══════════════════════════════════════════

    const sections: any[] = [];

    function tryAddSection(el: HTMLElement, idx: number) {
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag) || r.width < vw * 0.6 || r.height < 30) return;

      let name =
        tag === "header" || el.querySelector("nav") ? "Header / Navigation"
        : tag === "footer" ? "Footer"
        : tag === "nav" ? "Navigation"
        : "";

      if (!name) {
        const h = el.querySelector("h1,h2,h3");
        name = h?.textContent?.trim()?.slice(0, 50) || `Section ${idx + 1}`;
      }

      const id = `section-${sections.length}`;
      el.setAttribute("data-extract-id", id);

      const childCompIds: string[] = [];
      components.forEach((comp: any) => {
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

    const semantics = document.querySelectorAll(
      "header, nav, main > section, main > div, main > article, section, footer, [role='banner'], [role='contentinfo']"
    );
    if (semantics.length >= 3) {
      semantics.forEach((el, i) => tryAddSection(el as HTMLElement, i));
    }
    if (sections.length < 3) {
      const root = document.querySelector("main") || document.querySelector("[role='main']") || document.body;
      const kids = Array.from(root.children) as HTMLElement[];
      const targets = kids.length <= 2 && kids[0]?.children.length > 2
        ? Array.from(kids[0].children) as HTMLElement[]
        : kids;
      targets.forEach((el, i) => tryAddSection(el, i));
    }

    // ═══════════════════════════════════════════
    // PHASE 10: DEDUP ASSETS
    // ═══════════════════════════════════════════

    const seenSrc = new Set<string>();
    const uniqueImages = images.filter((img: any) => {
      if (seenSrc.has(img.src)) return false;
      seenSrc.add(img.src);
      return true;
    });

    const svgContentMap = new Map<string, { svg: any; count: number }>();
    svgs.forEach((svg: any) => {
      const norm = svg.html.replace(/width="[^"]*"/g, "").replace(/height="[^"]*"/g, "")
        .replace(/class="[^"]*"/g, "").replace(/id="[^"]*"/g, "").replace(/\s+/g, " ").trim();
      const key = norm.length + "|" + svg.viewBox + "|" + (svg.title || "");
      if (svgContentMap.has(key)) {
        svgContentMap.get(key)!.count++;
      } else {
        svgContentMap.set(key, { svg, count: 1 });
      }
    });
    const uniqueSvgs = Array.from(svgContentMap.values()).map((v) => ({ ...v.svg, reuseCount: v.count }));

    const seenGrad = new Set<string>();
    const uniqueGradients = gradientList.filter((g: any) => {
      if (seenGrad.has(g.value)) return false;
      seenGrad.add(g.value);
      return true;
    });

    // ═══════════════════════════════════════════
    // BUILD RESULT
    // ═══════════════════════════════════════════

    return {
      meta: {
        title: document.title, url: window.location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        fullHeight: fullH, favicon: (document.querySelector("link[rel*='icon']") as HTMLLinkElement)?.href || "",
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
      patterns: patterns.slice(0, 50),
      sections,
      assets: {
        images: uniqueImages.slice(0, 120),
        svgs: uniqueSvgs.slice(0, 100),
        videos: videos.slice(0, 20),
        pseudoElements: pseudoElements.slice(0, 50),
      },
      layoutSystem: { containerWidths: Array.from(containerWidths).sort((a, b) => a - b) },
    };
  });

  // Step 5: Hover states
  const hoverStates = await captureHoverStates(page, data.components);

  return {
    ...data,
    interactions: { hoverStates },
    cssVariables,
    fontFaces,
  };
}

// ════════════════════════════════════════════════════
// EXTERNAL EXTRACTION HELPERS (run outside evaluate)
// ════════════════════════════════════════════════════

async function extractFontFaces(page: Page): Promise<FontFace[]> {
  return page.evaluate(() => {
    const fonts: any[] = [];
    const seen = new Set<string>();
    try {
      document.fonts.forEach((f: any) => {
        const key = `${f.family}|${f.weight}|${f.style}`;
        if (!seen.has(key)) {
          seen.add(key);
          fonts.push({ family: f.family.replace(/['"]/g, ""), style: f.style, weight: f.weight, status: f.status });
        }
      });
    } catch {}
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
              const family = rule.style.getPropertyValue("font-family").replace(/['"]/g, "");
              const weight = rule.style.getPropertyValue("font-weight") || "400";
              const style = rule.style.getPropertyValue("font-style") || "normal";
              const key = `${family}|${weight}|${style}`;
              if (!seen.has(key)) {
                seen.add(key);
                fonts.push({ family, weight, style, urls, format: src.match(/format\(["']?([^"')]+)/)?.[1] || "" });
              }
            }
          });
        } catch {}
      });
    } catch {}
    return fonts;
  });
}

async function extractCssVariables(page: Page): Promise<CssVariable[]> {
  return page.evaluate(() => {
    const vars: any[] = [];
    const seen = new Set<string>();
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
                    vars.push({ name: prop, value: val, selector: rule.selectorText || "" });
                  }
                }
              }
            }
          });
        } catch {}
      });
    } catch {}
    document.querySelectorAll("[data-theme]").forEach((el) => {
      const theme = el.getAttribute("data-theme") || "";
      const key = `--data-theme-${theme}`;
      if (theme && !seen.has(key)) {
        seen.add(key);
        vars.push({ name: `[data-theme="${theme}"]`, value: theme, selector: "data-attribute" });
      }
    });
    return vars.slice(0, 200);
  });
}

async function captureHoverStates(page: Page, components: any[]): Promise<HoverState[]> {
  const hoverStates: HoverState[] = [];
  const seen = new Set<string>();

  const interactive = components.filter((c: any) =>
    ["button", "link-arrow", "card"].includes(c.type) && c.confidence >= 40
  );

  const unique = interactive.filter((c: any) => {
    if (seen.has(c.signature)) return false;
    seen.add(c.signature);
    return true;
  });

  for (const comp of unique.slice(0, 25)) {
    try {
      const loc = page.locator(`[data-extract-id="${comp.id}"]`).first();
      if (!(await loc.isVisible({ timeout: 200 }))) continue;

      const defaultStyles = await page.evaluate((id: string) => {
        const el = document.querySelector(`[data-extract-id="${id}"]`) as HTMLElement;
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          backgroundColor: s.backgroundColor, color: s.color, borderColor: s.borderColor,
          boxShadow: s.boxShadow, transform: s.transform, opacity: s.opacity,
          textDecoration: s.textDecoration,
        };
      }, comp.id);
      if (!defaultStyles) continue;

      await loc.hover({ timeout: 500 });
      await page.waitForTimeout(350);

      const hoverStyles = await page.evaluate((id: string) => {
        const el = document.querySelector(`[data-extract-id="${id}"]`) as HTMLElement;
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          backgroundColor: s.backgroundColor, color: s.color, borderColor: s.borderColor,
          boxShadow: s.boxShadow, transform: s.transform, opacity: s.opacity,
          textDecoration: s.textDecoration,
        };
      }, comp.id);

      await page.mouse.move(0, 0);
      if (!hoverStyles) continue;

      const changes: Record<string, { from: string; to: string }> = {};
      for (const key of Object.keys(defaultStyles) as (keyof typeof defaultStyles)[]) {
        if (defaultStyles[key] !== hoverStyles[key]) {
          changes[key] = { from: defaultStyles[key], to: hoverStyles[key] };
        }
      }

      if (Object.keys(changes).length > 0) {
        hoverStates.push({
          componentId: comp.id, componentType: comp.type,
          componentName: comp.name, changes,
        });
      }
    } catch {}
  }

  return hoverStates;
}
