// ** import types
import type { DesignIR } from '../ir/types.js';

export function renderQA(ir: DesignIR): string {
  const items = ir.qa.items
    .map(
      (item) => `## ${item.category}\n\n${item.checks.map((check) => `- [ ] ${check}`).join('\n')}`
    )
    .join('\n\n');

  if (items) {
    return `# QA Checklist

${items}

## General Checks

- [ ] All colors meet contrast requirements
- [ ] Typography is readable at all sizes
- [ ] Spacing is consistent
- [ ] Components follow established patterns
`;
  }

  return `# QA Checklist

## General Checks

- [ ] All colors meet contrast requirements (${ir.colors.length} colors found)
- [ ] Typography is readable at all sizes (${ir.typography.length} tokens found)
- [ ] Spacing is consistent (${ir.spacing.length} spacing tokens found)
- [ ] Components follow established patterns (${ir.components.length} components found)
- [ ] Border radius values are consistent (${ir.radius.length} radius tokens found)
- [ ] Elevation/shadow usage is appropriate (${ir.elevation.length} elevation tokens found)
`;
}
