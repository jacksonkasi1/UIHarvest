// ** import core packages
import crypto from "node:crypto"

// ** import types
import type { Request, Response, NextFunction } from "express"

export interface AuthOptions {
  sitePassword?: string
  sessionSecret?: string
  cookieDomain?: string
  useBearer?: boolean
  sessionCookie?: string
}

export function createAuth(options: AuthOptions = {}) {
  const sitePassword = options.sitePassword || ""
  const sessionSecret =
    options.sessionSecret || crypto.randomBytes(32).toString("hex")
  const sessionCookie = options.sessionCookie || "uih_session"

  function generateSessionToken(): string {
    return crypto
      .createHmac("sha256", sessionSecret)
      .update("authenticated")
      .digest("hex")
  }

  function isValidSession(token: string): boolean {
    return token === generateSessionToken()
  }

  function getBearerToken(req: Request): string | null {
    const header = req.headers.authorization
    if (!header || !header.startsWith("Bearer ")) return null
    return header.slice("Bearer ".length).trim() || null
  }

  function isAuthenticated(req: Request): boolean {
    if (!sitePassword) return true

    const cookieToken = req.cookies?.[sessionCookie]
    if (cookieToken && isValidSession(cookieToken)) return true

    if (options.useBearer) {
      const bearerToken = getBearerToken(req)
      if (bearerToken && isValidSession(bearerToken)) return true
    }

    return false
  }

  function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (isAuthenticated(req)) {
      next()
      return
    }

    res.status(401).json({ error: "Unauthorized" })
  }

  function handleStatus(req: Request, res: Response): void {
    res.json({
      requiresPassword: !!sitePassword,
      authenticated: isAuthenticated(req),
    })
  }

  function handleLogin(req: Request, res: Response): void {
    if (!sitePassword) {
      res.json({ success: true })
      return
    }

    const { password } = req.body ?? {}
    if (password !== sitePassword) {
      res.status(401).json({ error: "Invalid password" })
      return
    }

    const token = generateSessionToken()
    res.cookie(sessionCookie, token, {
      domain: options.cookieDomain,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    })

    res.json({ success: true, token: options.useBearer ? token : undefined })
  }

  function handleLogout(_req: Request, res: Response): void {
    res.clearCookie(sessionCookie, {
      domain: options.cookieDomain,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })
    res.json({ success: true })
  }

  return {
    authMiddleware,
    handleStatus,
    handleLogin,
    handleLogout,
    generateSessionToken,
    isValidSession,
  }
}
