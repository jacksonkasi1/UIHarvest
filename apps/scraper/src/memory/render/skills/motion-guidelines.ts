// ** import types
import type { DesignIR } from '../../ir/types.js';

/**
 * Motion guidelines skill: extracted transitions, animations, and timing rules.
 */
export function renderMotionGuidelinesSkill(ir: DesignIR): string {
  const transitions = ir.motion?.filter((m) => m.property === 'transition') ?? [];
  const animations = ir.motion?.filter((m) => m.property === 'animation') ?? [];
  const transforms = ir.motion?.filter((m) => m.property === 'transform') ?? [];

  return `---
name: motion-guidelines
description: Motion and animation patterns extracted from the design.
---

## Transitions
${transitions.length > 0 ? transitions.map((t) => `- **${t.selector}**: \`${t.value}\``).join('\n') : 'No transitions detected. Use subtle transitions for hover/focus states:\n- `transition: all 0.2s ease`\n- `transition: color 0.15s, background-color 0.15s`'}

## Animations
${animations.length > 0 ? animations.map((a) => `- **${a.selector}**: \`${a.value}\``).join('\n') : 'No animations detected.'}

## Transforms
${transforms.length > 0 ? transforms.map((t) => `- **${t.selector}**: \`${t.value}\``).join('\n') : 'No transforms detected.'}

## Rules

- **Hover states**: Apply subtle transitions (150-300ms) on interactive elements.
- **Page load**: If animations were detected, use staggered reveals with \`animation-delay\`.
- **Timing**: Prefer \`ease\` or \`ease-out\` for natural-feeling motion.
- **Duration**: 150-300ms for micro-interactions, 300-500ms for layout changes.
- **Reduced motion**: Always wrap animations in \`@media (prefers-reduced-motion: no-preference)\`.

## Don't

- Don't add motion that doesn't exist in the original design.
- Don't use jarring or bouncy animations unless they were detected above.
- Don't animate layout properties (width, height) — prefer transform and opacity.
`;
}
