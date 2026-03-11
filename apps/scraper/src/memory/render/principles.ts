// ** import types
import type { DesignIR } from '../ir/types.js';

export function renderPrinciples(ir: DesignIR): string {
  const hierarchy =
    ir.doctrine.hierarchy.length > 0
      ? ir.doctrine.hierarchy.map((h) => `- ${h}`).join('\n')
      : generateDefaultHierarchy(ir);

  const principles =
    ir.doctrine.principles.length > 0
      ? ir.doctrine.principles.map((p) => `- ${p}`).join('\n')
      : generateDefaultPrinciples(ir);

  const constraints =
    ir.doctrine.constraints.length > 0
      ? ir.doctrine.constraints.map((c) => `- ${c}`).join('\n')
      : generateDefaultConstraints(ir);

  const antiPatterns =
    ir.doctrine.antiPatterns.length > 0
      ? ir.doctrine.antiPatterns.map((a) => `- ❌ ${a}`).join('\n')
      : generateDefaultAntiPatterns(ir);

  return `# Design Principles

## Hierarchy

${hierarchy}

## Principles

${principles}

## Constraints

${constraints}

## Anti-Patterns

${antiPatterns}
`;
}

function generateDefaultHierarchy(ir: DesignIR): string {
  const items: string[] = [];
  if (ir.colors.length > 0) items.push('Color system takes precedence in visual communication');
  if (ir.typography.length > 0) items.push('Typography establishes information hierarchy');
  if (ir.components.length > 0) items.push('Component consistency ensures cohesive user experience');
  if (ir.spacing.length > 0) items.push('Spacing system maintains visual rhythm and breathing room');
  return items.length > 0 ? items.map((h) => `- ${h}`).join('\n') : 'No hierarchy rules specified';
}

function generateDefaultPrinciples(ir: DesignIR): string {
  const items: string[] = [];
  if (ir.colors.length > 0) items.push('Use the defined color palette consistently');
  if (ir.typography.length > 0) items.push('Maintain typographic hierarchy and readability');
  if (ir.spacing.length > 0) items.push('Apply spacing tokens systematically');
  if (ir.components.length > 0) items.push('Reuse components to maintain consistency');
  items.push('Prioritize clarity and usability');
  items.push('Ensure accessibility in all design decisions');
  return items.map((p) => `- ${p}`).join('\n');
}

function generateDefaultConstraints(ir: DesignIR): string {
  const items: string[] = [];
  if (ir.colors.length > 0) items.push('Do not introduce colors outside the defined palette');
  if (ir.typography.length > 0) items.push('Do not use font sizes or weights not in the typography system');
  if (ir.spacing.length > 0) items.push('Do not use arbitrary spacing values - use tokens');
  items.push('Maintain responsive design principles');
  items.push('Ensure all interactive elements meet accessibility standards');
  return items.length > 0 ? items.map((c) => `- ${c}`).join('\n') : 'No constraints specified';
}

function generateDefaultAntiPatterns(ir: DesignIR): string {
  const items: string[] = [];
  items.push('Avoid inconsistent spacing or arbitrary values');
  items.push('Avoid mixing design patterns without clear rationale');
  if (ir.colors.length > 0) items.push('Avoid using colors that conflict with the established palette');
  if (ir.typography.length > 0) items.push('Avoid breaking typographic hierarchy');
  items.push('Avoid creating one-off components when reusable patterns exist');
  return items.map((a) => `- ❌ ${a}`).join('\n');
}
