// ** import types
import type { DesignIR } from '../../ir/types.js';

/**
 * Master skill: tells AI to replicate THIS specific design system.
 */
export function renderDesignSystemSkill(ir: DesignIR, url: string): string {
  const isTailwind = ir.classAnalysis?.isTailwind ?? false;

  return `---
name: design-system
description: Replicate the design system extracted from ${url}. Use these exact tokens, patterns, and structure. Do NOT invent new values.
---

This skill guides replication of an **existing design system** extracted from a live website. You are NOT creating a new design — you are faithfully reproducing this one.

When the user asks you to build UI, components, or pages, ALWAYS reference this design system first.

## Design Tokens

### Colors
${ir.colors.length > 0 ? ir.colors.map((c) => `- **${c.hex}** → \`${c.role}\` — ${c.usage.join(', ') || 'general use'}`).join('\n') : 'No colors extracted.'}

### Typography
${ir.typography.length > 0 ? ir.typography.map((t) => `- **${t.family}** ${t.size}px / weight ${t.weight} → \`${t.role}\``).join('\n') : 'No typography extracted.'}

### Spacing Scale
${ir.spacing.length > 0 ? ir.spacing.map((s) => `- ${s.value}${s.unit}`).join(', ') : 'Not extracted.'}

### Border Radius
${ir.radius.length > 0 ? ir.radius.map((r) => `- ${r.value}${r.unit}`).join(', ') : 'Not extracted.'}

## CSS Variables

${ir.variables && ir.variables.length > 0 ? '```css\n:root {\n' + ir.variables.map((v) => `  ${v.name}: ${v.value};`).join('\n') + '\n}\n```' : 'No CSS custom properties detected.'}

## Framework

${
  isTailwind
    ? `**Tailwind CSS** detected. Use Tailwind utility classes. Top patterns:\n${(
        ir.classAnalysis?.tailwindPatterns ?? []
      )
        .slice(0, 20)
        .map((c) => `\`${c}\``)
        .join(', ')}`
    : 'No Tailwind detected. Use plain CSS or CSS-in-JS with the tokens above.'
}

## Breakpoints

${ir.breakpoints && ir.breakpoints.values.length > 0 ? ir.breakpoints.values.map((bp) => `- **${bp}px**`).join('\n') : 'No breakpoints detected.'}

## Rules

1. **Use ONLY the colors listed above.** Do not introduce new colors.
2. **Use ONLY the font families listed above.** Do not substitute with Inter, Roboto, or system fonts.
3. **Use the spacing scale.** Do not use arbitrary pixel values.
4. **Match the border radius tokens** for consistency.
5. **If Tailwind is detected**, use Tailwind utilities. If not, use CSS variables.
6. **Reference the component patterns** in \`component-patterns.md\` for buttons, cards, nav, etc.
7. **Reference the layout structure** in \`layout-structure.md\` for page sections.

## Anti-Patterns (NEVER do these)

- Do NOT use generic colors (e.g. \`#3B82F6\` blue) unless they match the palette above.
- Do NOT default to Inter, Roboto, or Arial — use the extracted font families.
- Do NOT ignore spacing tokens and use arbitrary values.
- Do NOT create flat, generic "AI slop" layouts — match the site's actual structure.
- Do NOT add decorative elements that don't exist in the original design.
`;
}
