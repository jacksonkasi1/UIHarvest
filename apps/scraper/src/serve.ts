import "dotenv/config";

// ** import utils
import path from "node:path";

// ** import apis
import { startServer } from "./server.js";

// ════════════════════════════════════════════════════
// STANDALONE WEB SERVER
//
// Starts the unified server in web mode (no CLI extraction).
// Used for Docker/GCR deployment where extraction happens
// via the /api/extract endpoint.
// ════════════════════════════════════════════════════

startServer(undefined, undefined, path.resolve(process.cwd(), "apps", "scraper"));
