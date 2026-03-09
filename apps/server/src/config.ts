// ** import core packages
import crypto from "node:crypto"

export const serverConfig = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3334),
  sitePassword: process.env.SITE_PASSWORD || "",
  sessionSecret:
    process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  studioWebOrigin: process.env.STUDIO_WEB_ORIGIN || "http://localhost:5174",
}

export const aiConfig = {
  googleApiKey: process.env.GOOGLE_CLOUD_API_KEY || "",
  model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
}

export const morphConfig = {
  apiKey: process.env.MORPH_API_KEY || "",
  baseUrl: process.env.MORPH_BASE_URL || "https://api.morphllm.com/v1",
  model: process.env.MORPH_MODEL || "morph-v3-auto",
  enabled: process.env.MORPH_ENABLED !== "false",
}

export const firestoreConfig = {
  projectId:
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIRESTORE_PROJECT_ID ||
    "",
}

export function isProduction(): boolean {
  return serverConfig.nodeEnv === "production"
}
