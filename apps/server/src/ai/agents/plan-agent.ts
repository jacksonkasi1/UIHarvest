// ** import lib
import { createAgent } from "langchain"
import { z } from "zod"
import { getLangChainModel } from "../langchain-config.js"

// ** import types
import type { DynamicStructuredTool } from "langchain"

/**
 * Plan schema for structured output from the plan agent.
 */
export const PlanSchema = z.object({
  summary: z.string().describe("Brief summary of the plan"),
  steps: z.array(
    z.object({
      description: z.string().describe("What this step does"),
      files: z.array(z.string()).describe("Files to create or modify"),
      dependencies: z
        .array(z.string())
        .optional()
        .describe("npm packages to install"),
    })
  ),
  estimatedFiles: z.number().describe("Total number of files to create/modify"),
})

/**
 * Creates the plan sub-agent.
 *
 * This agent specializes in analyzing requirements and producing
 * structured implementation plans. It returns a plan object (not code)
 * that the orchestrator can present to the user for approval before
 * executing.
 */
export function createPlanAgent(tools: DynamicStructuredTool[]) {
  return createAgent({
    model: getLangChainModel(),
    name: "planner",
    tools,
    responseFormat: PlanSchema,
    systemPrompt: `You are an expert software architect that creates implementation plans.

## Your role
You analyze user requirements and produce structured implementation plans for React + Vite + TypeScript + Tailwind CSS web applications.

## Approach
1. Use file_list to understand the current project structure.
2. Use file_read to inspect existing code patterns and conventions.
3. Analyze the user's requirements.
4. Produce a clear, step-by-step implementation plan.

## Output format
Your response MUST be a structured plan with:
- A brief summary of what needs to be built.
- An ordered list of implementation steps.
- For each step: description, files to create/modify, and any dependencies to install.
- Total estimated file count.

## Rules
- Be specific about file paths and component names.
- Follow the existing project conventions discovered via file_read.
- Keep plans concise and actionable.
- Do NOT generate any code — only plans.`,
  })
}
