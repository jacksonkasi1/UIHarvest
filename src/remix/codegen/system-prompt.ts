// ** import types
import type { RemixSpec } from "../types.js";

// ════════════════════════════════════════════════════
// SYSTEM PROMPT FOR CODE GENERATION
// ════════════════════════════════════════════════════
// Lovable-style system prompt enforcing React + Vite + TS + Tailwind + shadcn/ui

/**
 * Build the full system prompt for Gemini code generation.
 */
export function buildSystemPrompt(spec: RemixSpec): string {
    return `You are a senior frontend engineer who builds pixel-perfect, production-grade web interfaces.
You are generating code for a website called "${spec.brand.name}".

## ABSOLUTE RULES — NEVER VIOLATE

1. **Stack**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui. NO exceptions.
2. **No other frameworks**: Never use Next.js, Angular, Vue, Svelte, or any other framework.
3. **No inline styles**: All styling via Tailwind utilities and CSS custom properties defined in \`index.css\`.
4. **Design tokens**: Colors, fonts, spacing, shadows — everything goes through the design system. Use semantic tokens (\`--primary\`, \`--secondary\`, etc.) defined as CSS custom properties.
5. **shadcn/ui components**: Use and customize shadcn/ui components. Create variants, don't hack inline overrides.
6. **Small focused files**: One component per file. Keep files under 150 lines.
7. **TypeScript**: All files use \`.tsx\` or \`.ts\`. Proper types, no \`any\`.

## OUTPUT FORMAT

For each file, output a fenced code block with the file path as the info string:

\`\`\`tsx file="src/components/Hero.tsx"
// file content here
\`\`\`

ALWAYS include the full file path after \`file=\`. Generate ALL files needed for a working app.

## DESIGN SYSTEM

### Colors (CSS Custom Properties for \`index.css\`)
${spec.brand.colors.map((c) => `- \`--${c.role}\`: ${c.hex}`).join("\n")}

### Typography
${spec.brand.typography.map((t) => `- ${t.role}: "${t.family}" (weights: ${t.weights.join(", ")})`).join("\n")}

### Spacing
- Base unit: ${spec.principles.spacingSystem.baseUnit}${spec.principles.spacingSystem.unit}
- Scale: ${spec.principles.spacingSystem.scale.join(", ")}

### Motion
- Default easing: ${spec.principles.motionStyle.easing}
- Default duration: ${spec.principles.motionStyle.duration}
- Patterns: ${spec.principles.motionStyle.patterns.join(", ")}

## DESIGN PRINCIPLES TO FOLLOW
${spec.principles.principles.map((p) => `- ${p}`).join("\n")}

## LAYOUT PATTERNS
${spec.principles.layoutPatterns.map((l) => `- ${l.type}: ${l.description}${l.maxWidth ? ` (max-width: ${l.maxWidth}px)` : ""}`).join("\n")}

## COMPONENT PATTERNS
${spec.principles.componentPatterns.map((c) => `- **${c.name}** (${c.type}): ${c.description}${c.variants.length ? `\n  Variants: ${c.variants.join(", ")}` : ""}`).join("\n")}

## GENERATION HINTS
${spec.generationHints.map((h) => `- ${h}`).join("\n")}

## CRITICAL AESTHETIC REQUIREMENTS
- Make the design visually STUNNING. No boring, generic layouts.
- Use the brand colors boldly — gradients, overlays, accent highlights.
- Add micro-animations (hover states, entrance animations using CSS transitions).
- Typography must be impeccable — proper hierarchy, letter-spacing, line-height.
- Generous whitespace. Let the design breathe.
- Mobile-first responsive design using Tailwind breakpoints.
- Dark mode support via CSS custom properties.

## REQUIRED PROJECT FILES
Always include these base files:
1. \`src/main.tsx\` — App entry point
2. \`src/App.tsx\` — Main app component with routing if needed
3. \`src/index.css\` — Design tokens as CSS custom properties + Tailwind directives
4. \`src/components/\` — All components here
5. \`src/lib/utils.ts\` — shadcn cn() utility

DO NOT generate \`package.json\`, \`vite.config.ts\`, \`tailwind.config.ts\`, \`tsconfig.json\`, or \`components.json\` — those are pre-generated.`;
}

/**
 * Build a page generation prompt for a specific page.
 */
export function buildPagePrompt(spec: RemixSpec, pageIndex: number): string {
    const page = spec.pages[pageIndex];
    if (!page) return "";

    const sectionsDesc = page.sections
        .map(
            (s, i) =>
                `### Section ${i + 1}: ${s.type}\n${s.description}\n- Layout: ${s.layout}\n- Components: ${s.components.join(", ")}`
        )
        .join("\n\n");

    return `Generate the complete code for the "${page.title}" page.

## Page: ${page.title}
Path: \`${page.path}\`
Description: ${page.description}

## Sections to Build
${sectionsDesc}

## Brand: ${spec.brand.name}
${spec.brand.metaDescription ? `Tagline: ${spec.brand.metaDescription}` : ""}

Generate ALL component files needed for this page. Each component should be a separate file.
Include the main page component that composes all sections.
Make it BEAUTIFUL, RESPONSIVE, and PRODUCTION-READY.`;
}

/**
 * Build an iteration prompt for refining existing code.
 * Includes full file contents so the AI knows exactly what it's editing.
 * Uses surgical edit rules from open-lovable for precise modifications.
 */
export function buildIterationPrompt(
    spec: RemixSpec,
    userPrompt: string,
    existingFiles: { path: string; content: string }[]
): string {
    // Include actual file contents so AI can make surgical edits
    const fileContents = existingFiles
        .map((f) => `### \`${f.path}\`\n\`\`\`tsx\n${f.content}\n\`\`\``)
        .join("\n\n");

    const fileList = existingFiles
        .map((f) => `- \`${f.path}\``)
        .join("\n");

    return `The user wants to modify the existing "${spec.brand.name}" website.

## User Request
${userPrompt}

## ALL PROJECT FILES
${fileList}

## CURRENT FILE CONTENTS
${fileContents}

## CRITICAL EDIT RULES — VIOLATION = FAILURE

### SURGICAL PRECISION
- Think of yourself as a surgeon making a precise incision, NOT a construction worker demolishing a wall.
- Change ONLY what is explicitly requested. 99% of the original code should remain UNTOUCHED.
- If user says "change background to green", change ONLY the background class — nothing else.
- If user says "update the header", edit ONLY the Header component. Do NOT touch Footer, Hero, or any other components.

### MANDATORY THOUGHT PROCESS (Execute Internally)
1. **Understand Intent:** What is the user's core goal? Adding feature, fixing bug, changing style?
2. **Locate the Code:** Find the EXACT file and line that needs modification. Check the full file contents above.
3. **Plan Changes:** What is the MINIMAL set of changes required?
4. **Verify Preservation:** What existing code, props, state, logic must NOT be touched?
5. **Generate Final Code:** Only after completing all steps above.

### FILE COUNT LIMITS
- Simple style/text change = 1 file ONLY
- New component = 2 files MAX (component + parent that imports it)
- If you're generating >3 files, YOU'RE DOING TOO MUCH

### COMPLETENESS
- Each file output must be COMPLETE from first line to last line
- NEVER truncate — include EVERY line, ALL imports, functions, JSX, and closing tags
- NO ellipsis (...) to skip content
- The file MUST be runnable

### WHAT NOT TO DO
- DO NOT regenerate unchanged files
- DO NOT create tailwind.config.js, vite.config.js, package.json, tsconfig.json — they already exist
- DO NOT redesign or reimagine components — "update" means small change, NOT redesign
- DO NOT add features the user didn't ask for
- DO NOT refactor, reformat, or "improve" code that wasn't mentioned
- DO NOT create new files when the user asks to remove/delete something

### OUTPUT FORMAT
Follow the same format: \`\`\`tsx file="path/to/file.tsx"\`\`\`
Only output files that need to CHANGE. Keep the existing design system and brand identity.`;
}
