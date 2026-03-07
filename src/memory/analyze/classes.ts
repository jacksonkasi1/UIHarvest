// ** import types
import type { ClassAnalysisToken } from '../ir/types.js';

const TAILWIND_PREFIXES = [
  'bg-', 'text-', 'font-', 'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-',
  'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-',
  'flex', 'grid', 'block', 'inline', 'hidden',
  'w-', 'h-', 'min-w-', 'min-h-', 'max-w-', 'max-h-',
  'rounded', 'border', 'shadow', 'ring', 'gap-', 'space-',
  'items-', 'justify-', 'self-',
  'absolute', 'relative', 'fixed', 'sticky',
  'z-', 'top-', 'right-', 'bottom-', 'left-',
  'overflow-', 'transition', 'duration-', 'ease-',
  'opacity-', 'cursor-', 'pointer-events-',
  'sm:', 'md:', 'lg:', 'xl:', '2xl:',
  'hover:', 'focus:', 'active:', 'dark:',
];

/**
 * Analyze classes from crawled HTML — detects Tailwind usage.
 */
export function analyzeClasses(html: string): ClassAnalysisToken {
  const classAttrRegex = /class="([^"]*)"/g;
  const classFreq = new Map<string, number>();
  const tailwindHits = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = classAttrRegex.exec(html)) !== null) {
    const classes = match[1]!.split(/\s+/).filter(Boolean);
    for (const cls of classes) {
      classFreq.set(cls, (classFreq.get(cls) ?? 0) + 1);

      for (const prefix of TAILWIND_PREFIXES) {
        if (cls === prefix || cls.startsWith(prefix)) {
          tailwindHits.add(cls);
          break;
        }
      }
    }
  }

  const isTailwind = tailwindHits.size >= 5;

  const topClasses = Array.from(classFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([cls]) => cls);

  const tailwindPatterns = Array.from(tailwindHits).sort();

  return { isTailwind, topClasses, tailwindPatterns };
}
