// ** import core packages
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// ** import apis
import { AgentDriver } from "./agent-driver.js";
import { GeminiClient } from "./gemini-client.js";

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

/** A DOM candidate detected by heuristic analysis inside the browser */
interface DomCandidate {
  /** Unique index (used as the numbered label on the annotated screenshot) */
  index: number;
  /** CSS selector path for re-querying */
  selector: string;
  /** Tag name */
  tag: string;
  /** Element ID (if any) */
  elId: string;
  /** Space-separated class list (truncated) */
  classes: string;
  /** ARIA role */
  role: string;
  /** ARIA label */
  ariaLabel: string;
  /** Bounding rect relative to viewport */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Absolute Y position (viewport Y + scrollY) */
  absY: number;
  /** Compact HTML preview */
  htmlPreview: string;
  /** Computed styles */
  styles: Record<string, string>;
  /** Number of direct children */
  childCount: number;
  /** DOM depth from body */
  depth: number;
  /** Whether the element has visual boundaries (bg, border, shadow) */
  hasVisualBoundary: boolean;
  /** Whether element is a semantic landmark */
  isSemantic: boolean;
  /** Number of text nodes / text content length */
  textLength: number;
}

/** Gemini classification result for a numbered element */
interface GeminiClassification {
  /** The element number from the annotated screenshot */
  number: number;
  /** Descriptive name: "Primary CTA Button", "Pricing Card", etc. */
  name: string;
  /** Component category */
  type: string;
  /** More specific sub-type */
  subType: string;
  /** AI confidence 0-100 */
  confidence: number;
  /** Short reason this is a design system component */
  reason: string;
  /** Pattern ID for grouping identical repeated elements */
  patternId: string;
  /** Whether to skip (not a real component) */
  skip: boolean;
}

/** Final vision component output */
interface VisionComponent {
  id: string;
  type: string;
  subType: string;
  name: string;
  html: string;
  rect: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
  dataAttributes: Record<string, string>;
  signature: string;
  structuralSignature: string;
  semanticSlots: any[];
  children: string[];
  parentId: string | null;
  patternId: string | null;
  instanceIndex: number;
  confidence: number;
  screenshot?: string;
  visionName: string;
  visionType: string;
}

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════

/**
 * agent-browser eval returns output wrapped in an extra JSON string layer.
 * Parse once to unwrap, then again to get the value.
 */
function parseEvalResult<T>(raw: string): T {
  let s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      s = JSON.parse(s) as string;
    } catch {}
  }
  return JSON.parse(s) as T;
}

/** Calculate Intersection over Union for two rectangles */
function iou(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const intersection = (x2 - x1) * (y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  return intersection / (areaA + areaB - intersection);
}

// ════════════════════════════════════════════════════
// STEP 1: DOM HEURISTIC COMPONENT DETECTION
//
// Find DOM elements that have visual boundaries making them
// likely standalone UI components (cards, buttons, navbars,
// form fields, badges, hero sections, etc.)
// ════════════════════════════════════════════════════

/**
 * JavaScript to evaluate inside the page. Finds all elements
 * that look like standalone UI components based on visual cues:
 * - Has box-shadow, border, border-radius, distinct background
 * - Is a semantic landmark (nav, header, footer, section, article, form)
 * - Has interactive role (button, link, input)
 * - Has sufficient size to be meaningful
 *
 * Returns an array of DomCandidate objects with bounding rects
 * and computed styles, plus a unique index for numbering.
 */
function buildDomDetectionScript(): string {
  return `
(() => {
  const SKIP = new Set([
    'script','style','noscript','link','meta','br','hr','head',
    'title','base','template','slot','path','use','defs','clippath',
    'lineargradient','mask','symbol','stop','g','circle','rect',
    'line','polyline','polygon','ellipse','text','tspan'
  ]);

  const SEMANTIC = new Set([
    'nav','header','footer','section','article','aside','form',
    'main','dialog','figure','details','summary'
  ]);

  const INTERACTIVE = new Set(['button','a','input','select','textarea']);

  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return null;
    if (rgb.startsWith('#')) return rgb;
    const m = rgb.match(/rgba?\\(\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!m) return null;
    return '#' + [m[1],m[2],m[3]].map(x => parseInt(x).toString(16).padStart(2,'0')).join('');
  }

  function vis(el) {
    try {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' &&
             s.opacity !== '0' && r.width > 0 && r.height > 0;
    } catch { return false; }
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const candidates = [];
  const seen = new Set();
  let idx = 0;

  const all = document.querySelectorAll('*');

  for (const node of all) {
    const el = node;
    if (!vis(el)) continue;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) continue;

    const r = el.getBoundingClientRect();

    // Skip elements fully outside viewport
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;

    // Skip very tiny elements
    if (r.width < 30 || r.height < 20) continue;

    // Skip elements that are basically the full page
    if (r.width > vw * 0.98 && r.height > vh * 2) continue;

    const s = getComputedStyle(el);

    // Detect visual boundary signals
    const bg = rgbToHex(s.backgroundColor);
    const parentBg = el.parentElement ? rgbToHex(getComputedStyle(el.parentElement).backgroundColor) : null;
    const hasOwnBg = bg !== null && bg !== parentBg;
    const hasBorder = s.borderStyle !== 'none' && parseFloat(s.borderWidth) > 0;
    const hasShadow = s.boxShadow !== 'none' && s.boxShadow !== '';
    const hasRadius = parseFloat(s.borderRadius) > 0;
    const hasOutline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    const isSemantic = SEMANTIC.has(tag);
    const isInteractive = INTERACTIVE.has(tag) || el.getAttribute('role') === 'button' ||
                          el.getAttribute('role') === 'tab' || el.getAttribute('role') === 'link';

    // Determine if this element is a component candidate
    const hasVisualBoundary = hasOwnBg || hasBorder || hasShadow || (hasRadius && (hasOwnBg || hasBorder));

    // Score-based filtering: must have at least one reason to be a component
    let score = 0;
    if (hasVisualBoundary) score += 3;
    if (hasShadow) score += 2;
    if (isSemantic) score += 2;
    if (isInteractive) score += 2;
    if (hasRadius && hasOwnBg) score += 1;
    if (hasBorder) score += 1;

    // Check for background-image (gradients, images)
    if (s.backgroundImage && s.backgroundImage !== 'none') score += 1;

    // Bonus for elements with meaningful child content
    const childCount = el.children.length;
    const textLen = (el.textContent || '').trim().length;
    if (childCount >= 2 && textLen > 10) score += 1;

    // Skip if no signals at all
    if (score < 2) continue;

    // Skip if this element is fully contained by an already-found smaller element
    // (prevents capturing massive wrapper divs when we already have the inner card)
    // We handle this via containment dedup later, but skip obvious full-width wrappers here
    if (r.width > vw * 0.95 && !isSemantic && score < 4) continue;

    // Build a unique key to avoid adding the same element twice
    const key = tag + '|' + Math.round(r.x) + '|' + Math.round(r.y) + '|' + Math.round(r.width) + '|' + Math.round(r.height);
    if (seen.has(key)) continue;
    seen.add(key);

    // Build a CSS selector path for re-querying
    let selector = '';
    try {
      if (el.id) {
        selector = '#' + CSS.escape(el.id);
      } else {
        const parts = [];
        let cur = el;
        let depth = 0;
        while (cur && cur !== document.body && depth < 5) {
          let part = cur.tagName.toLowerCase();
          if (cur.id) {
            part = '#' + CSS.escape(cur.id);
            parts.unshift(part);
            break;
          }
          const parent = cur.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
            if (siblings.length > 1) {
              const idx = siblings.indexOf(cur) + 1;
              part += ':nth-of-type(' + idx + ')';
            }
          }
          parts.unshift(part);
          cur = parent;
          depth++;
        }
        selector = parts.join(' > ');
      }
    } catch { selector = tag; }

    let htmlPreview = '';
    try { htmlPreview = el.outerHTML.slice(0, 500); } catch {}

    idx++;
    candidates.push({
      index: idx,
      selector,
      tag,
      elId: el.id || '',
      classes: Array.from(el.classList).slice(0, 5).join(' '),
      role: el.getAttribute('role') || '',
      ariaLabel: (el.getAttribute('aria-label') || '').slice(0, 80),
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
      absY: Math.round(r.y + window.scrollY),
      htmlPreview,
      styles: {
        backgroundColor: s.backgroundColor,
        color: s.color,
        borderRadius: s.borderRadius,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        display: s.display,
        position: s.position,
        boxShadow: s.boxShadow !== 'none' ? s.boxShadow.slice(0, 80) : '',
        border: s.border,
        fontFamily: (s.fontFamily || '').slice(0, 60),
        lineHeight: s.lineHeight,
        gap: s.gap,
      },
      childCount,
      depth: (() => {
        let d = 0; let p = el;
        while (p.parentElement) { d++; p = p.parentElement; }
        return d;
      })(),
      hasVisualBoundary: hasVisualBoundary,
      isSemantic,
      textLength: textLen,
    });

    // Cap at 60 candidates per viewport to keep things manageable
    if (idx >= 60) break;
  }

  return JSON.stringify(candidates);
})()
  `;
}

// ════════════════════════════════════════════════════
// STEP 2: CONTAINMENT DEDUP ON DOM CANDIDATES
//
// Remove parent wrappers that fully contain 2+ child candidates.
// Keep the smaller, more specific components.
// ════════════════════════════════════════════════════

function deduplicateCandidates(candidates: DomCandidate[]): DomCandidate[] {
  // Sort by area descending — check large boxes first
  const sorted = [...candidates].sort(
    (a, b) => b.width * b.height - a.width * a.height
  );

  const keep = new Set<number>(sorted.map((_, i) => i));

  for (let i = 0; i < sorted.length; i++) {
    if (!keep.has(i)) continue;
    const outer = sorted[i];

    let containedCount = 0;
    for (let j = 0; j < sorted.length; j++) {
      if (i === j || !keep.has(j)) continue;
      const inner = sorted[j];
      // Check if outer fully contains inner (with 5px tolerance)
      if (
        inner.x >= outer.x - 5 &&
        inner.y >= outer.y - 5 &&
        inner.x + inner.width <= outer.x + outer.width + 5 &&
        inner.y + inner.height <= outer.y + outer.height + 5
      ) {
        containedCount++;
      }
    }

    // If the outer box contains 2+ distinct child components, drop it
    if (containedCount >= 2 && !outer.isSemantic) {
      keep.delete(i);
    }
  }

  return sorted.filter((_, i) => keep.has(i));
}

// ════════════════════════════════════════════════════
// STEP 3: NUMBERED BOUNDING BOX OVERLAY
//
// Render colored bounding boxes with numbered labels onto
// the screenshot using sharp SVG compositing.
// The annotated image is what Gemini sees.
// ════════════════════════════════════════════════════

/** Color palette for bounding box overlays — high contrast against typical web pages */
const BOX_COLORS = [
  "#FF3B30", "#007AFF", "#34C759", "#FF9500", "#AF52DE",
  "#FF2D55", "#5AC8FA", "#FFCC00", "#00C7BE", "#FF6482",
  "#30B0C7", "#A2845E", "#FF6961", "#77DD77", "#AEC6CF",
  "#FDFD96", "#836953", "#C23B22", "#03C03C", "#779ECB",
];

/**
 * Generates an SVG overlay with numbered bounding boxes and composites
 * it onto the screenshot. Returns the path to the annotated image.
 */
async function createAnnotatedScreenshot(
  screenshotPath: string,
  candidates: DomCandidate[],
  outputPath: string
): Promise<void> {
  const meta = await sharp(screenshotPath).metadata();
  const imgW = meta.width || 1440;
  const imgH = meta.height || 900;

  // Build SVG overlay with bounding boxes and numbered labels
  const boxes = candidates.map((c, i) => {
    const color = BOX_COLORS[i % BOX_COLORS.length];
    const strokeWidth = 3;
    const labelSize = 14;
    const labelPadX = 5;
    const labelPadY = 3;
    const labelText = String(c.index);
    const labelW = labelText.length * 9 + labelPadX * 2;
    const labelH = labelSize + labelPadY * 2;

    // Position label ABOVE the bounding box top-left corner (outside the component)
    // so it doesn't occlude the component content.
    // If there's no room above (box is at top of image), fall back to just outside
    // the top-right corner of the box.
    const labelX = Math.max(0, c.x);
    const labelAbove = c.y - labelH - 2; // 2px gap between label and box edge
    const labelY = labelAbove >= 0 ? labelAbove : Math.max(0, c.y - labelH);

    // If label would still overlap (box is flush with top of image),
    // position it at top-right corner outside the box
    const useTopRight = labelY >= c.y;
    const finalLabelX = useTopRight ? Math.min(c.x + c.width + 2, imgW - labelW) : labelX;
    const finalLabelY = useTopRight ? Math.max(0, c.y) : labelY;

    return `
      <rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}"
            fill="none" stroke="${color}" stroke-width="${strokeWidth}"
            stroke-dasharray="8,4" rx="3" ry="3" opacity="0.9"/>
      <rect x="${finalLabelX}" y="${finalLabelY}" width="${labelW}" height="${labelH}"
            fill="${color}" rx="3" ry="3" opacity="0.95"/>
      <text x="${finalLabelX + labelPadX}" y="${finalLabelY + labelSize + labelPadY / 2}"
            font-family="Arial, Helvetica, sans-serif" font-size="${labelSize}"
            font-weight="bold" fill="white">${labelText}</text>
    `;
  }).join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">${boxes}</svg>`;

  await sharp(screenshotPath)
    .composite([{
      input: Buffer.from(svg),
      top: 0,
      left: 0,
    }])
    .toFile(outputPath);
}

// ════════════════════════════════════════════════════
// STEP 4: GEMINI CLASSIFICATION PROMPT
//
// Send the annotated screenshot to Gemini and ask it to
// classify each numbered element. Gemini does NOT need to
// predict coordinates — the DOM already provides those.
// ════════════════════════════════════════════════════

function buildClassificationPrompt(candidates: DomCandidate[]): string {
  // Build a compact text summary of each numbered element for context
  const elementSummary = candidates.map(c => {
    const parts = [`#${c.index}: <${c.tag}>`,];
    if (c.role) parts.push(`role="${c.role}"`);
    if (c.ariaLabel) parts.push(`aria-label="${c.ariaLabel}"`);
    if (c.classes) parts.push(`class="${c.classes}"`);
    parts.push(`${c.width}x${c.height}px`);
    if (c.styles.backgroundColor && c.styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      parts.push(`bg=${c.styles.backgroundColor}`);
    }
    if (c.styles.boxShadow) parts.push('has-shadow');
    if (c.styles.borderRadius && c.styles.borderRadius !== '0px') {
      parts.push(`radius=${c.styles.borderRadius}`);
    }
    if (c.childCount > 0) parts.push(`${c.childCount} children`);
    return parts.join(' | ');
  }).join('\n');

  return `You are a senior UI/UX design system engineer.

I've annotated a web page screenshot with numbered bounding boxes. Each number corresponds to a DOM element that may be a UI component.

Your task: Look at the screenshot and classify each numbered element. For each one, decide:
1. IS it a standalone design system component? (A card, button, navbar, form field, badge, hero section, etc.)
2. If yes, what TYPE is it and what should it be NAMED in a design system?
3. Should any be SKIPPED because they're just layout wrappers, decorative noise, or not meaningful components?
4. Which elements are REPEATED INSTANCES of the same component pattern?

ELEMENT METADATA (from DOM):
${elementSummary}

CLASSIFICATION RULES:
- Components must be visually self-contained units a designer would extract for a design system
- Skip elements that are just layout wrappers (flex containers, grid wrappers with no visual styling)
- Skip elements that are fragments of a larger component (e.g., just the image inside a card)
- SKIP individual table rows, list items, and repeating data rows — instead mark the PARENT table/list as the component. A single row is not a design system component; the table/list container is.
- SKIP embedded browser chrome elements (URL bars, address bars, browser window decorations inside mockup screenshots). These are part of a demo illustration, not standalone UI components.
- SKIP decorative image containers that just wrap an illustration or screenshot. Only mark media elements if they are standalone components (e.g., an avatar, a logo, a media player).
- Group identical repeated elements with the same patternId (e.g., if #3, #5, #7 are all pricing cards, give them patternId "pricing-card")
- Use CONSISTENT patternId names. Use lowercase-kebab-case. Examples: "feature-card", "nav-link", "payment-method", "cta-button". Do NOT vary the patternId for the same visual pattern.
- Use descriptive names like "Primary Navigation Bar" not "Element 1"
- Assign meaningful types: navigation, card, button, hero, form, input, badge, footer, header, media, tabs, accordion, stat, testimonial, pricing, feature, cta, modal, dropdown, tooltip, avatar, tag, alert, banner, table, list

Return ONLY valid JSON — no markdown, no explanation:
{
  "classifications": [
    {
      "number": 1,
      "name": "Main Navigation Bar",
      "type": "navigation",
      "subType": "top-nav",
      "confidence": 95,
      "reason": "Full-width header with logo, nav links, and CTA button",
      "patternId": "main-nav",
      "skip": false
    },
    {
      "number": 2,
      "name": "",
      "type": "",
      "subType": "",
      "confidence": 0,
      "reason": "Just a flex wrapper div with no visual styling",
      "patternId": "",
      "skip": true
    }
  ]
}`;
}

// ════════════════════════════════════════════════════
// CROSS-VIEWPORT DEDUPLICATION
//
// Remove duplicate components across viewports using
// DOM selector identity + absolute Y position.
// ════════════════════════════════════════════════════

function deduplicateAcrossViewports(
  existing: VisionComponent[],
  newComps: VisionComponent[]
): VisionComponent[] {
  const unique: VisionComponent[] = [];

  for (const comp of newComps) {
    let isDuplicate = false;
    for (const ex of existing) {
      // Primary: same selector = same DOM element
      if (
        comp.signature === ex.signature &&
        Math.abs(comp.rect.y - ex.rect.y) < 30 &&
        Math.abs(comp.rect.x - ex.rect.x) < 30
      ) {
        isDuplicate = true;
        break;
      }
      // Secondary: same name + overlapping position
      if (
        comp.visionName === ex.visionName &&
        Math.abs(comp.rect.y - ex.rect.y) < 20 &&
        Math.abs(comp.rect.x - ex.rect.x) < 20
      ) {
        isDuplicate = true;
        break;
      }
      // Tertiary: high IoU overlap
      const overlap = iou(comp.rect, ex.rect);
      if (overlap > 0.6) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      unique.push(comp);
    }
  }

  return unique;
}

// ════════════════════════════════════════════════════
// PATTERN ID UNIFICATION
//
// Gemini may assign slightly different patternIds across
// viewports for the same semantic component pattern.
// E.g., "summary-row" vs "summary-table-row", or
// "payment-method-row" vs "payment-method".
//
// Unify them by clustering components with matching
// type + subType + similar dimensions, then picking the
// most common patternId within each cluster.
// ════════════════════════════════════════════════════

function unifyPatternIds(components: VisionComponent[]): void {
  // Group components by their structural signature: type + subType + size bucket
  const clusters = new Map<string, VisionComponent[]>();

  for (const comp of components) {
    if (!comp.patternId) continue;
    // Bucket dimensions to ~20px width / ~10px height granularity
    const wBucket = Math.round(comp.rect.width / 20) * 20;
    const hBucket = Math.round(comp.rect.height / 10) * 10;
    const key = `${comp.type}|${comp.subType}|${wBucket}|${hBucket}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(comp);
  }

  // For each cluster with 2+ members, pick the most common patternId
  for (const [, group] of clusters) {
    if (group.length < 2) continue;

    // Count patternId frequencies
    const idCounts = new Map<string, number>();
    for (const comp of group) {
      if (comp.patternId) {
        idCounts.set(comp.patternId, (idCounts.get(comp.patternId) || 0) + 1);
      }
    }

    // Only unify if there are multiple different patternIds
    if (idCounts.size <= 1) continue;

    // Pick the most common one
    let bestId = "";
    let bestCount = 0;
    for (const [id, count] of idCounts) {
      if (count > bestCount) {
        bestId = id;
        bestCount = count;
      }
    }

    // Unify all to the best ID
    const oldIds = [...idCounts.keys()].filter(id => id !== bestId);
    for (const comp of group) {
      if (comp.patternId && comp.patternId !== bestId) {
        comp.patternId = bestId;
      }
    }

    if (oldIds.length > 0) {
      console.log(`    Pattern unification: ${oldIds.join(", ")} → ${bestId}`);
    }
  }
}

// ════════════════════════════════════════════════════
// MAIN EXPORT — DOM-first + Numbered Overlay + Gemini Classification
//
// Architecture:
//   1. SCREENSHOT: Capture clean viewport screenshot
//   2. DOM DETECT: Find candidate components using visual heuristics
//   3. DEDUP:      Remove parent wrappers that contain children
//   4. ANNOTATE:   Overlay numbered bounding boxes on screenshot
//   5. CLASSIFY:   Send annotated image to Gemini for semantic classification
//   6. CROP:       Extract each confirmed component using DOM-precise coords
//   7. SCROLL:     Move to next viewport (30% overlap), repeat
// ════════════════════════════════════════════════════

export async function runVisionLoop(
  driver: AgentDriver,
  gemini: GeminiClient,
  url: string,
  outputDir: string,
  shotsDir: string
): Promise<VisionComponent[]> {
  console.log(`    Vision loop initialized for ${url}`);

  const allComponents: VisionComponent[] = [];
  let viewportCount = 0;
  let scrollY = 0;
  let hasMore = true;
  let globalCompIndex = 0;

  const MAX_VIEWPORTS = 8;

  // Hide sticky/fixed elements to prevent duplicates across viewports
  // (we capture them in viewport 1 only)
  const hideStickyScript = `
    (() => {
      const all = document.querySelectorAll('*');
      const hidden = [];
      for (const el of all) {
        const s = getComputedStyle(el);
        if (s.position === 'fixed' || s.position === 'sticky') {
          el.dataset._visionPrevVis = el.style.visibility || '';
          el.style.visibility = 'hidden';
          hidden.push(el.tagName);
        }
      }
      return JSON.stringify({ hidden: hidden.length });
    })()
  `;

  const restoreStickyScript = `
    (() => {
      const all = document.querySelectorAll('[data-_vision-prev-vis]');
      for (const el of all) {
        el.style.visibility = el.dataset._visionPrevVis || '';
        delete el.dataset._visionPrevVis;
      }
      // Also restore any with the camelCase version
      const all2 = document.querySelectorAll('*');
      for (const el of all2) {
        if ('_visionPrevVis' in el.dataset) {
          el.style.visibility = el.dataset._visionPrevVis || '';
          delete el.dataset._visionPrevVis;
        }
      }
      return JSON.stringify({ restored: true });
    })()
  `;

  while (hasMore && viewportCount < MAX_VIEWPORTS) {
    viewportCount++;
    console.log(
      `\n    Vision pass -- viewport ${viewportCount} (scrollY=${scrollY}px)`
    );

    // Hide sticky elements for viewports after the first
    if (viewportCount > 1) {
      try {
        const hideResult = await driver.evalStdin(hideStickyScript);
        const parsed = parseEvalResult<{ hidden: number }>(hideResult);
        if (parsed.hidden > 0) {
          console.log(`    Hidden ${parsed.hidden} sticky/fixed elements`);
        }
      } catch {}
    }

    // ── Step 1: SCREENSHOT ──────────────────────────────────────────────────
    const screenshotPath = path.join(shotsDir, `vision-vp-${viewportCount}.png`);
    try {
      await driver.screenshot(screenshotPath);
    } catch (e) {
      console.error("    Screenshot failed:", (e as Error).message);
      break;
    }

    if (!fs.existsSync(screenshotPath)) {
      console.error("    Screenshot file not found, stopping");
      break;
    }

    const imgBuffer = fs.readFileSync(screenshotPath);
    const meta = await sharp(screenshotPath).metadata();
    const imgW = meta.width || 1440;
    const imgH = meta.height || 900;
    console.log(`    Screenshot: ${imgW}x${imgH}px (${(imgBuffer.length / 1024).toFixed(0)}KB)`);

    // ── Step 2: DOM DETECTION — find component candidates via heuristics ────
    let candidates: DomCandidate[] = [];
    try {
      const detectScript = buildDomDetectionScript();
      const rawResult = await driver.evalStdin(detectScript);
      candidates = parseEvalResult<DomCandidate[]>(rawResult);
      console.log(`    DOM heuristics found ${candidates.length} candidates`);
    } catch (e) {
      console.error("    DOM detection failed:", (e as Error).message);
      candidates = [];
    }

    if (candidates.length === 0) {
      console.log("    No candidates in this viewport, scrolling...");
    }

    // ── Step 3: CONTAINMENT DEDUP ───────────────────────────────────────────
    if (candidates.length > 1) {
      const beforeCount = candidates.length;
      candidates = deduplicateCandidates(candidates);
      if (candidates.length < beforeCount) {
        console.log(`    Containment dedup: ${beforeCount} -> ${candidates.length} candidates`);
      }
    }

    // Re-index after dedup (so numbers are sequential on the annotated image)
    candidates.forEach((c, i) => { c.index = i + 1; });

    if (candidates.length > 0) {
      // ── Step 4: ANNOTATE — draw numbered bounding boxes on screenshot ─────
      const annotatedPath = path.join(shotsDir, `vision-vp-${viewportCount}-annotated.png`);
      try {
        await createAnnotatedScreenshot(screenshotPath, candidates, annotatedPath);
        console.log(`    Created annotated screenshot with ${candidates.length} numbered boxes`);
      } catch (e) {
        console.error("    Annotation failed:", (e as Error).message);
        // Fall back to unannotated — Gemini can still try with DOM metadata
      }

      // ── Step 5: CLASSIFY — Gemini sees annotated image, classifies elements ─
      let classifications: GeminiClassification[] = [];
      const annotatedExists = fs.existsSync(annotatedPath);

      try {
        const imageToSend = annotatedExists ? annotatedPath : screenshotPath;
        const imgB64 = fs.readFileSync(imageToSend).toString("base64");
        const prompt = buildClassificationPrompt(candidates);

        const result = await gemini.analyzeImageJson<{ classifications: GeminiClassification[] }>(
          imgB64,
          "image/png",
          prompt,
          "You are a design system component classifier. Look at the numbered elements in the annotated screenshot and classify each one. Respond ONLY with valid JSON.",
          { model: "vision" }
        );
        classifications = result.classifications || [];
        const kept = classifications.filter(c => !c.skip).length;
        const skipped = classifications.filter(c => c.skip).length;
        console.log(`    Gemini classified ${classifications.length} elements (${kept} kept, ${skipped} skipped)`);
      } catch (e) {
        console.error("    Gemini classification failed:", (e as Error).message);
        // Fall through — we still have DOM data, just no semantic names
        classifications = [];
      }

      // Build lookup from number -> classification
      const classMap = new Map<number, GeminiClassification>();
      for (const cl of classifications) {
        classMap.set(cl.number, cl);
      }

      // ── Step 6: CROP — extract each confirmed component ───────────────────
      const viewportComps: VisionComponent[] = [];

      for (const candidate of candidates) {
        const classification = classMap.get(candidate.index);

        // Skip if Gemini explicitly said to skip
        if (classification?.skip) {
          console.log(`    [SKIP] #${candidate.index} "${classification.reason}"`);
          continue;
        }

        // If no classification, fall back to DOM-derived type
        const name = classification?.name || `${candidate.tag}${candidate.elId ? '#' + candidate.elId : ''}`;
        const type = classification?.type || (candidate.isSemantic ? candidate.tag : "component");
        const subType = classification?.subType || (candidate.hasVisualBoundary ? "visual" : "detected");
        const confidence = classification?.confidence || (candidate.hasVisualBoundary ? 60 : 40);
        const patternId = classification?.patternId || null;

        // Skip low-confidence items when Gemini didn't classify them
        if (!classification && confidence < 50) continue;

        // Crop rect from DOM-precise coordinates
        const cropRect = {
          x: Math.max(0, candidate.x),
          y: Math.max(0, candidate.y),
          width: Math.min(imgW - Math.max(0, candidate.x), candidate.width),
          height: Math.min(imgH - Math.max(0, candidate.y), candidate.height),
        };

        if (cropRect.width < 20 || cropRect.height < 15) continue;

        globalCompIndex++;
        const compId = `vision-comp-${globalCompIndex}`;
        const shotName = `${compId}.png`;
        const outPath = path.join(shotsDir, shotName);

        try {
          await sharp(screenshotPath) // Crop from clean screenshot, not annotated
            .extract({
              left: cropRect.x,
              top: cropRect.y,
              width: cropRect.width,
              height: cropRect.height,
            })
            .toFile(outPath);
        } catch (e) {
          console.warn(`    Crop failed for #${candidate.index} "${name}":`, (e as Error).message);
          continue;
        }

        const styles = candidate.styles;
        const sig = `${candidate.selector}|${type}|${subType}|${Math.round(cropRect.width / 20) * 20}|${Math.round(cropRect.height / 10) * 10}`;

        viewportComps.push({
          id: compId,
          type,
          subType,
          name,
          html: candidate.htmlPreview,
          rect: {
            x: cropRect.x,
            y: candidate.absY,
            width: cropRect.width,
            height: cropRect.height,
          },
          styles: {
            backgroundColor: styles.backgroundColor || "",
            color: styles.color || "",
            borderRadius: styles.borderRadius || "",
            padding: styles.padding || "",
            fontSize: styles.fontSize || "",
            fontWeight: styles.fontWeight || "",
            display: styles.display || "",
            position: styles.position || "",
            boxShadow: styles.boxShadow || "",
            border: styles.border || "",
            fontFamily: styles.fontFamily || "",
            lineHeight: styles.lineHeight || "",
            gap: styles.gap || "",
          },
          dataAttributes: {},
          signature: sig,
          structuralSignature: `${candidate.tag}|d${candidate.depth}|${candidate.childCount}ch`,
          semanticSlots: [],
          children: [],
          parentId: null,
          patternId,
          instanceIndex: 0,
          confidence,
          screenshot: `screenshots/${shotName}`,
          visionName: name,
          visionType: type,
        });

        const src = classification ? "AI-classified" : "DOM-only";
        console.log(
          `    [${confidence}%] #${candidate.index} "${name}" (${type}/${subType}) ${cropRect.width}x${cropRect.height} [${src}]`
        );
      }

      // Cross-viewport dedup before adding
      const uniqueComps = deduplicateAcrossViewports(allComponents, viewportComps);
      allComponents.push(...uniqueComps);

      if (uniqueComps.length < viewportComps.length) {
        console.log(
          `    Cross-viewport dedup: ${viewportComps.length} -> ${uniqueComps.length} new components`
        );
      }
    }

    // Restore sticky elements before scrolling (so they don't break layout)
    if (viewportCount > 1) {
      try { await driver.evalStdin(restoreStickyScript); } catch {}
    }

    // ── Step 7: SCROLL — 30% overlap to catch boundary components ───────────
    const scrollResult = await driver.evalStdin(`
      (() => {
        const before = window.scrollY;
        window.scrollBy(0, window.innerHeight * 0.70);
        const after = window.scrollY;
        const atBottom = (after + window.innerHeight) >= document.documentElement.scrollHeight - 5;
        return JSON.stringify({ before, after, atBottom, pageH: document.documentElement.scrollHeight });
      })()
    `);

    try {
      const { before, after, atBottom } = parseEvalResult<{
        before: number;
        after: number;
        atBottom: boolean;
      }>(scrollResult);
      if (after <= before || atBottom) {
        hasMore = false;
        console.log(`    Reached bottom of page`);
      } else {
        scrollY = after;
        // Wait for lazy content to load after scroll
        await driver.wait(1000);
      }
    } catch {
      hasMore = false;
    }
  }

  // ── Final: Unify pattern IDs across viewports ─────────────────────────────
  // Gemini may assign slightly different patternIds for the same semantic pattern
  // across different viewports (e.g., "summary-row" vs "summary-table-row").
  // Unify them by clustering on type + subType + similar dimensions.
  unifyPatternIds(allComponents);

  // ── Final: Assign instance indices to pattern groups ──────────────────────
  const patternCounts: Record<string, number> = {};
  for (const comp of allComponents) {
    if (comp.patternId) {
      patternCounts[comp.patternId] = (patternCounts[comp.patternId] || 0) + 1;
      comp.instanceIndex = patternCounts[comp.patternId] - 1;
    }
  }

  console.log(
    `\n    Vision loop done: ${allComponents.length} components across ${viewportCount} viewports`
  );

  // Log pattern groups
  const patterns = Object.entries(patternCounts).filter(([, count]) => count > 1);
  if (patterns.length > 0) {
    console.log(`    Pattern groups:`);
    for (const [id, count] of patterns) {
      console.log(`        ${id}: ${count} instances`);
    }
  }

  return allComponents;
}
