// ** import lib
import { tool } from "langchain"
import { z } from "zod"

/**
 * Creates a file-list tool bound to a specific file map.
 * Returns all file paths in the current project.
 */
export function createFileListTool(fileMap: Map<string, string>) {
  return tool(
    async () => {
      const paths = Array.from(fileMap.keys()).sort()
      if (paths.length === 0) {
        return "No files in the project yet."
      }
      return paths.join("\n")
    },
    {
      name: "file_list",
      description:
        "List all file paths in the current project. Use this to understand the project structure before making changes.",
      schema: z.object({}),
    }
  )
}
