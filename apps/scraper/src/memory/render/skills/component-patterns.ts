// ** import types
import type { DesignIR } from '../../ir/types.js';

/**
 * Component patterns skill: how to build each detected component with code.
 */
export function renderComponentPatternsSkill(ir: DesignIR): string {
  const isTailwind = ir.classAnalysis?.isTailwind ?? false;
  const sections: string[] = [];

  sections.push(`---
name: component-patterns
description: Component recipes with code examples. Replicate these exact patterns.
---

## Detected Components
`);

  if (ir.components.length === 0) {
    sections.push(
      'No components detected. Build components using the design tokens from `design-system.md`.\n'
    );
    return sections.join('\n');
  }

  for (const comp of ir.components) {
    sections.push(`### ${comp.name} (\`${comp.type}\`)\n`);
    sections.push(`**Usage:** ${comp.usage}\n`);

    const snippet = generateComponentSnippet(comp.name, comp.styles, isTailwind);
    if (snippet) {
      sections.push(`**Code example:**\n`);
      sections.push('```html');
      sections.push(snippet);
      sections.push('```\n');
    }

    const keyStyles = extractKeyStyles(comp.styles);
    if (keyStyles.length > 0) {
      sections.push(`**Key styles:**`);
      for (const s of keyStyles) {
        sections.push(`- \`${s.prop}\`: \`${s.value}\``);
      }
      sections.push('');
    }

    if (comp.do.length > 0) sections.push(`**Do:** ${comp.do.join(' | ')}`);
    if (comp.dont.length > 0) sections.push(`**Don't:** ${comp.dont.join(' | ')}`);
    if (comp.constraints.length > 0) sections.push(`**Constraints:** ${comp.constraints.join(' | ')}`);
    sections.push('');
  }

  return sections.join('\n');
}

function generateComponentSnippet(
  name: string,
  styles: Record<string, string>,
  isTailwind: boolean
): string | null {
  const bg = styles.backgroundColor ?? '';
  const color = styles.color ?? '';
  const radius = styles.borderRadius ?? '';
  const padding = styles.padding ?? '';
  const fontSize = styles.fontSize ?? '';
  const fontWeight = styles.fontWeight ?? '';

  if (name.includes('button') || name === 'button') {
    if (isTailwind) {
      return `<button class="bg-[${bg}] text-[${color}] px-6 py-2.5 rounded-[${radius}] font-[${fontWeight}] text-[${fontSize}] hover:opacity-90 transition-colors">\n  Button Label\n</button>`;
    }
    return `<button style="background: ${bg}; color: ${color}; padding: ${padding}; border-radius: ${radius}; font-size: ${fontSize}; font-weight: ${fontWeight}; border: none; cursor: pointer;">\n  Button Label\n</button>`;
  }

  if (name.includes('card')) {
    const shadow = styles.boxShadow ?? 'none';
    if (isTailwind) {
      return `<div class="bg-[${bg}] rounded-[${radius}] p-[${padding}] shadow-[${shadow}]">\n  <h3>Card Title</h3>\n  <p>Card content</p>\n</div>`;
    }
    return `<div style="background: ${bg}; border-radius: ${radius}; padding: ${padding}; box-shadow: ${shadow};">\n  <h3>Card Title</h3>\n  <p>Card content</p>\n</div>`;
  }

  if (name.includes('nav') || name.includes('header')) {
    return `<nav style="display: flex; align-items: center; padding: ${padding}; background: ${bg};">\n  <a href="/">Logo</a>\n  <div style="display: flex; gap: 1rem;">\n    <a href="/about">About</a>\n    <a href="/contact">Contact</a>\n  </div>\n</nav>`;
  }

  return null;
}

function extractKeyStyles(styles: Record<string, string>): { prop: string; value: string }[] {
  const skip = ['display', 'width', 'maxWidth'];
  return Object.entries(styles)
    .filter(
      ([prop, val]) =>
        val && val !== 'none' && val !== 'normal' && val !== '0px' && !skip.includes(prop)
    )
    .slice(0, 8)
    .map(([prop, value]) => ({ prop, value }));
}
