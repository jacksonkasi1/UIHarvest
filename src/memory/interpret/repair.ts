// ** import core packages
import { z } from 'zod';

// ** import utils
import type { GeminiClient } from '../../gemini-client.js';

/**
 * Call Gemini with JSON mode, validate with Zod schema.
 * On ZodError, attempt a repair pass with error details appended to the prompt.
 * Returns null if both attempts fail.
 */
export async function callWithRepair<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  gemini: GeminiClient
): Promise<T | null> {
  try {
    const raw = await gemini.chatJson<unknown>(prompt);
    return schema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorDetails = error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      const repairPrompt = `${prompt}\n\nPrevious response was invalid. Errors: ${errorDetails}\n\nPlease fix and return valid JSON matching the schema exactly.`;

      try {
        const raw2 = await gemini.chatJson<unknown>(repairPrompt);
        return schema.parse(raw2);
      } catch {
        return null;
      }
    }
    throw error;
  }
}
