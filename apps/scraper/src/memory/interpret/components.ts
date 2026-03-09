// ** import core packages
import { z } from 'zod';

// ** import types
import type { ComponentRecipe } from '../ir/types.js';

// ** import schema
import { componentRecipeSchema } from '../ir/schema.js';

// ** import utils
import type { GeminiClient } from '../../gemini-client.js';

// ** import apis
import { callWithRepair } from './repair.js';
import { buildComponentRecipePrompt } from './prompts.js';

export async function interpretComponents(
  components: ComponentRecipe[],
  gemini: GeminiClient
): Promise<ComponentRecipe[]> {
  if (components.length === 0) return [];
  const prompt = buildComponentRecipePrompt(components);
  const schema = z.array(componentRecipeSchema);
  const result = await callWithRepair(prompt, schema, gemini);
  return result ?? components;
}
