// ** import types
import type { BrandIdentity, DesignPrinciples, RemixSpec, RemixPage, RemixSection } from "./types.js";

// ════════════════════════════════════════════════════
// SPEC GENERATOR
// ════════════════════════════════════════════════════
// Merges BrandIdentity + DesignPrinciples → RemixSpec

/**
 * Infer pages to generate from the reference site's component/layout patterns.
 */
function inferPages(principles: DesignPrinciples, brand: BrandIdentity): RemixPage[] {
    const sections: RemixSection[] = [];

    // Hero section (nearly universal)
    sections.push({
        type: "hero",
        description: `Hero section for ${brand.name} — prominent heading, tagline, and CTA`,
        components: ["heading", "paragraph", "button"],
        layout: principles.layoutPatterns.find((l) => l.type === "centered")
            ? "centered"
            : "stack",
    });

    // Features / Value Props
    const gridLayout = principles.layoutPatterns.find((l) => l.type === "grid");
    if (gridLayout || principles.componentPatterns.some((c) => c.type === "card")) {
        sections.push({
            type: "features",
            description: "Feature showcase — cards or columns highlighting key benefits",
            components: ["card", "icon", "heading", "paragraph"],
            layout: gridLayout ? "grid" : "stack",
        });
    }

    // Navigation
    if (principles.layoutPatterns.some((l) => l.type === "topbar" || l.type === "sidebar")) {
        sections.push({
            type: "navigation",
            description: "Top navigation bar with logo, links, and CTA button",
            components: ["navigation", "button", "logo"],
            layout: "topbar",
        });
    }

    // Social proof / testimonials
    sections.push({
        type: "social-proof",
        description: "Testimonials, logos of clients, or trust indicators",
        components: ["card", "avatar", "quote"],
        layout: "grid",
    });

    // CTA section
    sections.push({
        type: "cta",
        description: "Final call-to-action section with prominent button",
        components: ["heading", "paragraph", "button"],
        layout: "centered",
    });

    // Footer
    sections.push({
        type: "footer",
        description: "Footer with links, copyright, and social icons",
        components: ["navigation", "text", "icon"],
        layout: "grid",
    });

    return [
        {
            path: "/",
            title: `${brand.name} — Home`,
            description: `Landing page for ${brand.name}`,
            sections,
        },
    ];
}

/**
 * Build generation hints from the principles + brand.
 */
function buildHints(principles: DesignPrinciples, brand: BrandIdentity): string[] {
    const hints: string[] = [];

    // Typography hints
    const headingFont = brand.typography.find((t) => t.role === "heading");
    const bodyFont = brand.typography.find((t) => t.role === "body");
    if (headingFont) {
        hints.push(`Use "${headingFont.family}" for headings (weights: ${headingFont.weights.join(", ")})`);
    }
    if (bodyFont) {
        hints.push(`Use "${bodyFont.family}" for body text (weights: ${bodyFont.weights.join(", ")})`);
    }

    // Color hints
    const primary = brand.colors.find((c) => c.role === "primary");
    const secondary = brand.colors.find((c) => c.role === "secondary");
    if (primary) hints.push(`Primary brand color: ${primary.hex}`);
    if (secondary) hints.push(`Secondary brand color: ${secondary.hex}`);

    // Motion hints
    hints.push(`Default easing: ${principles.motionStyle.easing}`);
    hints.push(`Default transition duration: ${principles.motionStyle.duration}`);

    // Spacing hints
    hints.push(`Spacing base unit: ${principles.spacingSystem.baseUnit}${principles.spacingSystem.unit}`);

    // Layout hints
    const maxWidth = principles.layoutPatterns.find((l) => l.maxWidth);
    if (maxWidth) {
        hints.push(`Content max-width: ${maxWidth.maxWidth}px`);
    }

    // Principle hints
    for (const p of principles.principles.slice(0, 5)) {
        hints.push(`Design principle: ${p}`);
    }

    return hints;
}

// ════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════

/**
 * Generate a RemixSpec by merging brand identity with design principles.
 */
export function generateRemixSpec(
    brand: BrandIdentity,
    principles: DesignPrinciples,
    customPages?: RemixPage[]
): RemixSpec {
    return {
        brand,
        principles,
        pages: customPages ?? inferPages(principles, brand),
        targetStack: {
            framework: "react",
            bundler: "vite",
            language: "typescript",
            styling: "tailwindcss",
            ui: "shadcn",
        },
        generationHints: buildHints(principles, brand),
    };
}
