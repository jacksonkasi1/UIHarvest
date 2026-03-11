// ** import core packages
import { createGoogleGenerativeAI } from "@ai-sdk/google"

// ** import lib
import { aiConfig } from "../config.js"

export const google = createGoogleGenerativeAI({
  apiKey: aiConfig.googleApiKey,
})

/**
 * Returns the primary model used for studio chat completions.
 * Defaults to gemini-2.0-flash for a good speed/quality tradeoff.
 */
export function getChatModel() {
  return google(aiConfig.model)
}
