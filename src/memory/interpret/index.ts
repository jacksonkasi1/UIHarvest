// ** import types
import type { DesignIR } from '../ir/types.js';

// ** import utils
import type { GeminiClient } from '../../gemini-client.js';

// ** import apis
import { interpretColors, interpretTypography } from './tokens.js';
import { interpretComponents } from './components.js';
import { interpretDoctrine } from './doctrine.js';
import { generateQAChecklist } from './qa.js';

/**
 * Run the full interpret stage: classify tokens, enrich components,
 * generate doctrine and QA checklist. Returns a complete DesignIR.
 */
export async function runInterpretStage(
  partial: Partial<DesignIR>,
  gemini: GeminiClient
): Promise<DesignIR> {
  const colors = await interpretColors(partial.colors ?? [], gemini);
  const typography = await interpretTypography(partial.typography ?? [], gemini);
  const components = await interpretComponents(partial.components ?? [], gemini);

  // Build a partial IR with classified tokens for doctrine generation
  const preIR: DesignIR = {
    colors,
    typography,
    spacing: partial.spacing ?? [],
    radius: partial.radius ?? [],
    elevation: partial.elevation ?? [],
    layout: partial.layout ?? [],
    components,
    doctrine: { hierarchy: [], principles: [], constraints: [], antiPatterns: [] },
    qa: { items: [] },
    variables: partial.variables,
    motion: partial.motion,
    breakpoints: partial.breakpoints,
    classAnalysis: partial.classAnalysis,
  };

  const doctrine = await interpretDoctrine(preIR, gemini);
  const qa = generateQAChecklist(preIR);

  return { ...preIR, doctrine, qa };
}
