// ** import core packages
import { Router } from "express"

// ** import lib
import { createAuth } from "@uiharvest/auth"
import { serverConfig } from "../config.js"

const auth = createAuth({
  sitePassword: serverConfig.authDisabled ? "" : serverConfig.sitePassword,
  sessionSecret: serverConfig.sessionSecret,
  cookieDomain: serverConfig.cookieDomain,
  useBearer: true,
})

export { auth }

export const authRouter = Router()

authRouter.get("/status", (req, res) => auth.handleStatus(req, res))
authRouter.post("/login", (req, res) => auth.handleLogin(req, res))
authRouter.post("/logout", (req, res) => auth.handleLogout(req, res))
