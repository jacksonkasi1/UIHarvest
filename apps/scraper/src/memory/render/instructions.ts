// ** import types
import type { DesignIR } from '../ir/types.js';

export function renderInstructions(ir: DesignIR, url: string): string {
  const varCount = ir.variables?.length ?? 0;
  const motionCount = ir.motion?.length ?? 0;
  const isTailwind = ir.classAnalysis?.isTailwind ? 'Yes' : 'No';

  return `# Design Memory — ${url}

## What is this?

This folder contains a **design system** extracted from a live website. An AI (or a human) can use these files to **replicate the original design** with 90%+ accuracy.

## Quick Start

**For AI assistants (Claude, Cursor, ChatGPT):**
1. Read \`skills/design-system.md\` first — it has the rules and tokens.
2. Reference \`reference.md\` for a single-file overview of everything.
3. Use the individual skill files for deep dives on specific areas.

**For humans:**
1. Start with \`reference.md\` for the full picture.
2. Copy the CSS variables from \`style.md\` into your project.
3. Follow component recipes in \`components.md\`.

## What's inside

### Core files
- \`reference.md\` — **Single consolidated reference** (paste into any AI prompt)
- \`style.md\` — Colors, typography, spacing, radius, elevation, CSS variables
- \`components.md\` — Component recipes with usage, do/don't
- \`layout.md\` — Layout primitives and page structure
- \`principles.md\` — Design doctrine (hierarchy, principles, constraints)
- \`motion.md\` — Motion and animation patterns
- \`qa.md\` — QA checklist

### Skills (for AI replication)
- \`skills/design-system.md\` — **Master skill**: tokens + rules + anti-patterns
- \`skills/color-palette.md\` — Color roles, CSS variables, usage rules
- \`skills/typography.md\` — Font stack, scale, pairing rules
- \`skills/component-patterns.md\` — Component code examples
- \`skills/layout-structure.md\` — Section-by-section layout
- \`skills/motion-guidelines.md\` — Transitions and timing

## Extracted summary

- **${ir.colors.length}** color tokens
- **${ir.typography.length}** typography tokens
- **${ir.spacing.length}** spacing tokens
- **${ir.radius.length}** radius tokens
- **${ir.elevation.length}** elevation tokens
- **${ir.components.length}** component recipes
- **${varCount}** CSS custom properties
- **${motionCount}** motion tokens
- **Tailwind detected:** ${isTailwind}
`;
}
