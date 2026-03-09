// ** import core packages
import { z } from 'zod';

// ** import types
import type { ColorToken, TypographyToken } from '../ir/types.js';

// ** import schema
import { colorTokenSchema, typographyTokenSchema } from '../ir/schema.js';

// ** import utils
import type { GeminiClient } from '../../gemini-client.js';

// ** import apis
import { callWithRepair } from './repair.js';
import { buildColorClassificationPrompt, buildTypographyClassificationPrompt } from './prompts.js';

export async function interpretColors(
  colors: ColorToken[],
  gemini: GeminiClient
): Promise<ColorToken[]> {
  if (colors.length === 0) return [];
  const prompt = buildColorClassificationPrompt(colors);
  const schema = z.array(colorTokenSchema);
  const result = await callWithRepair(prompt, schema, gemini);
  return result ?? colors;
}

export async function interpretTypography(
  typography: TypographyToken[],
  gemini: GeminiClient
): Promise<TypographyToken[]> {
  if (typography.length === 0) return [];
  const prompt = buildTypographyClassificationPrompt(typography);
  const schema = z.array(typographyTokenSchema);
  const result = await callWithRepair(prompt, schema, gemini);
  return result ?? typography;
}
