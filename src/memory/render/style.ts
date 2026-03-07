// ** import types
import type { DesignIR } from '../ir/types.js';

export function renderStyle(ir: DesignIR): string {
  const colors = ir.colors
    .map((c) => `- **${c.hex}** (${c.role}): ${c.usage.join(', ') || 'No usage specified'}`)
    .join('\n');

  const typography = ir.typography
    .map(
      (t) => `- **${t.family}** ${t.size}px/${t.weight} (${t.role}): Line height ${t.lineHeight}`
    )
    .join('\n');

  const spacing = ir.spacing.map((s) => `- ${s.value}${s.unit}`).join('\n');
  const radius = ir.radius.map((r) => `- ${r.value}${r.unit}`).join('\n');
  const elevation = ir.elevation.map((e) => `- Level ${e.level}: \`${e.shadow}\``).join('\n');

  const sections: string[] = [
    `# Style Guide`,
    `\n## Colors\n`,
    colors || 'No colors extracted',
    `\n## Typography\n`,
    typography || 'No typography extracted',
    `\n## Spacing\n`,
    spacing || 'No spacing tokens extracted',
    `\n## Border Radius\n`,
    radius || 'No radius tokens extracted',
    `\n## Elevation\n`,
    elevation || 'No elevation tokens extracted',
  ];

  if (ir.variables && ir.variables.length > 0) {
    sections.push(`\n## CSS Custom Properties\n`);
    sections.push('```css');
    sections.push(':root {');
    for (const v of ir.variables) {
      sections.push(`  ${v.name}: ${v.value};`);
    }
    sections.push('}');
    sections.push('```');
  }

  if (ir.breakpoints && ir.breakpoints.values.length > 0) {
    sections.push(`\n## Responsive Breakpoints\n`);
    for (const bp of ir.breakpoints.values) {
      sections.push(`- **${bp}px**`);
    }
  }

  if (ir.classAnalysis) {
    if (ir.classAnalysis.isTailwind) {
      sections.push(`\n## Framework Detection\n`);
      sections.push('**Tailwind CSS detected**\n');
      if (ir.classAnalysis.tailwindPatterns.length > 0) {
        sections.push('Top utility patterns:');
        for (const cls of ir.classAnalysis.tailwindPatterns.slice(0, 30)) {
          sections.push(`- \`${cls}\``);
        }
      }
    }
  }

  return sections.join('\n') + '\n';
}
