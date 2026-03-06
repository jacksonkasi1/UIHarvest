import { AiClient, type AiMessage } from "./ai-client.js";

export interface AnalysisResult {
  namedTokens: {
    colors: NamedColor[];
    spacing: NamedSpacing[];
    typography: NamedTypography[];
  };
  componentLibrary: ComponentDefinition[];
  sectionBlueprint: SectionDefinition[];
  codeSnippets: CodeSnippet[];
  designSummary: DesignSummary;
  aiUsage: { calls: number; tokens: number; cost: number };
}

interface NamedColor {
  hex: string;
  name: string;
  cssVar: string;
  category: string;
  role: string;
}

interface NamedSpacing {
  value: number;
  name: string;
  cssVar: string;
}

interface NamedTypography {
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  name: string;
  cssVar: string;
  usage: string;
}

interface ComponentDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  variants: VariantDefinition[];
  props: PropDefinition[];
  instanceIds: string[];
  structuralSignature: string;
}

interface VariantDefinition {
  name: string;
  description: string;
  instanceIds: string[];
  distinguishingStyles: Record<string, string>;
}

interface PropDefinition {
  name: string;
  type: string;
  description: string;
  examples: string[];
}

interface SectionDefinition {
  sectionId: string;
  name: string;
  purpose: string;
  layoutType: string;
  componentRefs: string[];
  order: number;
}

interface CodeSnippet {
  componentId: string;
  componentName: string;
  react: string;
  html: string;
  tailwind: string;
}

interface DesignSummary {
  brandDescription: string;
  colorPalette: string;
  typographySystem: string;
  spacingSystem: string;
  layoutApproach: string;
  componentCount: number;
  overallStyle: string;
}

// ────────────────────────────────────────────────
// Main Analyzer Class
// ────────────────────────────────────────────────

export class DesignAnalyzer {
  private ai: AiClient;
  private raw: any;

  constructor(rawData: any) {
    this.ai = new AiClient();
    this.raw = rawData;
  }

  get isAiAvailable(): boolean {
    return this.ai.isAvailable;
  }

  async analyze(onProgress?: (step: string, done: number, total: number) => void): Promise<AnalysisResult> {
    const totalSteps = 6;
    const progress = (step: string, n: number) => {
      onProgress?.(step, n, totalSteps);
      console.log(`    [${n}/${totalSteps}] ${step}`);
    };

    // Step 1: Name tokens
    progress("Naming design tokens…", 1);
    const namedTokens = await this.nameTokens();

    // Step 2: Cluster components
    progress("Clustering components…", 2);
    const componentLibrary = await this.clusterComponents();

    // Step 3: Detect variants
    progress("Detecting variants…", 3);
    await this.detectVariants(componentLibrary);

    // Step 4: Analyze sections
    progress("Analyzing sections…", 4);
    const sectionBlueprint = await this.analyzeSections(componentLibrary);

    // Step 5: Generate code
    progress("Generating component code…", 5);
    const codeSnippets = await this.generateCode(componentLibrary);

    // Step 6: Design summary
    progress("Creating design summary…", 6);
    const designSummary = await this.createSummary(namedTokens, componentLibrary);

    return {
      namedTokens,
      componentLibrary,
      sectionBlueprint,
      codeSnippets,
      designSummary,
      aiUsage: {
        calls: this.ai.calls,
        tokens: this.ai.usage.totalTokens,
        cost: Math.round(this.ai.usage.cost * 10000) / 10000,
      },
    };
  }

  // ══════════════════════════════════════════════
  // STEP 1: TOKEN NAMING
  // ══════════════════════════════════════════════

  private async nameTokens(): Promise<AnalysisResult["namedTokens"]> {
    const [colors, spacing, typography] = await Promise.all([
      this.nameColors(),
      this.nameSpacing(),
      this.nameTypography(),
    ]);
    return { colors, spacing, typography };
  }

  private async nameColors(): Promise<NamedColor[]> {
    const rawColors = this.raw.tokens.colors.slice(0, 40);
    if (!rawColors.length) return [];

    const colorList = rawColors
      .map((c: any) => `${c.hex} (×${c.count}, used for: ${c.usages.join(", ")})`)
      .join("\n");

    const messages: AiMessage[] = [
      {
        role: "system",
        content: `You are a design system expert. Name colors with semantic names suitable for a design token system.

Rules:
- Use categories: brand, neutral, feedback, accent, surface
- Use roles like: primary, secondary, muted, surface, border, text-primary, text-secondary
- CSS variable format: --color-{category}-{name}
- Return valid JSON only`,
      },
      {
        role: "user",
        content: `Name these extracted colors from ${this.raw.meta.url}:

${colorList}

Return JSON:
{
  "colors": [
    {"hex": "#...", "name": "primary", "cssVar": "--color-brand-primary", "category": "brand", "role": "Primary brand color used for CTAs and headings"}
  ]
}`,
      },
    ];

    try {
      const result = await this.ai.chatJson<{ colors: NamedColor[] }>(messages, { model: "fast" });
      return result.colors || [];
    } catch (e) {
      console.warn("    ⚠️  Color naming failed, using fallback");
      return rawColors.map((c: any, i: number) => ({
        hex: c.hex,
        name: `color-${i + 1}`,
        cssVar: `--color-${i + 1}`,
        category: c.usages.includes("background-color") ? "surface" : "text",
        role: `Used ${c.count}× for ${c.usages.join(", ")}`,
      }));
    }
  }

  private async nameSpacing(): Promise<NamedSpacing[]> {
    const rawSpacing = this.raw.tokens.spacing;
    if (!rawSpacing.length) return [];

    const messages: AiMessage[] = [
      {
        role: "system",
        content: `You are a design system expert. Create a spacing scale from extracted values.

Rules:
- Name using t-shirt sizes or numeric scale: 3xs, 2xs, xs, sm, md, lg, xl, 2xl, 3xl, 4xl
- CSS variable format: --space-{name}
- Only include values that form a logical scale
- Return valid JSON only`,
      },
      {
        role: "user",
        content: `These spacing values (px) were extracted: ${rawSpacing.join(", ")}

Return JSON:
{
  "spacing": [
    {"value": 4, "name": "xs", "cssVar": "--space-xs"}
  ]
}`,
      },
    ];

    try {
      const result = await this.ai.chatJson<{ spacing: NamedSpacing[] }>(messages, { model: "fast" });
      return result.spacing || [];
    } catch {
      return rawSpacing.map((v: number, i: number) => ({
        value: v,
        name: `space-${i + 1}`,
        cssVar: `--space-${i + 1}`,
      }));
    }
  }

  private async nameTypography(): Promise<NamedTypography[]> {
    const rawTypo = this.raw.tokens.typography.slice(0, 20);
    if (!rawTypo.length) return [];

    const typoList = rawTypo
      .map((t: any) => `${t.fontSize} / ${t.fontWeight} / ${t.fontFamily.split(",")[0].replace(/['"]/g, "")} (×${t.count}, sample: "${t.sample?.slice(0, 30)}")`)
      .join("\n");

    const messages: AiMessage[] = [
      {
        role: "system",
        content: `You are a design system expert. Name typography styles for a design token system.

Rules:
- Names like: display-xl, heading-lg, heading-md, heading-sm, body-lg, body-md, body-sm, caption, label, button
- CSS variable format: --font-{name}
- Usage describes where it's typically used
- Return valid JSON only`,
      },
      {
        role: "user",
        content: `Name these typography styles from ${this.raw.meta.url}:

${typoList}

Return JSON:
{
  "typography": [
    {"fontSize": "48px", "fontWeight": "700", "fontFamily": "...", "name": "display-xl", "cssVar": "--font-display-xl", "usage": "Hero headings"}
  ]
}`,
      },
    ];

    try {
      const result = await this.ai.chatJson<{ typography: NamedTypography[] }>(messages, { model: "fast" });
      return result.typography || [];
    } catch {
      return rawTypo.map((t: any, i: number) => ({
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        fontFamily: t.fontFamily,
        name: `type-${i + 1}`,
        cssVar: `--font-type-${i + 1}`,
        usage: `Used ${t.count}×`,
      }));
    }
  }

  // ══════════════════════════════════════════════
  // STEP 2: COMPONENT CLUSTERING
  // ══════════════════════════════════════════════

  private async clusterComponents(): Promise<ComponentDefinition[]> {
    // Pre-group by structural signature
    const signatureGroups = new Map<string, any[]>();
    this.raw.components.forEach((comp: any) => {
      const sig = comp.structuralSignature;
      if (!signatureGroups.has(sig)) signatureGroups.set(sig, []);
      signatureGroups.get(sig)!.push(comp);
    });

    // Filter out trivial single-instance groups and very small elements
    const significantGroups: { signature: string; instances: any[]; example: any }[] = [];
    signatureGroups.forEach((instances, sig) => {
      // Keep groups with 2+ instances OR single significant components
      const isSignificant =
        instances.length >= 2 ||
        ["card", "navigation", "footer", "tabs", "testimonial", "cta-banner"].includes(instances[0].type) ||
        (instances[0].rect.width > 200 && instances[0].rect.height > 100);

      if (isSignificant && sig.length > 5) {
        significantGroups.push({
          signature: sig,
          instances,
          example: instances[0],
        });
      }
    });

    // Also add unique components that don't have matching signatures
    const standaloneTypes = ["navigation", "footer", "tabs", "testimonial", "cta-banner", "logo"];
    this.raw.components.forEach((comp: any) => {
      if (standaloneTypes.includes(comp.type)) {
        const exists = significantGroups.find((g) =>
          g.instances.some((i: any) => i.id === comp.id)
        );
        if (!exists) {
          significantGroups.push({
            signature: comp.structuralSignature,
            instances: [comp],
            example: comp,
          });
        }
      }
    });

    // Prepare data for AI — only send summaries, not full HTML
    const groupSummaries = significantGroups.slice(0, 30).map((g, idx) => {
      const ex = g.example;
      const names = g.instances
        .map((i: any) => i.name)
        .slice(0, 5)
        .join(", ");
      const hasIcon = g.instances[0].html?.includes("<svg") || g.instances[0].html?.includes("data-has-icon");
      const hasLink = g.instances[0].html?.includes("<a ");
      const hasHeading = /h[1-6]/i.test(g.instances[0].html?.slice(0, 500) || "");
      const hasImage = g.instances[0].html?.includes("<img");

      return {
        groupIndex: idx,
        type: ex.type,
        subType: ex.subType,
        instanceCount: g.instances.length,
        exampleNames: names,
        dimensions: `${ex.rect.width}×${ex.rect.height}`,
        contains: [
          hasIcon && "icon/svg",
          hasHeading && "heading",
          hasLink && "link",
          hasImage && "image",
          ex.children?.length && `${ex.children.length} children`,
        ].filter(Boolean).join(", "),
        keyStyles: Object.entries(ex.styles || {})
          .filter(([_, v]) => v && v !== "none" && v !== "normal" && v !== "0px" && v !== "")
          .slice(0, 6)
          .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
          .join("; "),
      };
    });

    const messages: AiMessage[] = [
      {
        role: "system",
        content: `You are a senior UI/UX engineer. Analyze extracted UI element groups from a website and define reusable components.

Rules:
- Give each group a PascalCase component name (e.g., FeatureCard, HeroSection, PrimaryButton)
- Categorize: button, card, layout, navigation, section, form, media, feedback, typography
- Describe each component's purpose in 1 sentence
- List likely props (e.g., title, description, icon, href, variant)
- Return valid JSON only`,
      },
      {
        role: "user",
        content: `Website: ${this.raw.meta.url}
Title: ${this.raw.meta.title}

Element groups extracted:
${JSON.stringify(groupSummaries, null, 2)}

Return JSON:
{
  "components": [
    {
      "groupIndex": 0,
      "name": "FeatureCard",
      "displayName": "Feature Card",
      "description": "Card displaying a feature with icon, title, description and CTA link",
      "category": "card",
      "props": [
        {"name": "title", "type": "string", "description": "Feature title", "examples": ["Projects", "Tasks"]},
        {"name": "description", "type": "string", "description": "Short description", "examples": []},
        {"name": "icon", "type": "ReactNode", "description": "Feature icon", "examples": []},
        {"name": "href", "type": "string", "description": "CTA link URL", "examples": []}
      ]
    }
  ]
}`,
      },
    ];

    try {
      const result = await this.ai.chatJson<{
        components: Array<{
          groupIndex: number;
          name: string;
          displayName: string;
          description: string;
          category: string;
          props: PropDefinition[];
        }>;
      }>(messages, { model: "smart", maxTokens: 4096 });

      return (result.components || []).map((aiComp) => {
        const group = significantGroups[aiComp.groupIndex];
        if (!group) return null;
        return {
          id: `component-${aiComp.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
          name: aiComp.name,
          displayName: aiComp.displayName,
          description: aiComp.description,
          category: aiComp.category,
          variants: [],
          props: aiComp.props || [],
          instanceIds: group.instances.map((i: any) => i.id),
          structuralSignature: group.signature,
        };
      }).filter(Boolean) as ComponentDefinition[];
    } catch (e) {
      console.warn("    ⚠️  Component clustering failed, using fallback");
      return significantGroups.map((g, i) => ({
        id: `component-${g.example.type}-${i}`,
        name: `${capitalize(g.example.type)}${i > 0 ? i + 1 : ""}`,
        displayName: `${capitalize(g.example.type)} ${i > 0 ? i + 1 : ""}`,
        description: `${g.instances.length} instances of ${g.example.type}/${g.example.subType}`,
        category: g.example.type,
        variants: [],
        props: [],
        instanceIds: g.instances.map((i: any) => i.id),
        structuralSignature: g.signature,
      }));
    }
  }

  // ══════════════════════════════════════════════
  // STEP 3: VARIANT DETECTION
  // ══════════════════════════════════════════════

  private async detectVariants(components: ComponentDefinition[]): Promise<void> {
    // Only detect variants for components with 2+ instances
    const multiInstance = components.filter((c) => c.instanceIds.length >= 2);

    for (const comp of multiInstance.slice(0, 15)) {
      const instances = comp.instanceIds
        .map((id) => this.raw.components.find((c: any) => c.id === id))
        .filter(Boolean)
        .slice(0, 10);

      if (instances.length < 2) continue;

      // Check if instances actually differ in styles
      const styleKeys = new Set<string>();
      instances.forEach((inst: any) => {
        Object.entries(inst.styles || {}).forEach(([k, v]) => {
          if (v && v !== "none" && v !== "normal") styleKeys.add(k);
        });
      });

      const instanceSummaries = instances.map((inst: any) => ({
        id: inst.id,
        name: inst.name?.slice(0, 40),
        styles: Object.fromEntries(
          Array.from(styleKeys)
            .map((k) => [k, inst.styles?.[k] || ""])
            .filter(([_, v]) => v)
            .slice(0, 8)
        ),
        dimensions: `${inst.rect.width}×${inst.rect.height}`,
      }));

      // Check if there's actual visual variation
      const styleStrings = instanceSummaries.map((i) => JSON.stringify(i.styles));
      const uniqueStyles = new Set(styleStrings);
      if (uniqueStyles.size <= 1) {
        // All instances look the same — one "default" variant
        comp.variants = [
          {
            name: "default",
            description: "Standard appearance",
            instanceIds: comp.instanceIds,
            distinguishingStyles: {},
          },
        ];
        continue;
      }

      const messages: AiMessage[] = [
        {
          role: "system",
          content: `You are a design system expert. Given instances of the same UI component with different styles, identify visual variants.

Rules:
- Name variants: default, primary, secondary, outline, ghost, destructive, small, large, etc.
- Only create a variant if instances visually differ
- Include which styles distinguish each variant
- Return valid JSON only`,
        },
        {
          role: "user",
          content: `Component: ${comp.displayName}
Category: ${comp.category}

Instances:
${JSON.stringify(instanceSummaries, null, 2)}

Return JSON:
{
  "variants": [
    {
      "name": "primary",
      "description": "Filled primary style",
      "instanceIds": ["comp-0"],
      "distinguishingStyles": {"backgroundColor": "#6b002a", "color": "#fff"}
    }
  ]
}`,
        },
      ];

      try {
        const result = await this.ai.chatJson<{ variants: VariantDefinition[] }>(messages, {
          model: "fast",
          maxTokens: 2048,
        });
        comp.variants = result.variants || [];
      } catch {
        comp.variants = [
          {
            name: "default",
            description: "Standard appearance",
            instanceIds: comp.instanceIds,
            distinguishingStyles: {},
          },
        ];
      }
    }

    // Components with only 1 instance get a default variant
    components.forEach((c) => {
      if (c.variants.length === 0) {
        c.variants = [
          {
            name: "default",
            description: "Standard appearance",
            instanceIds: c.instanceIds,
            distinguishingStyles: {},
          },
        ];
      }
    });
  }

  // ══════════════════════════════════════════════
  // STEP 4: SECTION ANALYSIS
  // ══════════════════════════════════════════════

  private async analyzeSections(componentLibrary: ComponentDefinition[]): Promise<SectionDefinition[]> {
    const sections = this.raw.sections;
    if (!sections.length) return [];

    // Build section summaries
    const sectionSummaries = sections.slice(0, 15).map((sec: any, idx: number) => {
      // Find which AI-defined components are in this section
      const compRefs: string[] = [];
      (sec.childComponentIds || []).forEach((cid: string) => {
        const def = componentLibrary.find((c) => c.instanceIds.includes(cid));
        if (def && !compRefs.includes(def.name)) compRefs.push(def.name);
      });

      return {
        index: idx,
        rawName: sec.name,
        tag: sec.tag,
        dimensions: `${sec.rect.width}×${sec.rect.height}`,
        componentRefs: compRefs,
        textPreview: sec.textPreview?.slice(0, 150),
        dataAttributes: sec.dataAttributes || {},
        backgroundColor: sec.styles?.backgroundColor || "",
      };
    });

    const messages: AiMessage[] = [
      {
        role: "system",
        content: `You are a UX architect. Analyze page sections and define their purpose and layout type.

Layout types: hero, feature-grid, testimonial, cta-banner, content-split, stats, pricing, faq, footer, header, gallery, comparison

Rules:
- Purpose should be 1 clear sentence
- Name should be descriptive (e.g., "Feature Showcase", "Social Proof")
- Return valid JSON only`,
      },
      {
        role: "user",
        content: `Website: ${this.raw.meta.title}

Sections:
${JSON.stringify(sectionSummaries, null, 2)}

Return JSON:
{
  "sections": [
    {
      "index": 0,
      "name": "Feature Showcase",
      "purpose": "Displays key product features in a grid of cards",
      "layoutType": "feature-grid",
      "componentRefs": ["FeatureCard"]
    }
  ]
}`,
      },
    ];

    try {
      const result = await this.ai.chatJson<{
        sections: Array<{
          index: number;
          name: string;
          purpose: string;
          layoutType: string;
          componentRefs: string[];
        }>;
      }>(messages, { model: "fast", maxTokens: 3000 });

      return (result.sections || []).map((aiSec) => {
        const rawSec = sections[aiSec.index];
        return {
          sectionId: rawSec?.id || `section-${aiSec.index}`,
          name: aiSec.name,
          purpose: aiSec.purpose,
          layoutType: aiSec.layoutType,
          componentRefs: aiSec.componentRefs,
          order: aiSec.index,
        };
      });
    } catch {
      return sections.map((sec: any, i: number) => ({
        sectionId: sec.id,
        name: sec.name,
        purpose: "",
        layoutType: "unknown",
        componentRefs: [],
        order: i,
      }));
    }
  }

  // ══════════════════════════════════════════════
  // STEP 5: CODE GENERATION
  // ══════════════════════════════════════════════

  private async generateCode(componentLibrary: ComponentDefinition[]): Promise<CodeSnippet[]> {
    const snippets: CodeSnippet[] = [];

    // Generate code for top components (limit to avoid too many API calls)
    const toGenerate = componentLibrary
      .filter((c) => c.category !== "typography" && c.instanceIds.length > 0)
      .slice(0, 10);

    for (const comp of toGenerate) {
      // Get the first instance's HTML and styles
      const instanceId = comp.instanceIds[0];
      const instance = this.raw.components.find((c: any) => c.id === instanceId);
      if (!instance) continue;

      // Clean and truncate HTML
      let html = instance.html || "";
      if (html.length > 3000) html = html.slice(0, 3000) + "<!-- truncated -->";

      const messages: AiMessage[] = [
        {
          role: "system",
          content: `You are a frontend engineer. Convert raw extracted HTML into clean, reusable component code.

Generate 3 versions:
1. Clean HTML + CSS (no framework)
2. React functional component with TypeScript props
3. React with Tailwind CSS classes

Rules:
- Remove all hashed/generated CSS class names (css-xxxx, e1xxxx)
- Use semantic class names instead
- For React: use proper TypeScript interfaces for props
- For Tailwind: use appropriate utility classes
- Keep the visual structure but clean up the markup
- SVG icons should be replaced with a generic Icon component placeholder
- Return valid JSON only with keys: html, react, tailwind`,
        },
        {
          role: "user",
          content: `Component: ${comp.displayName}
Description: ${comp.description}
Props: ${comp.props.map((p) => `${p.name}: ${p.type}`).join(", ")}
Computed styles: ${JSON.stringify(instance.styles, null, 2)}

Raw HTML:
${html}

Return JSON:
{
  "html": "<!-- clean HTML + CSS here -->",
  "react": "// React + TypeScript here",
  "tailwind": "// React + Tailwind here"
}`,
        },
      ];

      try {
        const result = await this.ai.chatJson<{
          html: string;
          react: string;
          tailwind: string;
        }>(messages, { model: "smart", maxTokens: 3000 });

        snippets.push({
          componentId: comp.id,
          componentName: comp.name,
          react: result.react || "",
          html: result.html || "",
          tailwind: result.tailwind || "",
        });
      } catch {
        snippets.push({
          componentId: comp.id,
          componentName: comp.name,
          react: `// Code generation failed for ${comp.name}`,
          html: `<!-- Code generation failed for ${comp.name} -->`,
          tailwind: `// Code generation failed for ${comp.name}`,
        });
      }
    }

    return snippets;
  }

  // ══════════════════════════════════════════════
  // STEP 6: DESIGN SUMMARY
  // ══════════════════════════════════════════════

  private async createSummary(
    namedTokens: AnalysisResult["namedTokens"],
    componentLibrary: ComponentDefinition[]
  ): Promise<DesignSummary> {
    const colorSummary = namedTokens.colors
      .slice(0, 10)
      .map((c) => `${c.name} (${c.hex})`)
      .join(", ");
    const typoSummary = namedTokens.typography
      .slice(0, 5)
      .map((t) => `${t.name}: ${t.fontSize}/${t.fontWeight}`)
      .join(", ");
    const compSummary = componentLibrary
      .map((c) => `${c.displayName} (${c.category}, ${c.instanceIds.length}×)`)
      .join(", ");

    const messages: AiMessage[] = [
      {
        role: "system",
        content: `You are a design system analyst. Summarize the design system of a website in structured JSON.

Return valid JSON with these keys:
- brandDescription: 1-2 sentence brand/visual identity description
- colorPalette: Brief description of the color strategy
- typographySystem: Brief description of typography approach
- spacingSystem: Brief description of spacing approach  
- layoutApproach: Brief description of layout patterns used
- overallStyle: 2-3 word style descriptor (e.g., "Modern minimal", "Corporate clean")`,
      },
      {
        role: "user",
        content: `Website: ${this.raw.meta.title} (${this.raw.meta.url})

Colors: ${colorSummary}
Typography: ${typoSummary}
Spacing scale: ${namedTokens.spacing.map((s) => `${s.value}px`).join(", ")}
Components: ${compSummary}
Sections: ${this.raw.sections.length}

Return JSON:
{
  "brandDescription": "...",
  "colorPalette": "...",
  "typographySystem": "...",
  "spacingSystem": "...",
  "layoutApproach": "...",
  "overallStyle": "..."
}`,
      },
    ];

    try {
      const result = await this.ai.chatJson<DesignSummary>(messages, { model: "fast" });
      return { ...result, componentCount: componentLibrary.length };
    } catch {
      return {
        brandDescription: `Design system extracted from ${this.raw.meta.title}`,
        colorPalette: `${namedTokens.colors.length} colors extracted`,
        typographySystem: `${namedTokens.typography.length} type styles`,
        spacingSystem: `${namedTokens.spacing.length} spacing values`,
        layoutApproach: "Grid and flex based layouts",
        componentCount: componentLibrary.length,
        overallStyle: "Modern web",
      };
    }
  }
}

function capitalize(s: string): string {
  return s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}