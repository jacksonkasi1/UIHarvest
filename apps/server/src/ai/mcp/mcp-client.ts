// ** import lib
import { MultiServerMCPClient } from "@langchain/mcp-adapters"

// ** import types
import type { Connection } from "@langchain/mcp-adapters"

/**
 * Configuration for a single MCP server (user-facing).
 */
export interface MCPServerConfig {
  /** Transport type: stdio for local processes, http for remote servers */
  transport: "stdio" | "http"
  /** Command to run (for stdio transport) */
  command?: string
  /** Arguments for the command (for stdio transport) */
  args?: string[]
  /** URL for the server (for http transport) */
  url?: string
  /** Whether this server is enabled */
  enabled: boolean
}

/**
 * Full MCP configuration stored per-project.
 */
export interface MCPConfig {
  servers: Record<string, MCPServerConfig>
}

/**
 * Returns the default (empty) MCP configuration.
 */
export function getDefaultMCPConfig(): MCPConfig {
  return { servers: {} }
}

/**
 * Converts our MCPServerConfig into LangChain's Connection type.
 */
function toConnection(cfg: MCPServerConfig): Connection | null {
  if (cfg.transport === "stdio" && cfg.command) {
    return {
      transport: "stdio" as const,
      command: cfg.command,
      args: cfg.args ?? [],
    }
  }
  if (cfg.transport === "http" && cfg.url) {
    return {
      transport: "http" as const,
      url: cfg.url,
    }
  }
  return null
}

/**
 * Loads MCP tools from all enabled servers.
 *
 * Users can configure MCP servers via:
 * - UI: Add/remove/toggle MCP servers in project settings
 * - Config file: .uiharvest/mcp.json in project root
 *
 * Only enabled servers are connected.
 * Returns an empty array if no servers are configured or all are disabled.
 */
export async function getMCPTools(config: MCPConfig) {
  const enabledServers = Object.entries(config.servers).filter(
    ([_, cfg]) => cfg.enabled
  )

  if (enabledServers.length === 0) {
    return []
  }

  try {
    const connectionMap: Record<string, Connection> = {}

    for (const [name, cfg] of enabledServers) {
      const conn = toConnection(cfg)
      if (conn) {
        connectionMap[name] = conn
      }
    }

    if (Object.keys(connectionMap).length === 0) {
      return []
    }

    const client = new MultiServerMCPClient(connectionMap)
    return await client.getTools()
  } catch (err) {
    console.warn("[mcp] Failed to load MCP tools:", (err as Error).message)
    return []
  }
}
