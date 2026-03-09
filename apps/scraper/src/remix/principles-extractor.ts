// ** import types
import type { DesignIR } from "../memory/ir/types.js";
import type {
    DesignPrinciples,
    LayoutPattern,
    ComponentPattern,
    SpacingSystem,
    MotionStyle,
} from "./types.js";

// ════════════════════════════════════════════════════
// PRINCIPLES EXTRACTOR
// ════════════════════════════════════════════════════
// Extracts design principles from a DesignIR (reference site).

/**
 * Extract layout patterns from IR layout primitives.
 */
function extractLayouts(ir: DesignIR): LayoutPattern[] {
    const patterns: LayoutPattern[] = [];

    for (const layout of ir.layout) {
        patterns.push({
            type: layout.type === "container" ? "centered" :
                layout.type === "sidebar" ? "sidebar" :
                    layout.type === "topbar" ? "topbar" :
                        layout.type === "grid" ? "grid" :
                            "stack",
            description: `${layout.type} layout${layout.width ? ` (max-width: ${layout.width}px)` : ""}`,
            breakpoints: layout.breakpoints,
            maxWidth: layout.width,
        });
    }

    // If no patterns found, add sensible defaults based on breakpoints
    if (patterns.length === 0) {
        patterns.push({
            type: "stack",
            description: "Vertical stack layout (default)",
        });
    }

    return patterns;
}

/**
 * Extract component patterns from IR component recipes.
 */
function extractComponents(ir: DesignIR): ComponentPattern[] {
    return ir.components.map((comp) => ({
        type: comp.type,
        name: comp.name,
        description: comp.usage || `${comp.type} component`,
        variants: Object.keys(comp.styles),
        interactions: comp.do || [],
        constraints: [...comp.constraints, ...comp.dont.map((d) => `DON'T: ${d}`)],
    }));
}

/**
 * Extract spacing system from IR spacing tokens.
 */
function extractSpacing(ir: DesignIR): SpacingSystem {
    const values = ir.spacing.map((s) => s.value).sort((a, b) => a - b);

    // Try to determine base unit (most common smallest increment)
    let baseUnit = 4;
    if (values.length >= 2) {
        const diffs = values.slice(1).map((v, i) => v - values[i]);
        const gcd = diffs.reduce((a, b) => {
            while (b) { [a, b] = [b, a % b]; }
            return a;
        }, diffs[0] || 4);
        baseUnit = Math.max(gcd, 1);
    }

    const unit = ir.spacing[0]?.unit ?? "px";

    return {
        baseUnit,
        scale: values,
        unit: unit === "em" ? "rem" : unit,
    };
}

/**
 * Extract motion style from IR motion tokens.
 */
function extractMotion(ir: DesignIR): MotionStyle {
    const transitions = ir.motion?.filter((m) => m.property === "transition") ?? [];
    const animations = ir.motion?.filter((m) => m.property === "animation") ?? [];

    // Find dominant easing
    const easings = transitions
        .map((t) => {
            const match = t.value.match(/cubic-bezier\([^)]+\)|ease(?:-in-out|-in|-out)?|linear/);
            return match?.[0];
        })
        .filter(Boolean);

    const easing = easings[0] ?? "cubic-bezier(0.4, 0, 0.2, 1)";

    // Find dominant duration
    const durations = transitions
        .map((t) => {
            const match = t.value.match(/(\d+(?:\.\d+)?m?s)/);
            return match?.[1];
        })
        .filter(Boolean);

    const duration = durations[0] ?? "200ms";

    const patterns: string[] = [];
    if (transitions.length > 0) patterns.push("hover transitions");
    if (animations.length > 0) patterns.push("keyframe animations");
    if (ir.motion?.some((m) => m.property === "transform")) patterns.push("transforms");

    return {
        easing,
        duration,
        patterns: patterns.length > 0 ? patterns : ["subtle hover transitions"],
    };
}

// ════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════

/**
 * Extract DesignPrinciples from a reference site's DesignIR.
 */
export function extractPrinciples(ir: DesignIR): DesignPrinciples {
    return {
        layoutPatterns: extractLayouts(ir),
        componentPatterns: extractComponents(ir),
        spacingSystem: extractSpacing(ir),
        motionStyle: extractMotion(ir),
        principles: ir.doctrine.principles,
        constraints: ir.doctrine.constraints,
        hierarchy: ir.doctrine.hierarchy,
    };
}
