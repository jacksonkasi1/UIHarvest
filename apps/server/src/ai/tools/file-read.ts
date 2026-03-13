// ** import lib
import { tool } from "langchain"
import { z } from "zod"

/**
 * Creates a file-read tool bound to a specific file map.
 * Reads file contents from the in-memory project state.
 */
export function createFileReadTool(fileMap: Map<string, string>) {
  return tool(
    async ({ path }) => {
      const content = fileMap.get(path)
      if (!content) {
        return `Error: File "${path}" not found in the project.`
      }
      return content
    },
    {
      name: "file_read",
      description:
        "Read the full contents of a file from the project. Use this to inspect existing code before making edits.",
      schema: z.object({
        path: z
          .string()
          .describe("File path relative to project root, e.g. src/App.tsx"),
      }),
    }
  )
}
