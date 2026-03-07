// ** import types
import type { DesignDoctrine, DesignIR } from '../ir/types.js';

// ** import schema
import { designDoctrineSchema } from '../ir/schema.js';

// ** import utils
import type { GeminiClient } from '../../gemini-client.js';

// ** import apis
import { callWithRepair } from './repair.js';
import { buildDoctrinePrompt } from './prompts.js';

export async function interpretDoctrine(
  ir: DesignIR,
  gemini: GeminiClient
): Promise<DesignDoctrine> {
  const prompt = buildDoctrinePrompt(ir);
  const result = await callWithRepair(prompt, designDoctrineSchema, gemini);
  return result ?? { hierarchy: [], principles: [], constraints: [], antiPatterns: [] };
}
