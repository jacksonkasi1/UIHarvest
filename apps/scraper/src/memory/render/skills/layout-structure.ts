// ** import types
import type { DesignIR } from '../../ir/types.js';

/**
 * Layout structure skill: section-by-section layout with breakpoints.
 */
export function renderLayoutStructureSkill(ir: DesignIR): string {
  const sections: string[] = [];

  sections.push(`---
name: layout-structure
description: Page layout structure, section order, and responsive breakpoints.
---

## Page Structure
`);

  if (ir.layout.length > 0) {
    for (const l of ir.layout) {
      const parts = [`**${l.type}**`];
      if (l.width) parts.push(`width: ${l.width}px`);
      if (l.breakpoints?.length) parts.push(`breakpoints: ${l.breakpoints.join(', ')}px`);
      sections.push(`- ${parts.join(', ')} (${l.evidence.join(', ')})`);
    }
  } else {
    sections.push(
      'No layout primitives detected. Use the design tokens and component patterns to infer layout.'
    );
  }
  sections.push('');

  sections.push(`## Responsive Breakpoints\n`);
  if (ir.breakpoints && ir.breakpoints.values.length > 0) {
    for (const bp of ir.breakpoints.values) {
      sections.push(`- **${bp}px**`);
    }
  } else {
    sections.push('No breakpoints extracted. Use common breakpoints: 640, 768, 1024, 1280px.');
  }

  sections.push(`
## Rules

- Follow the section order exactly as listed above.
- Match padding, max-width, and background colors per section.
- Use the detected layout pattern (grid, flex, centered, etc.) for each section.
- Responsive: stack columns on mobile, use the breakpoints above for transitions.
- Maintain visual hierarchy: hero → content sections → footer.
`);

  return sections.join('\n');
}
