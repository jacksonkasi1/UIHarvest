// ** import types
import type { Response } from "express"

// ** import lib
import { tool } from "langchain"
import { z } from "zod"
import { morphConfig } from "../../config.js"

// ** import types
import type { StoredFile } from "@uiharvest/db"

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

export interface CodeEditCallbacks {
  onEditStart: (path: string) => void
  onEditComplete: (file: StoredFile, instructions: string) => void
}

// ════════════════════════════════════════════════════
// MORPH FAST APPLY
// ════════════════════════════════════════════════════

async function applyMorphEdit(
  originalContent: string,
  instructions: string,
  editSnippet: string
): Promise<string | null> {
  if (!morphConfig.enabled || !morphConfig.apiKey) {
    return null
  }

  try {
    const res = await fetch(`${morphConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${morphConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: morphConfig.model,
        messages: [
          {
            role: "user",
            content: `<instruction>${instructions}</instruction>\n<code>${originalContent}</code>\n<update>${editSnippet}</update>`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      console.warn(`[morph] API returned ${res.status}`)
      return null
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const merged = data.choices?.[0]?.message?.content?.trim()
    return merged || null
  } catch (err) {
    console.warn("[morph] Apply failed:", (err as Error).message)
    return null
  }
}

// ════════════════════════════════════════════════════
// TOOL FACTORY
// ════════════════════════════════════════════════════

const codeEditSchema = z.object({
  path: z
    .string()
    .describe("File path relative to project root, e.g. src/App.tsx"),
  instructions: z
    .string()
    .describe("Concise description of what this edit does"),
  editSnippet: z
    .string()
    .describe(
      "Code snippet with unchanged context markers (// ... existing code ...) or full file content if the whole file is being replaced"
    ),
})

/**
 * Creates a code-edit tool bound to a specific file map and callbacks.
 *
 * Integrates Morph Fast Apply for snippet-based edits when available,
 * with full-file fallback.
 */
export function createCodeEditTool(
  fileMap: Map<string, string>,
  callbacks: CodeEditCallbacks
) {
  return tool(
    async ({ path, instructions, editSnippet }) => {
      callbacks.onEditStart(path)

      const originalContent = fileMap.get(path) ?? ""
      let finalContent: string

      if (originalContent) {
        // Try Morph Fast Apply first
        const morphResult = await applyMorphEdit(
          originalContent,
          instructions,
          editSnippet
        )

        if (morphResult) {
          console.log(`[code-edit] Morph applied ${path}`)
          finalContent = morphResult
        } else {
          // Fallback: snippet as-is
          finalContent = editSnippet
          console.log(`[code-edit] Morph fallback for ${path}`)
        }
      } else {
        // New file — snippet IS the full content
        finalContent = editSnippet
      }

      // Update in-memory map
      fileMap.set(path, finalContent)

      const updatedFile: StoredFile = { path, content: finalContent }
      callbacks.onEditComplete(updatedFile, instructions)

      return JSON.stringify({
        success: true,
        path,
        linesChanged: finalContent.split("\n").length,
      })
    },
    {
      name: "code_edit",
      description:
        "Edit or create a file in the project. Use a snippet with unchanged context markers (// ... existing code ...) for targeted edits, or provide full file content for new files or full rewrites.",
      schema: codeEditSchema,
    }
  )
}
