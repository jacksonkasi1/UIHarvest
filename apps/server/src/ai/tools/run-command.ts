// ** import lib
import { tool } from "langchain"
import { z } from "zod"

/**
 * Creates a run-command tool.
 *
 * Currently this is a stub that returns the command for the frontend
 * WebContainer to execute. In a future cloud execution phase, this will
 * run commands in a real sandbox (E2B, Cloudflare Containers, etc.).
 */
export function createRunCommandTool() {
  return tool(
    async ({ command, description }) => {
      // For now, return the command to the orchestrator.
      // The agent-handler will forward this to the frontend via SSE
      // where the WebContainer will actually execute it.
      return JSON.stringify({
        action: "run_command",
        command,
        description,
        note: "Command queued for WebContainer execution on the client side.",
      })
    },
    {
      name: "run_command",
      description:
        "Run a terminal command in the project environment. Use this for installing dependencies (npm install), running builds (npm run build), or executing scripts. The command runs in the WebContainer on the client side.",
      schema: z.object({
        command: z
          .string()
          .describe(
            "The shell command to execute, e.g. 'npm install react-router-dom'"
          ),
        description: z
          .string()
          .describe(
            "Brief description of why this command is being run"
          ),
      }),
    }
  )
}
