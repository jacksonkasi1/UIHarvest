// ** import types
import type { ElevationToken, ComputedStyle } from '../ir/types.js';

export function extractElevation(styles: ComputedStyle[]): ElevationToken[] {
  const elevationMap = new Map<string, { level: number; evidence: string[] }>();

  for (const style of styles) {
    const shadow = style.properties.boxShadow ?? '';
    if (shadow && shadow !== 'none') {
      const level = estimateElevationLevel(shadow);
      const existing = elevationMap.get(shadow);

      if (existing) {
        existing.evidence.push(style.selector);
      } else {
        elevationMap.set(shadow, {
          level,
          evidence: [style.selector],
        });
      }
    }
  }

  return Array.from(elevationMap.entries()).map(([shadow, { level, evidence }]) => ({
    shadow,
    level,
    evidence,
  }));
}

function estimateElevationLevel(shadow: string): number {
  const blurMatch = shadow.match(/blur\((\d+)px\)/);
  const blur = blurMatch ? parseInt(blurMatch[1] ?? '0', 10) : 0;
  return Math.min(Math.floor(blur / 4), 10);
}
