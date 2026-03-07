// ** import core packages
import { parse, formatHex } from 'culori';

// ** import types
import type { ColorToken, ComputedStyle } from '../ir/types.js';

export function extractColors(styles: ComputedStyle[]): ColorToken[] {
  const colorMap = new Map<string, string[]>();

  for (const style of styles) {
    const bg = style.properties.backgroundColor;
    const fg = style.properties.color;

    if (bg) {
      const hex = normalizeColor(bg);
      if (hex) {
        const evidence = colorMap.get(hex) ?? [];
        evidence.push(`${style.selector} background`);
        colorMap.set(hex, evidence);
      }
    }

    if (fg) {
      const hex = normalizeColor(fg);
      if (hex) {
        const evidence = colorMap.get(hex) ?? [];
        evidence.push(`${style.selector} text`);
        colorMap.set(hex, evidence);
      }
    }
  }

  return Array.from(colorMap.entries()).map(([hex, evidence]) => ({
    hex,
    role: 'unknown',
    evidence,
    usage: [],
  }));
}

function normalizeColor(color: string): string | null {
  try {
    const parsed = parse(color);
    return parsed ? formatHex(parsed) : null;
  } catch {
    return null;
  }
}
