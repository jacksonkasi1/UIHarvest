// ** import types
import type { ColorRole, ComponentType } from "../memory/ir/types.js";
import type { ConversationMessage } from "./chat-handler.js";

// ════════════════════════════════════════════════════
// BRAND IDENTITY
// ════════════════════════════════════════════════════

export interface BrandColor {
    hex: string;
    role: "primary" | "secondary" | "accent" | "background" | "surface" | "text" | "muted" | "border";
    name?: string;
}

export interface BrandTypography {
    family: string;
    role: "heading" | "body" | "mono";
    weights: number[];
    source?: "google" | "custom" | "system";
}

export interface BrandAsset {
    type: "logo" | "favicon" | "og-image" | "hero" | "icon";
    url: string;
    alt?: string;
    width?: number;
    height?: number;
}

export interface BrandIdentity {
    name: string;
    colors: BrandColor[];
    typography: BrandTypography[];
    assets: BrandAsset[];
    metaDescription?: string;
    domain?: string;
}

// ════════════════════════════════════════════════════
// DESIGN PRINCIPLES (extracted from reference site)
// ════════════════════════════════════════════════════

export interface LayoutPattern {
    type: "sidebar" | "topbar" | "hero" | "grid" | "split" | "stack" | "centered";
    description: string;
    breakpoints?: number[];
    maxWidth?: number;
}

export interface ComponentPattern {
    type: ComponentType;
    name: string;
    description: string;
    variants: string[];
    interactions: string[];
    constraints: string[];
}

export interface SpacingSystem {
    baseUnit: number;
    scale: number[];
    unit: "px" | "rem";
}

export interface MotionStyle {
    easing: string;
    duration: string;
    patterns: string[];
}

export interface DesignPrinciples {
    layoutPatterns: LayoutPattern[];
    componentPatterns: ComponentPattern[];
    spacingSystem: SpacingSystem;
    motionStyle: MotionStyle;
    principles: string[];
    constraints: string[];
    hierarchy: string[];
}

// ════════════════════════════════════════════════════
// REMIX SPEC (merged output)
// ════════════════════════════════════════════════════

export interface RemixPage {
    path: string;
    title: string;
    description: string;
    sections: RemixSection[];
}

export interface RemixSection {
    type: string;
    description: string;
    components: string[];
    layout: string;
}

export interface RemixSpec {
    brand: BrandIdentity;
    principles: DesignPrinciples;
    pages: RemixPage[];
    targetStack: {
        framework: "react";
        bundler: "vite";
        language: "typescript";
        styling: "tailwindcss";
        ui: "shadcn";
    };
    generationHints: string[];
}

// ════════════════════════════════════════════════════
// REMIX JOB
// ════════════════════════════════════════════════════

export type RemixPhase =
    | "init"
    | "extracting-reference"
    | "extracting-target"
    | "building-spec"
    | "generating-scaffold"
    | "generating-pages"
    | "ready"
    | "iterating"
    | "error";

export interface RemixProgressEvent {
    phase: RemixPhase;
    message: string;
    progress?: number;
    detail?: string;
    error?: string;
}

export interface GeneratedFile {
    path: string;
    content: string;
}

export interface RemixResult {
    success: boolean;
    files: GeneratedFile[];
    spec: RemixSpec;
    error?: string;
}

export type RemixJobStatus = "queued" | "running" | "done" | "error";

export interface RemixJob {
    id: string;
    referenceUrl?: string;
    targetUrl?: string;
    brandOverrides?: Partial<BrandIdentity>;
    initialPrompt?: string;
    status: RemixJobStatus;
    phase: RemixPhase;
    events: RemixProgressEvent[];
    result: RemixResult | null;
    files: GeneratedFile[];
    createdAt: number;
    listeners: Set<(event: RemixProgressEvent) => void>;
    conversationHistory?: ConversationMessage[];
}
