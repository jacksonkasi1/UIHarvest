// ** import types
import type { DesignIR } from '../../ir/types.js';

/**
 * Color palette skill: exact colors, roles, CSS variables, and rules.
 */
export function renderColorPaletteSkill(ir: DesignIR): string {
  const colorRows = ir.colors.map((c) => {
    const usage = c.usage.length > 0 ? c.usage.join(', ') : 'unspecified';
    return `| \`${c.hex}\` | ${c.role} | ${usage} |`;
  });

  const colorVars =
    ir.variables?.filter((v) =>
      /color|bg|primary|accent|surface|text|muted|brand|theme/i.test(v.name)
    ) ?? [];

  return `---
name: color-palette
description: Exact color palette with roles, CSS variables, and usage rules.
---

## Color Tokens

| Hex | Role | Usage |
|-----|------|-------|
${colorRows.length > 0 ? colorRows.join('\n') : '| — | — | No colors extracted |'}

## Color CSS Variables

${colorVars.length > 0 ? '```css\n:root {\n' + colorVars.map((v) => `  ${v.name}: ${v.value};`).join('\n') + '\n}\n```' : 'No color-related CSS variables detected. Use the hex values directly.'}

## Rules

- **Primary** (\`primary\`): Use for main CTAs, key interactive elements, and brand emphasis.
- **Accent** (\`accent\`): Use for secondary emphasis, highlights, and supporting actions.
- **Surface** (\`surface\`): Use for backgrounds, cards, and container fills.
- **Text** (\`text\`): Use for body copy and primary content.
- **Muted** (\`muted\`): Use for secondary text, placeholders, and disabled states.
- **Status colors**: Use ONLY for their semantic meaning (success, warning, error, info).

## Do

- Use CSS variables when available; fall back to hex values.
- Maintain sufficient contrast between text and background colors.
- Use the primary color sparingly — it should draw attention to key actions.

## Don't

- Don't introduce new colors outside this palette.
- Don't use the primary color for large background areas.
- Don't mix status colors for non-status purposes.
`;
}
