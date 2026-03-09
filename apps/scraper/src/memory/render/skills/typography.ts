// ** import types
import type { DesignIR } from '../../ir/types.js';

/**
 * Typography skill: font stack, scale, weights, pairing rules.
 */
export function renderTypographySkill(ir: DesignIR): string {
  const families = [...new Set(ir.typography.map((t) => t.family))];
  const headings = ir.typography.filter((t) => t.role === 'heading');
  const body = ir.typography.filter((t) => t.role === 'body');
  const caption = ir.typography.filter((t) => t.role === 'caption');

  const fontVars = ir.variables?.filter((v) => /font|type|heading|body|family/i.test(v.name)) ?? [];

  return `---
name: typography
description: Typography scale, font pairing, and hierarchy rules.
---

## Font Stack

${families.length > 0 ? families.map((f) => `- **${f}**`).join('\n') : 'No font families extracted.'}

## Type Scale

### Headings
${headings.length > 0 ? headings.map((t) => `- **${t.size}px** / weight ${t.weight} / line-height ${t.lineHeight} — \`${t.family}\``).join('\n') : 'No heading styles detected.'}

### Body
${body.length > 0 ? body.map((t) => `- **${t.size}px** / weight ${t.weight} / line-height ${t.lineHeight} — \`${t.family}\``).join('\n') : 'No body styles detected.'}

### Caption / Small
${caption.length > 0 ? caption.map((t) => `- **${t.size}px** / weight ${t.weight} / line-height ${t.lineHeight} — \`${t.family}\``).join('\n') : 'No caption styles detected.'}

## Font CSS Variables

${fontVars.length > 0 ? '```css\n:root {\n' + fontVars.map((v) => `  ${v.name}: ${v.value};`).join('\n') + '\n}\n```' : 'No font-related CSS variables detected.'}

## Rules

- Use the **heading font** for all h1–h6, hero text, and section titles.
- Use the **body font** for paragraphs, lists, and general content.
- Maintain the extracted size scale — do not invent intermediate sizes.
- Weight hierarchy: heavier weights for emphasis, lighter for supporting text.
- Line heights should match the extracted values for rhythm and readability.

## Don't

- Don't substitute with Inter, Roboto, Arial, or system-ui unless they ARE the extracted fonts.
- Don't use more than the 2-3 font families extracted.
- Don't mix heading and body fonts arbitrarily.
- Don't ignore the weight scale — each weight has a purpose.
`;
}
