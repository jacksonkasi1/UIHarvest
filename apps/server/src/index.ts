// ** import core packages
import express from "express"
import cookieParser from "cookie-parser"
import cors from "cors"

// ** import utils
import "dotenv/config"

// ** import lib
import { serverConfig } from "./config.js"

// ** import apis
import { authRouter } from "./routes/auth.js"
import { chatRouter } from "./routes/chat.js"

const app = express()
const port = serverConfig.port

// ── CORS ────────────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: serverConfig.studioWebOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
)

// ── Body parsing ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: "10mb" }))
app.use(cookieParser())

// ── Routes ───────────────────────────────────────────────────────────────────

app.use("/api/auth", authRouter)
app.use("/api", chatRouter)

// ── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

// ── Start ─────────────────────────────────────────────────────────────────────

const listen = (p: number) => {
  const server = app.listen(p, () => {
    console.log(`\n🤖  UIHarvest Studio API → http://localhost:${p}`)
  })

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.log(`⚠️  Port ${p} in use, trying ${p + 1}…`)
      listen(p + 1)
      return
    }
    console.error("❌ Failed to start server:", err)
    process.exit(1)
  })
}

listen(port)
