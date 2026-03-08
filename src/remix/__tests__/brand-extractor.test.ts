import { describe, it, expect } from "vitest";
import { extractBrand } from "../brand-extractor.js";
import type { DesignIR } from "../../memory/ir/types.js";

// ══════════════════════════════════════════════════════
// FIXTURES
// ══════════════════════════════════════════════════════

function makeIR(overrides?: Partial<DesignIR>): DesignIR {
    return {
        colors: [
            { hex: "#3B82F6", role: "primary", evidence: [], usage: [] },
            { hex: "#10B981", role: "accent", evidence: [], usage: [] },
            { hex: "#1E293B", role: "text", evidence: [], usage: [] },
            { hex: "#F8FAFC", role: "surface", evidence: [], usage: [] },
            { hex: "#94A3B8", role: "muted", evidence: [], usage: [] },
        ],
        typography: [
            { family: "Inter", size: 32, weight: 700, lineHeight: 1.2, role: "heading", evidence: [] },
            { family: "Inter", size: 16, weight: 400, lineHeight: 1.5, role: "body", evidence: [] },
            { family: "Fira Code", size: 14, weight: 400, lineHeight: 1.6, role: "body", evidence: [] },
        ],
        spacing: [
            { value: 4, unit: "px", evidence: [] },
            { value: 8, unit: "px", evidence: [] },
            { value: 16, unit: "px", evidence: [] },
            { value: 24, unit: "px", evidence: [] },
        ],
        radius: [{ value: 8, unit: "px", evidence: [] }],
        elevation: [{ shadow: "0 1px 3px rgba(0,0,0,0.1)", level: 1, evidence: [] }],
        components: [],
        layout: [],
        doctrine: { principles: [], constraints: [], hierarchy: [], antiPatterns: [] },
        qa: { items: [] },
        motion: [],
        ...overrides,
    };
}

function makeRawData(overrides?: any) {
    return {
        meta: {
            url: "https://example.com",
            title: "Example Corp",
            description: "The best example site",
            favicon: "https://example.com/favicon.ico",
        },
        images: [
            { src: "https://example.com/logo.png", alt: "Example Logo", width: 200, height: 60 },
        ],
        svgs: [],
        ...overrides,
    };
}

// ══════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════

describe("extractBrand", () => {
    it("extracts brand name from meta title", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        expect(brand.name).toBe("Example Corp");
    });

    it("falls back to domain for brand name", () => {
        const brand = extractBrand(makeIR(), makeRawData({ meta: { url: "https://coolsite.io" } }));
        expect(brand.name).toBe("Coolsite");
    });

    it("extracts and deduplicates colors", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        const hexes = brand.colors.map((c) => c.hex);
        const uniqueHexes = new Set(hexes);
        expect(hexes.length).toBe(uniqueHexes.size);
    });

    it("has a primary color", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        expect(brand.colors.some((c) => c.role === "primary")).toBe(true);
    });

    it("has a secondary color when there's an accent", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        expect(brand.colors.some((c) => c.role === "secondary")).toBe(true);
    });

    it("extracts typography with heading/body/mono roles", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        const roles = brand.typography.map((t) => t.role);
        expect(roles).toContain("heading");
        expect(roles).toContain("body");
        expect(roles).toContain("mono");
    });

    it("sorts typography: heading first, body second, mono third", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        const roles = brand.typography.map((t) => t.role);
        expect(roles.indexOf("heading")).toBeLessThan(roles.indexOf("body"));
        expect(roles.indexOf("body")).toBeLessThan(roles.indexOf("mono"));
    });

    it("detects mono font from family name", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        const mono = brand.typography.find((t) => t.role === "mono");
        expect(mono?.family).toBe("Fira Code");
    });

    it("extracts logo from images based on alt text", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        expect(brand.assets.some((a) => a.type === "logo")).toBe(true);
    });

    it("extracts favicon from meta", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        expect(brand.assets.some((a) => a.type === "favicon")).toBe(true);
    });

    it("includes metaDescription", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        expect(brand.metaDescription).toBe("The best example site");
    });

    it("includes domain", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        expect(brand.domain).toBe("example.com");
    });

    it("aggregates font weights per family", () => {
        const brand = extractBrand(makeIR(), makeRawData());
        const inter = brand.typography.find((t) => t.family === "Inter" && t.role === "heading");
        expect(inter?.weights).toContain(700);
    });
});
