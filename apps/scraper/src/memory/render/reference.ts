// ** import types
import type { DesignIR } from '../ir/types.js';

/**
 * Single consolidated reference.md — everything an AI needs in one context window.
 */
export function renderReference(ir: DesignIR, url: string): string {
  const s: string[] = [];

  s.push(`# Design Reference — ${url}\n`);
  s.push(`> This is a consolidated design reference. Use these exact values when building UI.\n`);

  // 1. CSS Variables (code-ready)
  s.push(`## Design Tokens (CSS Variables)\n`);
  s.push('```css');
  s.push(':root {');
  s.push(`  /* Colors */`);
  for (const c of ir.colors) {
    const varName = `--color-${c.role.replace(/\s+/g, '-')}`;
    s.push(`  ${varName}: ${c.hex};`);
  }
  if (ir.typography.length > 0) {
    s.push(`\n  /* Typography */`);
    const families = [...new Set(ir.typography.map((t) => t.family))];
    if (families[0]) s.push(`  --font-heading: '${families[0]}', sans-serif;`);
    if (families[1]) s.push(`  --font-body: '${families[1]}', sans-serif;`);
    else if (families[0]) s.push(`  --font-body: '${families[0]}', sans-serif;`);
  }
  if (ir.spacing.length > 0) {
    s.push(`\n  /* Spacing */`);
    s.push(`  --spacing-unit: ${ir.spacing[0]?.value ?? 4}${ir.spacing[0]?.unit ?? 'px'};`);
  }
  if (ir.radius.length > 0) {
    s.push(`\n  /* Border Radius */`);
    for (let i = 0; i < Math.min(ir.radius.length, 3); i++) {
      const r = ir.radius[i]!;
      const label = i === 0 ? 'sm' : i === 1 ? 'md' : 'lg';
      s.push(`  --radius-${label}: ${r.value}${r.unit};`);
    }
  }
  s.push('}');
  s.push('```\n');

  // Site-defined variables
  if (ir.variables && ir.variables.length > 0) {
    s.push(`### Site-Defined CSS Variables\n`);
    s.push('```css');
    s.push(':root {');
    for (const v of ir.variables.slice(0, 40)) {
      s.push(`  ${v.name}: ${v.value};`);
    }
    s.push('}');
    s.push('```\n');
  }

  // 2. Tailwind config
  if (ir.classAnalysis?.isTailwind) {
    s.push(`## Tailwind Config Extend\n`);
    s.push('```js');
    s.push('// tailwind.config.ts → theme.extend');
    s.push('extend: {');
    s.push('  colors: {');
    for (const c of ir.colors.filter((c) => c.role !== 'unknown')) {
      s.push(`    '${c.role}': '${c.hex}',`);
    }
    s.push('  },');
    if (ir.radius.length > 0) {
      s.push('  borderRadius: {');
      for (let i = 0; i < Math.min(ir.radius.length, 3); i++) {
        const r = ir.radius[i]!;
        const label = i === 0 ? 'sm' : i === 1 ? 'md' : 'lg';
        s.push(`    '${label}': '${r.value}${r.unit}',`);
      }
      s.push('  },');
    }
    const families = [...new Set(ir.typography.map((t) => t.family))];
    if (families.length > 0) {
      s.push('  fontFamily: {');
      if (families[0]) s.push(`    heading: ['${families[0]}', 'sans-serif'],`);
      if (families[1]) s.push(`    body: ['${families[1]}', 'sans-serif'],`);
      s.push('  },');
    }
    s.push('}');
    s.push('```\n');
  }

  // 3. Color palette
  s.push(`## Color Palette\n`);
  s.push(`| Hex | Role | Usage |`);
  s.push(`|-----|------|-------|`);
  for (const c of ir.colors) {
    s.push(`| \`${c.hex}\` | ${c.role} | ${c.usage.join(', ') || '—'} |`);
  }
  s.push('');

  // 4. Typography
  s.push(`## Typography Scale\n`);
  s.push(`| Family | Size | Weight | Line Height | Role |`);
  s.push(`|--------|------|--------|-------------|------|`);
  for (const t of ir.typography) {
    s.push(`| ${t.family} | ${t.size}px | ${t.weight} | ${t.lineHeight} | ${t.role} |`);
  }
  s.push('');

  // 5. Components
  s.push(`## Component Recipes\n`);
  if (ir.components.length > 0) {
    for (const c of ir.components) {
      s.push(`### ${c.name} (\`${c.type}\`)`);
      s.push(`**Usage:** ${c.usage}`);
      if (c.do.length > 0) s.push(`**Do:** ${c.do.join(' | ')}`);
      if (c.dont.length > 0) s.push(`**Don't:** ${c.dont.join(' | ')}`);
      s.push('');
    }
  } else {
    s.push('No components detected.\n');
  }

  // 6. Layout
  s.push(`## Layout\n`);
  if (ir.layout.length > 0) {
    for (const l of ir.layout) {
      s.push(`- **${l.type}**${l.width ? ` (${l.width}px)` : ''}`);
    }
  } else {
    s.push('No layout primitives detected.');
  }
  s.push('');

  // 7. Breakpoints
  if (ir.breakpoints && ir.breakpoints.values.length > 0) {
    s.push(`## Breakpoints\n`);
    s.push(ir.breakpoints.values.map((bp) => `\`${bp}px\``).join(' → '));
    s.push('');
  }

  // 8. Principles
  s.push(`## Design Principles\n`);
  if (ir.doctrine.principles.length > 0) {
    for (const p of ir.doctrine.principles) s.push(`- ${p}`);
  }
  if (ir.doctrine.constraints.length > 0) {
    s.push(`\n**Constraints:**`);
    for (const c of ir.doctrine.constraints) s.push(`- ${c}`);
  }
  if (ir.doctrine.antiPatterns.length > 0) {
    s.push(`\n**Avoid:**`);
    for (const a of ir.doctrine.antiPatterns) s.push(`- ${a}`);
  }
  s.push('');

  return s.join('\n');
}
