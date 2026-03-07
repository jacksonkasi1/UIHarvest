// ** import types
import type { LayoutPrimitive, ComputedStyle } from '../ir/types.js';

export function extractLayout(styles: ComputedStyle[]): LayoutPrimitive[] {
  const primitives: LayoutPrimitive[] = [];
  const seen = new Set<string>();

  for (const style of styles) {
    const display = style.properties.display ?? '';
    const width = parseWidth(style.properties.width ?? '');
    const maxWidth = parseWidth(style.properties.maxWidth ?? '');

    if (display === 'flex' || display === 'grid') {
      const key = `${display}-${style.selector}`;
      if (!seen.has(key)) {
        primitives.push({
          type: display === 'flex' ? 'flex' : 'grid',
          evidence: [style.selector],
        });
        seen.add(key);
      }
    }

    const containerWidth = maxWidth || width;
    if (containerWidth && containerWidth > 0 && containerWidth < 2000) {
      const key = `container-${containerWidth}`;
      if (!seen.has(key)) {
        primitives.push({
          type: 'container',
          width: containerWidth,
          evidence: [style.selector],
        });
        seen.add(key);
      }
    }
  }

  return primitives;
}

function parseWidth(value: string): number | undefined {
  const match = value.match(/^([\d.]+)px$/);
  return match ? parseFloat(match[1] ?? '0') : undefined;
}
