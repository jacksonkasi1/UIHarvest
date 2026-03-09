// ** import types
import type { DesignIR } from '../ir/types.js';

export function renderMotion(ir: DesignIR): string {
  const sections: string[] = [
    `# Motion & Animation`,
    `\n## Principles\n`,
    `- Use consistent timing functions`,
    `- Respect user preferences for reduced motion`,
    `- Provide meaningful feedback for interactions`,
  ];

  if (ir.motion && ir.motion.length > 0) {
    sections.push(`\n## Detected Motion Tokens\n`);

    const transitions = ir.motion.filter((m) => m.property === 'transition');
    const animations = ir.motion.filter((m) => m.property === 'animation');
    const transforms = ir.motion.filter((m) => m.property === 'transform');

    if (transitions.length > 0) {
      sections.push(`### Transitions\n`);
      for (const t of transitions) {
        sections.push(`- **${t.selector}**: \`${t.value}\``);
      }
    }

    if (animations.length > 0) {
      sections.push(`\n### Animations\n`);
      for (const a of animations) {
        sections.push(`- **${a.selector}**: \`${a.value}\``);
      }
    }

    if (transforms.length > 0) {
      sections.push(`\n### Transforms\n`);
      for (const t of transforms) {
        sections.push(`- **${t.selector}**: \`${t.value}\``);
      }
    }
  } else {
    sections.push(`\n## Guidelines\n`);
    sections.push(`No motion tokens detected. Use subtle transitions for hover/focus states.`);
  }

  return sections.join('\n') + '\n';
}
