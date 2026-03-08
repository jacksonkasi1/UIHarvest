import { describe, it, expect } from "vitest";
import { generateRemixSpec } from "../spec-generator.js";
import type { BrandIdentity, DesignPrinciples } from "../types.js";

function makeBrand(overrides?: Partial<BrandIdentity>): BrandIdentity {
    return {
        name: "TestBrand",
        colors: [
            { hex: "#3B82F6", role: "primary" },
            { hex: "#10B981", role: "secondary" },
            { hex: "#1E293B", role: "text" },
        ],
        typography: [
            { family: "Outfit", role: "heading", weights: [600, 700], source: "google" },
            { family: "DM Sans", role: "body", weights: [400, 500], source: "google" },
        ],
        assets: [],
        metaDescription: "A test brand",
        domain: "testbrand.com",
        ...overrides,
    };
}

function makePrinciples(overrides?: Partial<DesignPrinciples>): DesignPrinciples {
    return {
        layoutPatterns: [
            { type: "centered", description: "Centered container (max-width: 1200px)", maxWidth: 1200 },
            { type: "grid", description: "12-column grid" },
        ],
        componentPatterns: [
            { type: "card", name: "Card", description: "Content card", variants: ["default"], interactions: [], constraints: [] },
        ],
        spacingSystem: { baseUnit: 4, scale: [4, 8, 16, 24, 32, 48], unit: "px" },
        motionStyle: { easing: "cubic-bezier(0.4, 0, 0.2, 1)", duration: "200ms", patterns: ["hover transitions"] },
        principles: ["Clean whitespace", "Consistent spacing"],
        constraints: ["Mobile first"],
        hierarchy: ["H1 > H2"],
        ...overrides,
    };
}

describe("generateRemixSpec", () => {
    it("merges brand and principles into a spec", () => {
        const spec = generateRemixSpec(makeBrand(), makePrinciples());
        expect(spec.brand.name).toBe("TestBrand");
        expect(spec.principles.spacingSystem.baseUnit).toBe(4);
    });

    it("enforces the target stack", () => {
        const spec = generateRemixSpec(makeBrand(), makePrinciples());
        expect(spec.targetStack).toEqual({
            framework: "react",
            bundler: "vite",
            language: "typescript",
            styling: "tailwindcss",
            ui: "shadcn",
        });
    });

    it("infers a home page with hero and footer sections", () => {
        const spec = generateRemixSpec(makeBrand(), makePrinciples());
        expect(spec.pages.length).toBeGreaterThanOrEqual(1);
        const home = spec.pages[0];
        expect(home.path).toBe("/");
        expect(home.title).toContain("TestBrand");
        expect(home.sections.some((s) => s.type === "hero")).toBe(true);
        expect(home.sections.some((s) => s.type === "footer")).toBe(true);
    });

    it("generates hints from brand typography", () => {
        const spec = generateRemixSpec(makeBrand(), makePrinciples());
        expect(spec.generationHints.some((h) => h.includes("Outfit"))).toBe(true);
        expect(spec.generationHints.some((h) => h.includes("DM Sans"))).toBe(true);
    });

    it("generates hints from brand colors", () => {
        const spec = generateRemixSpec(makeBrand(), makePrinciples());
        expect(spec.generationHints.some((h) => h.includes("#3B82F6"))).toBe(true);
    });

    it("generates hints from motion style", () => {
        const spec = generateRemixSpec(makeBrand(), makePrinciples());
        expect(spec.generationHints.some((h) => h.includes("cubic-bezier"))).toBe(true);
        expect(spec.generationHints.some((h) => h.includes("200ms"))).toBe(true);
    });

    it("generates hint from max-width layout", () => {
        const spec = generateRemixSpec(makeBrand(), makePrinciples());
        expect(spec.generationHints.some((h) => h.includes("1200"))).toBe(true);
    });

    it("includes design principles as hints", () => {
        const spec = generateRemixSpec(makeBrand(), makePrinciples());
        expect(spec.generationHints.some((h) => h.includes("Clean whitespace"))).toBe(true);
    });

    it("uses custom pages when provided", () => {
        const customPages = [
            { path: "/about", title: "About", description: "About page", sections: [] },
        ];
        const spec = generateRemixSpec(makeBrand(), makePrinciples(), customPages);
        expect(spec.pages.length).toBe(1);
        expect(spec.pages[0].path).toBe("/about");
    });

    it("infers features section when grid layout and card component exist", () => {
        const spec = generateRemixSpec(makeBrand(), makePrinciples());
        const home = spec.pages[0];
        expect(home.sections.some((s) => s.type === "features")).toBe(true);
    });

    it("infers navigation when topbar layout exists", () => {
        const principles = makePrinciples({
            layoutPatterns: [
                { type: "topbar", description: "Top navigation bar" },
            ],
        });
        const spec = generateRemixSpec(makeBrand(), principles);
        const home = spec.pages[0];
        expect(home.sections.some((s) => s.type === "navigation")).toBe(true);
    });
});
