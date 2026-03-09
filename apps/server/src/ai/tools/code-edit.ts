// ** import validation
import { z } from "zod"

/**
 * Schema for the codeEdit tool.
 *
 * Uses snippet-based editing so that Morph Fast Apply can merge
 * the snippet into the original file, reducing large-model output tokens.
 *
 * The model should provide:
 * - path: file path relative to project root
 * - instructions: human-readable description of the change
 * - editSnippet: compact snippet with context markers OR full file content
 */
export const codeEditSchema = z.object({
  path: z.string().describe("File path relative to project root, e.g. src/App.tsx"),
  instructions: z.string().describe("Concise description of what this edit does"),
  editSnippet: z
    .string()
    .describe(
      "Code snippet with unchanged context markers (// ... existing code ...) or full file content if the whole file is being replaced"
    ),
})

export type CodeEditInput = z.infer<typeof codeEditSchema>
