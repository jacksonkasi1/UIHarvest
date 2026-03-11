// ** import types
import type { QAChecklist, DesignIR } from '../ir/types.js';

/**
 * Pure (no LLM) QA checklist generator.
 * Builds a checklist from token counts and detected features.
 */
export function generateQAChecklist(ir: Partial<DesignIR>): QAChecklist {
  const items: QAChecklist['items'] = [];

  items.push({
    category: 'Colors',
    checks: [
      `Verify all ${ir.colors?.length ?? 0} extracted colors meet WCAG AA contrast requirements`,
      'Ensure primary color is used only for CTAs and key interactions',
      'Check surface colors render correctly in both light and dark environments',
      'Confirm status colors (success/warning/error) are semantically correct',
    ],
  });

  items.push({
    category: 'Typography',
    checks: [
      `Verify all ${ir.typography?.length ?? 0} typography tokens render at correct sizes`,
      'Confirm heading hierarchy is visually distinct (size + weight differences)',
      'Check body text is readable at 16px+ on all backgrounds',
      'Ensure line heights match extracted values for proper rhythm',
    ],
  });

  items.push({
    category: 'Spacing',
    checks: [
      `Verify ${ir.spacing?.length ?? 0} spacing tokens are applied consistently`,
      'Confirm no arbitrary pixel values are used outside the spacing scale',
      'Check that vertical rhythm is maintained across sections',
    ],
  });

  items.push({
    category: 'Components',
    checks: [
      `Verify all ${ir.components?.length ?? 0} detected components match original styles`,
      'Check interactive elements have visible focus states',
      'Confirm hover/active states are implemented for all interactive components',
      'Verify border radius tokens are applied consistently',
    ],
  });

  if (ir.breakpoints && ir.breakpoints.values.length > 0) {
    items.push({
      category: 'Responsive',
      checks: ir.breakpoints.values.map(
        (bp) => `Test layout at ${bp}px breakpoint`
      ),
    });
  } else {
    items.push({
      category: 'Responsive',
      checks: [
        'Test layout at 320px (mobile), 768px (tablet), 1024px (desktop), 1440px (wide)',
        'Ensure no horizontal overflow at any breakpoint',
        'Verify text remains readable at all viewport sizes',
      ],
    });
  }

  items.push({
    category: 'Accessibility',
    checks: [
      'All interactive elements are keyboard-navigable',
      'Images have descriptive alt text',
      'Form inputs have associated labels',
      'Color is not the only means of conveying information',
    ],
  });

  return { items };
}
