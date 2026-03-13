// ** import lib
import { createAgent, tool } from "langchain"
import { z } from "zod"
import { getLangChainModel } from "../langchain-config.js"
import { createCodeEditorAgent } from "./code-editor-agent.js"
import { createScaffoldAgent } from "./scaffold-agent.js"
import { createDebugAgent } from "./debug-agent.js"
import { createPlanAgent } from "./plan-agent.js"
import { buildOrchestratorPrompt } from "../prompts/orchestrator.js"

// ** import tools
import { createCodeEditTool } from "../tools/code-edit.js"
import { createFileReadTool } from "../tools/file-read.js"
import { createFileListTool } from "../tools/file-list.js"
import { createFileDeleteTool } from "../tools/file-delete.js"
import { createRunCommandTool } from "../tools/run-command.js"
import { createSkillTools } from "../skills/index.js"

// ** import types
import type { StoredFile } from "@uiharvest/db"
import type { GeneratedFile } from "@uiharvest/types"
import type { CodeEditCallbacks } from "../tools/code-edit.js"

// ** import types
import type { DynamicStructuredTool } from "langchain"

/**
 * Configuration for building the orchestrator agent.
 */
export interface OrchestratorConfig {
  fileMap: Map<string, string>
  currentFiles: GeneratedFile[]
  codeEditCallbacks: CodeEditCallbacks
  mcpTools?: DynamicStructuredTool[]
  projectRoot?: string
}

/**
 * Builds the full orchestrator agent with all sub-agents wired as tools.
 *
 * Architecture:
 *   Orchestrator
 *     ├── code_editor (sub-agent with file CRUD tools)
 *     ├── scaffolder (sub-agent with file + command tools)
 *     ├── debugger (sub-agent with file + command tools)
 *     ├── planner (sub-agent with file read tools)
 *     ├── load_skill / list_skills
 *     └── MCP tools (optional, user-configured)
 */
export function buildOrchestrator(config: OrchestratorConfig) {
  const {
    fileMap,
    currentFiles,
    codeEditCallbacks,
    mcpTools = [],
    projectRoot,
  } = config

  // ── Create base tools ──────────────────────────────────────────────────────
  const codeEditTool = createCodeEditTool(fileMap, codeEditCallbacks)
  const fileReadTool = createFileReadTool(fileMap)
  const fileListTool = createFileListTool(fileMap)
  const fileDeleteTool = createFileDeleteTool(fileMap)
  const runCommandTool = createRunCommandTool()
  const { loadSkill, listSkills } = createSkillTools(projectRoot)

  // ── File tools shared by most agents ───────────────────────────────────────
  const codeTools = [codeEditTool, fileReadTool, fileListTool, fileDeleteTool]
  const allCodeTools = [...codeTools, runCommandTool]

  // ── Create sub-agents ──────────────────────────────────────────────────────
  const codeEditorAgent = createCodeEditorAgent(codeTools)
  const scaffoldAgent = createScaffoldAgent(allCodeTools)
  const debugAgent = createDebugAgent(allCodeTools)
  const planAgent = createPlanAgent([fileReadTool, fileListTool])

  // ── Wrap sub-agents as tools ───────────────────────────────────────────────
  const callCodeEditor = tool(
    async ({ request }) => {
      const result = await codeEditorAgent.invoke({
        messages: [{ role: "user", content: request }],
      })
      return result.messages.at(-1)?.text ?? "Code editing completed."
    },
    {
      name: "code_editor",
      description:
        "Delegate code editing tasks: create, read, modify, or delete files in the project. Use for any code changes.",
      schema: z.object({
        request: z
          .string()
          .describe("Detailed description of the code changes to make"),
      }),
    }
  )

  const callScaffolder = tool(
    async ({ request }) => {
      const result = await scaffoldAgent.invoke({
        messages: [{ role: "user", content: request }],
      })
      return result.messages.at(-1)?.text ?? "Scaffolding completed."
    },
    {
      name: "scaffolder",
      description:
        "Delegate project scaffolding: create file structures, generate configs, install dependencies, set up boilerplate.",
      schema: z.object({
        request: z
          .string()
          .describe(
            "Description of the project or feature to scaffold"
          ),
      }),
    }
  )

  const callDebugger = tool(
    async ({ request }) => {
      const result = await debugAgent.invoke({
        messages: [{ role: "user", content: request }],
      })
      return result.messages.at(-1)?.text ?? "Debugging completed."
    },
    {
      name: "debugger",
      description:
        "Delegate debugging: analyze errors, stack traces, build failures. Reads code, proposes fixes, and applies them.",
      schema: z.object({
        request: z
          .string()
          .describe(
            "The error message, stack trace, or description of the bug to fix"
          ),
      }),
    }
  )

  const callPlanner = tool(
    async ({ request }) => {
      const result = await planAgent.invoke({
        messages: [{ role: "user", content: request }],
      })
      const lastMsg = result.messages.at(-1)
      // Plan agent uses responseFormat, check for structured response
      if (result.structuredResponse) {
        return JSON.stringify(result.structuredResponse, null, 2)
      }
      return lastMsg?.text ?? "Planning completed."
    },
    {
      name: "planner",
      description:
        "Delegate implementation planning: analyze requirements and produce a structured plan before coding. Use for complex, multi-file features.",
      schema: z.object({
        request: z
          .string()
          .describe(
            "The feature requirements or task to plan"
          ),
      }),
    }
  )

  // ── Build orchestrator ─────────────────────────────────────────────────────
  const orchestratorTools = [
    callCodeEditor,
    callScaffolder,
    callDebugger,
    callPlanner,
    loadSkill,
    listSkills,
    ...mcpTools,
  ]

  return createAgent({
    model: getLangChainModel(),
    name: "orchestrator",
    systemPrompt: buildOrchestratorPrompt(currentFiles),
    tools: orchestratorTools,
  })
}
