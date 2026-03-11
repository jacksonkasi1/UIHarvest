// ** import types
import type { DesignIR } from '../ir/types.js';

export function renderComponents(ir: DesignIR): string {
  const components = ir.components
    .map((c) => {
      const doList = c.do.length > 0 ? c.do.map((d) => `  - ✅ ${d}`).join('\n') : '';
      const dontList = c.dont.length > 0 ? c.dont.map((d) => `  - ❌ ${d}`).join('\n') : '';

      return `## ${c.name} (${c.type})

**Usage:** ${c.usage}

${doList ? `### Do\n${doList}\n` : ''}${dontList ? `### Don't\n${dontList}\n` : ''}**Constraints:** ${c.constraints.join(', ') || 'None specified'}

**Styles:** \`\`\`json\n${JSON.stringify(c.styles, null, 2)}\n\`\`\`
`;
    })
    .join('\n');

  return `# Component Recipes

${components || 'No component recipes extracted'}
`;
}
