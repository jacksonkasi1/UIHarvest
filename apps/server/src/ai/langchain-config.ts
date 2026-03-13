// ** import lib
import { aiConfig } from "../config.js"

/**
 * Returns a LangChain-compatible model identifier string.
 *
 * Defaults to "google-genai:gemini-3.2-pro".
 * Other supported values:
 *   - "google-genai:gemini-3.1-pro-preview"
 *   - "google-genai:gemini-3.1-flash-light"
 *   - "anthropic:claude-sonnet-4-20250514"
 *   - "openai:gpt-4.1"
 */
export function getLangChainModel(modelOverride?: string): string {
  const model = modelOverride || aiConfig.model
  const provider = aiConfig.provider
  return `${provider}:${model}`
}
