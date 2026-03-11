// ** import types
import type { RadiusToken, ComputedStyle } from '../ir/types.js';

export function extractRadius(styles: ComputedStyle[]): RadiusToken[] {
  const radiusMap = new Map<number, string[]>();

  for (const style of styles) {
    const borderRadius = style.properties.borderRadius ?? '';
    const values = parseRadiusValue(borderRadius);

    for (const value of values) {
      const existing = radiusMap.get(value) ?? [];
      existing.push(style.selector);
      radiusMap.set(value, existing);
    }
  }

  return Array.from(radiusMap.entries()).map(([value, evidence]) => ({
    value,
    unit: 'px' as const,
    evidence,
  }));
}

function parseRadiusValue(value: string): number[] {
  const values: number[] = [];
  const parts = value.split(/\s+/);

  for (const part of parts) {
    const match = part.match(/^([\d.]+)(px|rem|em)$/);
    if (match) {
      const num = parseFloat(match[1] ?? '0');
      if (num > 0) {
        values.push(num);
      }
    }
  }

  return values.length > 0 ? values : [0];
}
