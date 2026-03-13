// ** import lib
import { tool } from "langchain"
import { z } from "zod"
import { existsSync } from "node:fs"
import { readFile, readdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Resolves the skills directory path.
 * Checks user-installed skills first (.skills/), then built-in skills.
 */
function resolveSkillPath(skillName: string, projectRoot?: string): string | null {
  // Check user-installed skills first
  if (projectRoot) {
    const userPath = join(projectRoot, ".skills", `${skillName}.md`)
    if (existsSync(userPath)) return userPath
  }

  // Then check built-in skills
  const builtinPath = join(__dirname, `${skillName}.md`)
  if (existsSync(builtinPath)) return builtinPath

  return null
}

/**
 * Lists all available skills (user-installed + built-in).
 */
async function listAvailableSkills(projectRoot?: string): Promise<string[]> {
  const skills = new Set<string>()

  // Built-in skills
  try {
    const builtinFiles = await readdir(__dirname)
    for (const file of builtinFiles) {
      if (file.endsWith(".md")) {
        skills.add(file.replace(".md", ""))
      }
    }
  } catch {
    // No built-in skills directory
  }

  // User-installed skills
  if (projectRoot) {
    const userSkillsDir = join(projectRoot, ".skills")
    try {
      const userFiles = await readdir(userSkillsDir)
      for (const file of userFiles) {
        if (file.endsWith(".md")) {
          skills.add(file.replace(".md", ""))
        }
      }
    } catch {
      // No .skills directory
    }
  }

  return Array.from(skills).sort()
}

/**
 * Creates skill tools: load_skill and list_skills.
 *
 * Skills are markdown files with specialized prompts that give the agent
 * domain expertise. Users can install skills via `npx skills add owner/repo`.
 */
export function createSkillTools(projectRoot?: string) {
  const loadSkill = tool(
    async ({ skillName }) => {
      const skillPath = resolveSkillPath(skillName, projectRoot)
      if (!skillPath) {
        const available = await listAvailableSkills(projectRoot)
        return `Skill "${skillName}" not found. Available skills: ${available.join(", ") || "none"}`
      }
      return readFile(skillPath, "utf-8")
    },
    {
      name: "load_skill",
      description:
        "Load a specialized skill for domain expertise. Skills provide detailed knowledge about specific frameworks, patterns, and best practices. Use list_skills first to see what's available.",
      schema: z.object({
        skillName: z
          .string()
          .describe(
            "Name of the skill to load, e.g. 'react-nextjs', 'tailwind', 'api-design'"
          ),
      }),
    }
  )

  const listSkills = tool(
    async () => {
      const skills = await listAvailableSkills(projectRoot)
      if (skills.length === 0) {
        return "No skills installed. Users can add skills with: npx skills add owner/repo"
      }
      return `Available skills:\n${skills.map((s) => `- ${s}`).join("\n")}\n\nUsers can install more skills with: npx skills add owner/repo`
    },
    {
      name: "list_skills",
      description:
        "List all available skills (built-in and user-installed). Use this to discover what domain expertise is available.",
      schema: z.object({}),
    }
  )

  return { loadSkill, listSkills }
}
