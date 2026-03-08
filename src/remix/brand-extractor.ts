// ** import types
import type { DesignIR, ColorToken, TypographyToken } from "../memory/ir/types.js";
import type { BrandIdentity, BrandColor, BrandTypography, BrandAsset } from "./types.js";

// ════════════════════════════════════════════════════
// BRAND EXTRACTOR
// ════════════════════════════════════════════════════
// Extracts brand identity from a DesignIR + raw extraction data.

/**
 * Map IR color roles to brand semantic roles.
 */
function mapColorRole(irRole: string): BrandColor["role"] {
    const mapping: Record<string, BrandColor["role"]> = {
        primary: "primary",
        accent: "accent",
        surface: "surface",
        text: "text",
        muted: "muted",
        "status-success": "accent",
        "status-warning": "accent",
        "status-error": "accent",
        "status-info": "accent",
        unknown: "surface",
    };
    return mapping[irRole] ?? "surface";
}

/**
 * Sort colors by visual weight to determine primary/secondary hierarchy.
 */
function rankColors(colors: ColorToken[]): BrandColor[] {
    const roleOrder: BrandColor["role"][] = [
        "primary", "accent", "text", "background", "surface", "muted", "border", "secondary",
    ];

    const brandColors: BrandColor[] = colors.map((c) => ({
        hex: c.hex,
        role: mapColorRole(c.role),
    }));

    // Dedupe by hex
    const seen = new Set<string>();
    const unique = brandColors.filter((c) => {
        if (seen.has(c.hex.toLowerCase())) return false;
        seen.add(c.hex.toLowerCase());
        return true;
    });

    // Ensure we have a "secondary" if we have 2+ primary-like colors
    const primaries = unique.filter((c) => c.role === "primary");
    if (primaries.length > 1) {
        primaries[1].role = "secondary";
    }

    // If no secondary, pick the first accent
    if (!unique.some((c) => c.role === "secondary")) {
        const accent = unique.find((c) => c.role === "accent");
        if (accent) accent.role = "secondary";
    }

    // Sort by role priority
    return unique.sort(
        (a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
    );
}

/**
 * Extract typography families and map to heading/body/mono roles.
 */
function extractTypography(typography: TypographyToken[]): BrandTypography[] {
    // Key by family+role so same-family fonts with different roles stay separate
    const keyMap = new Map<string, { family: string; weights: Set<number>; role: string }>();

    for (const t of typography) {
        // Detect mono from family name
        const isMono = t.family.toLowerCase().includes("mono") || t.family.toLowerCase().includes("code");
        const role = isMono ? "mono" : t.role;
        const key = `${t.family}::${role}`;

        const existing = keyMap.get(key);
        if (existing) {
            existing.weights.add(t.weight);
        } else {
            keyMap.set(key, {
                family: t.family,
                weights: new Set([t.weight]),
                role,
            });
        }
    }

    const result: BrandTypography[] = [];

    for (const [, info] of keyMap) {
        const brandRole: BrandTypography["role"] =
            info.role === "heading" ? "heading" :
                info.role === "mono" ? "mono" : "body";

        const isSystem = ["Arial", "Helvetica", "Times New Roman", "Georgia", "sans-serif", "serif"]
            .some((s) => info.family.toLowerCase().includes(s.toLowerCase()));

        result.push({
            family: info.family,
            role: brandRole,
            weights: Array.from(info.weights).sort((a, b) => a - b),
            source: isSystem ? "system" : "google",
        });
    }

    // Ensure heading comes first
    return result.sort((a, b) => {
        const order = { heading: 0, body: 1, mono: 2 };
        return (order[a.role] ?? 3) - (order[b.role] ?? 3);
    });
}

/**
 * Extract logo and key images from raw extraction data.
 */
function extractAssets(rawData: any): BrandAsset[] {
    const assets: BrandAsset[] = [];

    // Try to find logo from SVGs or images
    if (rawData?.svgs) {
        for (const svg of rawData.svgs) {
            if (
                svg.context?.toLowerCase().includes("logo") ||
                svg.context?.toLowerCase().includes("brand") ||
                svg.filename?.toLowerCase().includes("logo")
            ) {
                assets.push({
                    type: "logo",
                    url: svg.filename || svg.dataUrl || "",
                    alt: svg.context || "Logo",
                });
                break;
            }
        }
    }

    if (rawData?.images) {
        for (const img of rawData.images) {
            if (
                img.alt?.toLowerCase().includes("logo") ||
                img.src?.toLowerCase().includes("logo")
            ) {
                if (!assets.some((a) => a.type === "logo")) {
                    assets.push({
                        type: "logo",
                        url: img.src || "",
                        alt: img.alt || "Logo",
                        width: img.width,
                        height: img.height,
                    });
                }
            }
        }
    }

    // Extract favicon
    if (rawData?.meta?.favicon) {
        assets.push({
            type: "favicon",
            url: rawData.meta.favicon,
        });
    }

    return assets;
}

// ════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════

/**
 * Extract a BrandIdentity from a DesignIR and raw extraction data.
 */
export function extractBrand(ir: DesignIR, rawData: any): BrandIdentity {
    const url = rawData?.meta?.url ?? "unknown";
    let domain = "unknown";
    try {
        domain = new URL(url).hostname;
    } catch { }

    const siteName =
        rawData?.meta?.title ??
        domain.replace(/^www\./, "").split(".")[0] ??
        "Unknown";

    return {
        name: siteName.charAt(0).toUpperCase() + siteName.slice(1),
        colors: rankColors(ir.colors),
        typography: extractTypography(ir.typography),
        assets: extractAssets(rawData),
        metaDescription: rawData?.meta?.description,
        domain,
    };
}
