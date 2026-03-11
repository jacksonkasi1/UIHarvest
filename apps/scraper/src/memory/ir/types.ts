// ** Colour roles
export type ColorRole =
  | 'primary'
  | 'accent'
  | 'surface'
  | 'text'
  | 'muted'
  | 'status-success'
  | 'status-warning'
  | 'status-error'
  | 'status-info'
  | 'unknown';

export type ComponentType = 'button' | 'input' | 'card' | 'table' | 'modal' | 'navigation' | 'form' | 'unknown';

// ── Token types ─────────────────────────────────────────────────────────────

export interface ColorToken {
  hex: string;
  role: ColorRole;
  evidence: string[];
  usage: string[];
}

export interface TypographyToken {
  family: string;
  size: number;
  weight: number;
  lineHeight: number;
  role: 'heading' | 'body' | 'caption' | 'label' | 'unknown';
  evidence: string[];
}

export interface SpacingToken {
  value: number;
  unit: 'px' | 'rem' | 'em';
  evidence: string[];
}

export interface RadiusToken {
  value: number;
  unit: 'px' | 'rem' | 'em';
  evidence: string[];
}

export interface ElevationToken {
  shadow: string;
  level: number;
  evidence: string[];
}

export interface CSSVariableToken {
  name: string;
  value: string;
  source: 'root' | 'body';
}

export interface MotionToken {
  selector: string;
  property: 'transition' | 'animation' | 'transform';
  value: string;
}

export interface BreakpointToken {
  values: number[];
  raw: string[];
}

export interface ClassAnalysisToken {
  isTailwind: boolean;
  topClasses: string[];
  tailwindPatterns: string[];
}

// ── Component / layout types ─────────────────────────────────────────────────

export interface ComponentRecipe {
  type: ComponentType;
  name: string;
  styles: Record<string, string>;
  usage: string;
  constraints: string[];
  do: string[];
  dont: string[];
}

export interface LayoutPrimitive {
  type: 'sidebar' | 'topbar' | 'container' | 'grid' | 'flex';
  width?: number;
  breakpoints?: number[];
  evidence: string[];
}

// ── Doctrine / QA types ───────────────────────────────────────────────────────

export interface DesignDoctrine {
  hierarchy: string[];
  principles: string[];
  constraints: string[];
  antiPatterns: string[];
}

export interface QAChecklist {
  items: Array<{ category: string; checks: string[] }>;
}

// ── Intermediate Representation ────────────────────────────────────────────────

export interface DesignIR {
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
  radius: RadiusToken[];
  elevation: ElevationToken[];
  layout: LayoutPrimitive[];
  components: ComponentRecipe[];
  doctrine: DesignDoctrine;
  qa: QAChecklist;
  // Phase 2
  variables?: CSSVariableToken[];
  motion?: MotionToken[];
  breakpoints?: BreakpointToken;
  classAnalysis?: ClassAnalysisToken;
}

// ── ComputedStyle (input to analyze functions) ────────────────────────────────

export interface ComputedStyle {
  selector: string;
  properties: Record<string, string>;
}
