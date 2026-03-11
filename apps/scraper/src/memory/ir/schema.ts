import { z } from 'zod';

// ── Token schemas ─────────────────────────────────────────────────────────────

export const colorTokenSchema = z.object({
  hex: z.string(),
  role: z.enum(['primary', 'accent', 'surface', 'text', 'muted', 'status-success', 'status-warning', 'status-error', 'status-info', 'unknown']),
  evidence: z.array(z.string()),
  usage: z.array(z.string()),
});

export const typographyTokenSchema = z.object({
  family: z.string(),
  size: z.number(),
  weight: z.number(),
  lineHeight: z.number(),
  role: z.enum(['heading', 'body', 'caption', 'label', 'unknown']),
  evidence: z.array(z.string()),
});

export const spacingTokenSchema = z.object({
  value: z.number(),
  unit: z.enum(['px', 'rem', 'em']),
  evidence: z.array(z.string()),
});

export const radiusTokenSchema = z.object({
  value: z.number(),
  unit: z.enum(['px', 'rem', 'em']),
  evidence: z.array(z.string()),
});

export const elevationTokenSchema = z.object({
  shadow: z.string(),
  level: z.number(),
  evidence: z.array(z.string()),
});

// ── Component / layout schemas ────────────────────────────────────────────────

export const componentRecipeSchema = z.object({
  type: z.enum(['button', 'input', 'card', 'table', 'modal', 'navigation', 'form', 'unknown']),
  name: z.string(),
  styles: z.record(z.string(), z.string()),
  usage: z.string(),
  constraints: z.array(z.string()),
  do: z.array(z.string()),
  dont: z.array(z.string()),
});

export const layoutPrimitiveSchema = z.object({
  type: z.enum(['sidebar', 'topbar', 'container', 'grid', 'flex']),
  width: z.number().optional(),
  breakpoints: z.array(z.number()).optional(),
  evidence: z.array(z.string()),
});

// ── Doctrine / QA schemas ─────────────────────────────────────────────────────

export const designDoctrineSchema = z.object({
  hierarchy: z.array(z.string()),
  principles: z.array(z.string()),
  constraints: z.array(z.string()),
  antiPatterns: z.array(z.string()),
});

export const qaChecklistSchema = z.object({
  items: z.array(z.object({
    category: z.string(),
    checks: z.array(z.string()),
  })),
});

export const designIRSchema = z.object({
  colors: z.array(colorTokenSchema),
  typography: z.array(typographyTokenSchema),
  spacing: z.array(spacingTokenSchema),
  radius: z.array(radiusTokenSchema),
  elevation: z.array(elevationTokenSchema),
  layout: z.array(layoutPrimitiveSchema),
  components: z.array(componentRecipeSchema),
  doctrine: designDoctrineSchema,
  qa: qaChecklistSchema,
});
