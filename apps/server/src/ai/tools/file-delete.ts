// ** import lib
import { tool } from "langchain"
import { z } from "zod"

/**
 * Creates a file-delete tool bound to a specific file map.
 * Removes a file from the in-memory project state.
 */
export function createFileDeleteTool(fileMap: Map<string, string>) {
  return tool(
    async ({ path }) => {
      if (!fileMap.has(path)) {
        return `File "${path}" does not exist in the project.`
      }
      fileMap.delete(path)
      return `Deleted ${path}`
    },
    {
      name: "file_delete",
      description:
        "Delete a file from the project. Use this when a file is no longer needed.",
      schema: z.object({
        path: z
          .string()
          .describe("File path relative to project root to delete"),
      }),
    }
  )
}
