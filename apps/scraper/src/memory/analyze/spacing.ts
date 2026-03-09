// ** import types
import type { SpacingToken, ComputedStyle } from '../ir/types.js';

export function extractSpacing(styles: ComputedStyle[]): SpacingToken[] {
  const spacingMap = new Map<number, string[]>();

  for (const style of styles) {
    const padding = parseSpacingValue(style.properties.padding ?? '');
    const margin = parseSpacingValue(style.properties.margin ?? '');

    for (const value of [...padding, ...margin]) {
      const existing = spacingMap.get(value) ?? [];
      existing.push(style.selector);
      spacingMap.set(value, existing);
    }
  }

  return Array.from(spacingMap.entries()).map(([value, evidence]) => ({
    value,
    unit: 'px' as const,
    evidence,
  }));
}

function parseSpacingValue(value: string): number[] {
  const values: number[] = [];
  const parts = value.split(/\s+/);

  for (const part of parts) {
    const match = part.match(/^([\d.]+)(px|rem|em)$/);
    if (match) {
      const num = parseFloat(match[1] ?? '0');
      values.push(num);
    }
  }

  return values;
}
