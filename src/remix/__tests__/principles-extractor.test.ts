import { describe, it, expect } from "vitest";
import { extractPrinciples } from "../principles-extractor.js";
import type { DesignIR } from "../../memory/ir/types.js";

function makeIR(overrides?: Partial<DesignIR>): DesignIR {
    return {
        colors: [],
        typography: [],
        spacing: [
            { value: 4, unit: "px", evidence: [] },
            { value: 8, unit: "px", evidence: [] },
            { value: 16, unit: "px", evidence: [] },
            { value: 32, unit: "px", evidence: [] },
        ],
        radius: [],
        elevation: [],
        components: [
            {
                type: "card",
                name: "Card",
                usage: "Content container",
                styles: { default: "bg-white rounded", outlined: "border border-gray-200" },
                do: ["Use for grouping content"],
                dont: ["Nest too deeply"],
                constraints: ["Max width 600px"],
            },
        ],
        layout: [
            { type: "container", width: 1200, breakpoints: [768, 1024, 1440], evidence: [] },
            { type: "grid", evidence: [] },
        ],
        doctrine: {
            principles: ["Clean whitespace", "Color contrast > 4.5"],
            constraints: ["Mobile first", "Max 3 levels of nesting"],
            hierarchy: ["H1 > H2 > H3"],
            antiPatterns: [],
        },
        qa: { items: [] },
        motion: [
            { selector: "button", property: "transition", value: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)" },
            { selector: ".fade", property: "animation", value: "fadeIn 300ms ease-out" },
            { selector: ".btn:hover", property: "transform", value: "scale(1.05)" },
        ],
        ...overrides,
    };
}

describe("extractPrinciples", () => {
    it("extracts layout patterns from IR", () => {
        const principles = extractPrinciples(makeIR());
        expect(principles.layoutPatterns.length).toBeGreaterThanOrEqual(2);
        expect(principles.layoutPatterns.some((l) => l.type === "centered")).toBe(true);
        expect(principles.layoutPatterns.some((l) => l.type === "grid")).toBe(true);
    });

    it("preserves breakpoints and maxWidth from container layout", () => {
        const principles = extractPrinciples(makeIR());
        const container = principles.layoutPatterns.find((l) => l.type === "centered");
        expect(container?.breakpoints).toEqual([768, 1024, 1440]);
        expect(container?.maxWidth).toBe(1200);
    });

    it("extracts component patterns with variants and constraints", () => {
        const principles = extractPrinciples(makeIR());
        expect(principles.componentPatterns.length).toBe(1);
        const card = principles.componentPatterns[0];
        expect(card.name).toBe("Card");
        expect(card.variants).toContain("default");
        expect(card.variants).toContain("outlined");
        expect(card.interactions).toContain("Use for grouping content");
        expect(card.constraints.some((c) => c.includes("Max width"))).toBe(true);
        expect(card.constraints.some((c) => c.includes("DON'T"))).toBe(true);
    });

    it("calculates spacing base unit from GCD", () => {
        const principles = extractPrinciples(makeIR());
        expect(principles.spacingSystem.baseUnit).toBe(4);
        expect(principles.spacingSystem.scale).toEqual([4, 8, 16, 32]);
        expect(principles.spacingSystem.unit).toBe("px");
    });

    it("extracts motion easing and duration from transitions", () => {
        const principles = extractPrinciples(makeIR());
        expect(principles.motionStyle.easing).toContain("cubic-bezier");
        expect(principles.motionStyle.duration).toBe("200ms");
    });

    it("detects motion patterns: transitions, animations, transforms", () => {
        const principles = extractPrinciples(makeIR());
        expect(principles.motionStyle.patterns).toContain("hover transitions");
        expect(principles.motionStyle.patterns).toContain("keyframe animations");
        expect(principles.motionStyle.patterns).toContain("transforms");
    });

    it("passes through doctrine principles/constraints/hierarchy", () => {
        const principles = extractPrinciples(makeIR());
        expect(principles.principles).toEqual(["Clean whitespace", "Color contrast > 4.5"]);
        expect(principles.constraints).toEqual(["Mobile first", "Max 3 levels of nesting"]);
        expect(principles.hierarchy).toEqual(["H1 > H2 > H3"]);
    });

    it("provides default layout when IR has none", () => {
        const principles = extractPrinciples(makeIR({ layout: [] }));
        expect(principles.layoutPatterns.length).toBeGreaterThanOrEqual(1);
        expect(principles.layoutPatterns[0].type).toBe("stack");
    });

    it("provides default motion when IR has no motion data", () => {
        const principles = extractPrinciples(makeIR({ motion: [] }));
        expect(principles.motionStyle.easing).toContain("cubic-bezier");
        expect(principles.motionStyle.duration).toBe("200ms");
        expect(principles.motionStyle.patterns).toEqual(["subtle hover transitions"]);
    });
});
