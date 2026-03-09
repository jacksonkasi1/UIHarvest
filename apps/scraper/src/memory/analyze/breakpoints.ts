// ** import types
import type { BreakpointToken } from '../ir/types.js';

const MEDIA_REGEX = /@media[^{]*\b(min|max)-width\s*:\s*([\d.]+)(px|em|rem)/g;

function extractFromCSS(css: string): { value: number; raw: string }[] {
  const results: { value: number; raw: string }[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex since MEDIA_REGEX is module-level and reused
  MEDIA_REGEX.lastIndex = 0;
  while ((match = MEDIA_REGEX.exec(css)) !== null) {
    const num = parseFloat(match[2]!);
    const unit = match[3]!;
    const px = unit === 'px' ? num : num * 16;
    if (px > 0 && px < 5000) {
      results.push({ value: Math.round(px), raw: `${match[1]}-width: ${match[2]}${unit}` });
    }
  }

  return results;
}

/**
 * Extract breakpoints from inline CSS in the HTML.
 */
export function analyzeBreakpoints(html: string): BreakpointToken {
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let allCSS = '';

  let match: RegExpExecArray | null;
  while ((match = styleRegex.exec(html)) !== null) {
    allCSS += match[1] + '\n';
  }

  const found = extractFromCSS(allCSS);
  const uniqueValues = [...new Set(found.map((f) => f.value))].sort((a, b) => a - b);
  const uniqueRaw = [...new Set(found.map((f) => f.raw))];

  return { values: uniqueValues, raw: uniqueRaw };
}
