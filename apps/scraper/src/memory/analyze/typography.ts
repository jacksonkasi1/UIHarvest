// ** import types
import type { TypographyToken, ComputedStyle } from '../ir/types.js';

export function extractTypography(styles: ComputedStyle[]): TypographyToken[] {
  const tokenMap = new Map<string, TypographyToken>();

  for (const style of styles) {
    const family = style.properties.fontFamily?.split(',')[0]?.trim() ?? '';
    const size = parseSize(style.properties.fontSize ?? '16px');
    const weight = parseWeight(style.properties.fontWeight ?? '400');
    const lineHeight = parseSize(style.properties.lineHeight ?? '1.5');

    if (family && size > 0) {
      const key = `${family}-${size}-${weight}`;
      const existing = tokenMap.get(key);

      if (existing) {
        existing.evidence.push(style.selector);
      } else {
        tokenMap.set(key, {
          family,
          size,
          weight,
          lineHeight,
          role: 'unknown',
          evidence: [style.selector],
        });
      }
    }
  }

  return Array.from(tokenMap.values());
}

function parseSize(value: string): number {
  const match = value.match(/^([\d.]+)/);
  return match ? parseFloat(match[1] ?? '0') : 0;
}

function parseWeight(value: string): number {
  const num = parseInt(value, 10);
  return isNaN(num) ? 400 : num;
}
