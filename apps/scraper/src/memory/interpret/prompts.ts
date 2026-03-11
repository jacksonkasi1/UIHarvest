// ** import types
import type { ColorToken, TypographyToken, ComponentRecipe, DesignIR } from '../ir/types.js';

export function buildColorClassificationPrompt(colors: ColorToken[]): string {
  const list = colors
    .map(
      (c) =>
        `- ${c.hex}${c.evidence.length ? ` (DOM context: ${c.evidence.slice(0, 4).join(', ')})` : ''}`
    )
    .join('\n');

  return `You are a senior design system analyst specializing in color theory and visual hierarchy.

## Task
Classify each extracted color by its semantic role in the design system.

## Colors extracted from the page (hex + where they appeared in the DOM)
${list}

## Role definitions (use exactly one per color)
- **primary**: Main brand color, used for CTAs, key interactive elements, and brand emphasis. Usually the most saturated/distinctive color.
- **accent**: Secondary emphasis color, used for highlights, badges, and supporting actions.
- **surface**: Background colors for the page, cards, containers, and sections.
- **text**: Body text and primary content color. Usually dark on light themes, light on dark themes.
- **muted**: Secondary text, placeholders, borders, and disabled states. Lower contrast than text.
- **status-success/warning/error/info**: Only for semantic status indicators (green/yellow/red/blue patterns).
- **unknown**: Only if truly ambiguous.

## Hints for classification
- The color used on buttons or links is likely **primary** or **accent**.
- The most common background color is likely **surface**.
- Text colors with high contrast against the background are **text**; lower contrast ones are **muted**.
- Colors appearing only on specific status indicators (error messages, success badges) are **status-***.
- If a color appears on headers AND buttons, it's likely **primary**.

## Output
Return a JSON array. Each item:
{ "hex": "#rrggbb", "role": "<role>", "evidence": ["where it was found"], "usage": ["1-3 phrases: 'button background', 'header text'"] }

Suggest a CSS variable name in the evidence, e.g. "--color-primary", "--color-surface-dark".`;
}

export function buildTypographyClassificationPrompt(typography: TypographyToken[]): string {
  const list = typography
    .map(
      (t) =>
        `- ${t.family}, ${t.size}px, weight ${t.weight}, line-height ${t.lineHeight}${t.evidence.length ? ` (${t.evidence.slice(0, 3).join('; ')})` : ''}`
    )
    .join('\n');

  return `You are a senior design system analyst specializing in typography and visual hierarchy.

## Task
Classify each typography token by its role in the type scale.

## Typography tokens extracted
${list}

## Role definitions
- **heading**: Titles, hero text, section headers. Usually largest size and heaviest weight.
- **body**: Paragraphs, main content. Usually 14-18px, regular/medium weight.
- **caption**: Small text, footnotes, metadata. Usually 10-14px, lighter weight.
- **label**: Form labels, button text, navigation items. Usually medium weight, smaller size.
- **unknown**: Only if truly ambiguous.

## Hints
- Largest size + heaviest weight = heading.
- 14-18px + 400-500 weight = body.
- Smallest sizes (10-13px) = caption.
- Text on interactive elements (buttons, links, form fields) = label.
- If two fonts exist, the display/serif font is likely headings, the sans-serif is likely body.

## Output
Return a JSON array. Each item:
{ "family": "string", "size": number, "weight": number, "lineHeight": number, "role": "<role>", "evidence": ["string"] }`;
}

export function buildDoctrinePrompt(ir: DesignIR): string {
  const colorSummary =
    ir.colors?.length > 0
      ? ir.colors.map((c) => `${c.hex} (${c.role})`).join(', ')
      : 'none extracted';
  const typoSummary =
    ir.typography?.length > 0
      ? ir.typography.map((t) => `${t.family} ${t.size}px w${t.weight} (${t.role})`).join(', ')
      : 'none extracted';
  const componentSummary =
    ir.components?.length > 0
      ? ir.components.map((c) => `${c.type}: ${c.name}`).join(', ')
      : 'none extracted';
  const varCount = ir.variables?.length ?? 0;
  const isTailwind = ir.classAnalysis?.isTailwind ? 'Yes' : 'No';
  const breakpoints = ir.breakpoints?.values?.join(', ') ?? 'none';

  return `You are a senior design system architect. Analyze this extracted design system and infer the design doctrine — the rules, principles, and constraints that govern this design.

## Extracted Design System
- **Colors:** ${colorSummary}
- **Typography:** ${typoSummary}
- **Components:** ${componentSummary}
- **Layout primitives:** ${ir.layout?.length ?? 0}
- **Spacing tokens:** ${ir.spacing?.length ?? 0}
- **Radius tokens:** ${ir.radius?.length ?? 0}
- **Elevation tokens:** ${ir.elevation?.length ?? 0}
- **CSS variables:** ${varCount}
- **Tailwind detected:** ${isTailwind}
- **Breakpoints:** ${breakpoints}

## Questions to answer
1. **Visual density**: Is this design airy (lots of whitespace) or dense (compact, information-rich)?
2. **Shape language**: Rounded corners, sharp edges, or mixed?
3. **Color temperature**: Warm palette, cool palette, or neutral?
4. **Dark or light mode?** What are the surface layers?
5. **Grid system**: Is it 12-column, auto, or custom?
6. **Typography hierarchy**: How many levels? What differentiates them?

## Output
Return a single JSON object:
{
  "hierarchy": [ "4-6 specific observations about visual hierarchy, e.g. 'Hero headings at 48px bold dominate the page', 'Body text is subdued at 16px regular'" ],
  "principles": [ "4-6 design principles, e.g. 'Generous whitespace between sections (64-80px)', 'High contrast dark surface with bright accent CTAs'" ],
  "constraints": [ "3-5 constraints, e.g. 'Primary orange only for CTAs and key actions', 'Maximum 2 font families', 'Cards always have 12px radius'" ],
  "antiPatterns": [ "3-5 things to avoid, e.g. 'Do not use accent color for body text', 'Avoid mixing rounded and sharp corners', 'Never use more than 3 heading sizes'" ]
}`;
}

export function buildComponentRecipePrompt(components: ComponentRecipe[]): string {
  const list = components
    .map((c) => `- ${c.type} "${c.name}": ${JSON.stringify(c.styles).slice(0, 200)}`)
    .join('\n');

  return `You are a senior frontend engineer and design system specialist. Enrich these component recipes with practical usage guidelines.

## Components (type, name, extracted styles)
${list}

## Output
Return a JSON array. Each item:
{
  "type": "<keep from input>",
  "name": "<keep from input>",
  "styles": { <keep from input exactly> },
  "usage": "One clear sentence: when and why to use this component.",
  "constraints": ["2-3 rules, e.g. 'Primary button: max 1 per screen section'"],
  "do": ["3-4 practices, e.g. 'Use consistent padding across all button variants'"],
  "dont": ["3-4 anti-patterns, e.g. 'Don't nest buttons inside other buttons'"]
}

Be specific to the extracted styles. If a button has 12px radius, say "Use 12px radius for all button variants." Not generic advice.`;
}
