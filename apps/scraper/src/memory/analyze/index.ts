// ** import types
import type { DesignIR, ColorToken, TypographyToken, SpacingToken, RadiusToken, ElevationToken, LayoutPrimitive, ComponentRecipe, CSSVariableToken, MotionToken } from '../ir/types.js';
import { parse, formatHex } from 'culori';

import { analyzeBreakpoints } from './breakpoints.js';
import { analyzeClasses } from './classes.js';

/**
 * Bridge UIHarvest rawData → Partial<DesignIR>
 * Directly maps the already-extracted token arrays — no ComputedStyle needed.
 */
export function runAnalyzeStage(rawData: any): Partial<DesignIR> {
  return {
    colors: bridgeColors(rawData),
    typography: bridgeTypography(rawData),
    spacing: bridgeSpacing(rawData),
    radius: bridgeRadius(rawData),
    elevation: bridgeElevation(rawData),
    layout: bridgeLayout(rawData),
    components: bridgeComponents(rawData),
    variables: bridgeVariables(rawData),
    motion: bridgeMotion(rawData),
    breakpoints: bridgeBreakpoints(rawData),
    classAnalysis: bridgeClassAnalysis(rawData),
  };
}

// ── Colors ───────────────────────────────────────────────────────────────────

function normalizeHex(colorStr: string): string | null {
  try {
    const parsed = parse(colorStr);
    return parsed ? (formatHex(parsed) ?? null) : null;
  } catch {
    return null;
  }
}

function bridgeColors(rawData: any): ColorToken[] {
  const colors: any[] = rawData?.tokens?.colors ?? [];
  return colors.flatMap((c: any) => {
    const hex = normalizeHex(c.hex ?? c.value ?? '');
    if (!hex) return [];
    return [{
      hex,
      role: 'unknown' as const,
      evidence: Array.isArray(c.usages) ? c.usages.slice(0, 6) : [],
      usage: [],
    }];
  });
}

// ── Typography ────────────────────────────────────────────────────────────────

function bridgeTypography(rawData: any): TypographyToken[] {
  const typo: any[] = rawData?.tokens?.typography ?? [];
  return typo.map((t: any): TypographyToken => ({
    family: String(t.fontFamily ?? 'sans-serif').split(',')[0]!.trim().replace(/['"]/g, ''),
    size: parseFloat(String(t.fontSize ?? '16')) || 16,
    weight: parseFloat(String(t.fontWeight ?? '400')) || 400,
    lineHeight: parseFloat(String(t.lineHeight ?? '1.5')) || 1.5,
    role: 'unknown',
    evidence: t.sample ? [t.sample] : [],
  }));
}

// ── Spacing ───────────────────────────────────────────────────────────────────

function bridgeSpacing(rawData: any): SpacingToken[] {
  const spacing: number[] = rawData?.tokens?.spacing ?? [];
  return spacing.map((v: number) => ({ value: v, unit: 'px' as const, evidence: [] }));
}

// ── Radius ────────────────────────────────────────────────────────────────────

function bridgeRadius(rawData: any): RadiusToken[] {
  const radii: any[] = rawData?.tokens?.radii ?? [];
  return radii.flatMap((r: any) => {
    const raw = String(r.value ?? r ?? '0');
    const num = parseFloat(raw);
    if (isNaN(num) || num < 0) return [];
    const unit = raw.includes('rem') ? 'rem' : raw.includes('em') ? 'em' : 'px';
    return [{ value: num, unit: unit as 'px' | 'rem' | 'em', evidence: [] }];
  });
}

// ── Elevation ─────────────────────────────────────────────────────────────────

function inferElevationLevel(shadow: string): number {
  // Heuristic: blur radius determines level
  const match = shadow.match(/(\d+)px\s+(\d+)px\s+(\d+)px/);
  if (!match) return 1;
  const blur = parseInt(match[3] ?? '4', 10);
  if (blur <= 4) return 1;
  if (blur <= 8) return 2;
  if (blur <= 16) return 3;
  if (blur <= 24) return 4;
  return 5;
}

function bridgeElevation(rawData: any): ElevationToken[] {
  const shadows: any[] = rawData?.tokens?.shadows ?? [];
  return shadows.map((s: any) => {
    const shadow = String(s.value ?? s ?? '');
    return { shadow, level: inferElevationLevel(shadow), evidence: [] };
  });
}

// ── Layout ────────────────────────────────────────────────────────────────────

function bridgeLayout(rawData: any): LayoutPrimitive[] {
  const widths: number[] = rawData?.layoutSystem?.containerWidths ?? [];
  return widths.map((w: number) => ({
    type: 'container' as const,
    width: w,
    evidence: [`container width: ${w}px`],
  }));
}

// ── Components ────────────────────────────────────────────────────────────────

const COMPONENT_TYPE_MAP: Record<string, ComponentRecipe['type']> = {
  button: 'button',
  input: 'input',
  textarea: 'input',
  select: 'input',
  card: 'card',
  table: 'table',
  modal: 'modal',
  dialog: 'modal',
  nav: 'navigation',
  navigation: 'navigation',
  header: 'navigation',
  form: 'form',
};

function bridgeComponents(rawData: any): ComponentRecipe[] {
  const comps: any[] = rawData?.components ?? [];
  return comps
    .filter((c: any) => c.styles && typeof c.styles === 'object')
    .slice(0, 40)
    .map((c: any): ComponentRecipe => {
      const rawType = String(c.type ?? 'unknown').toLowerCase();
      const type = COMPONENT_TYPE_MAP[rawType] ?? 'unknown';
      return {
        type,
        name: String(c.name ?? c.subType ?? c.type ?? 'component'),
        styles: c.styles as Record<string, string>,
        usage: '',
        constraints: [],
        do: [],
        dont: [],
      };
    });
}

// ── CSS Variables ─────────────────────────────────────────────────────────────

function bridgeVariables(rawData: any): CSSVariableToken[] {
  const vars: any[] = rawData?.cssVariables ?? [];
  return vars.map((v: any): CSSVariableToken => ({
    name: String(v.name ?? ''),
    value: String(v.value ?? ''),
    source: (v.selector === ':root' ? 'root' : 'body') as 'root' | 'body',
  }));
}

// ── Motion ────────────────────────────────────────────────────────────────────

function bridgeMotion(rawData: any): MotionToken[] {
  const transitions: any[] = rawData?.tokens?.transitions ?? [];
  return transitions.map((t: any): MotionToken => ({
    selector: 'detected',
    property: 'transition',
    value: String(t.value ?? t ?? ''),
  }));
}

// ── Breakpoints ───────────────────────────────────────────────────────────────

function bridgeBreakpoints(rawData: any): DesignIR['breakpoints'] {
  // Try to extract from inline HTML if available
  const html: string = rawData?.html ?? rawData?.rawHtml ?? '';
  if (html) {
    return analyzeBreakpoints(html);
  }
  return { values: [], raw: [] };
}

// ── Class Analysis ────────────────────────────────────────────────────────────

function bridgeClassAnalysis(rawData: any): DesignIR['classAnalysis'] {
  const html: string = rawData?.html ?? rawData?.rawHtml ?? '';
  if (html) {
    return analyzeClasses(html);
  }
  // Fallback: check if cssVariables or class names hint at Tailwind
  const vars: any[] = rawData?.cssVariables ?? [];
  const isTailwind = vars.some((v: any) => String(v.name ?? '').startsWith('--tw-'));
  return { isTailwind, topClasses: [], tailwindPatterns: [] };
}
