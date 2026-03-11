// ** import core packages
import { createContext, useContext } from "react"

// ════════════════════════════════════════════════════
// OUTPUT BASE CONTEXT
//
// Provides the base URL for static output files
// (screenshots, assets, fonts).
//
// CLI mode:  /output
// Job mode:  /api/extract/:jobId/output
// ════════════════════════════════════════════════════

const OutputBaseContext = createContext<string>("/output")

export const OutputBaseProvider = OutputBaseContext.Provider

/**
 * Returns the output base URL as a string ending WITHOUT a slash.
 * Use as: `${outputBase}/${path}`
 */
export function useOutputBase(): string {
    return useContext(OutputBaseContext)
}

/**
 * Convenience helper: prefixes `path` with the output base.
 *
 * @example
 *   const url = useOutputUrl()
 *   <img src={url(comp.screenshot)} />
 */
export function useOutputUrl(): (path: string | undefined | null) => string {
    const base = useContext(OutputBaseContext)
    return (path) => (path ? `${base}/${path}` : "")
}
