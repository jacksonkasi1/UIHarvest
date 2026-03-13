// ** import core packages
import crypto from "node:crypto"

export const serverConfig = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3334),
  sitePassword: process.env.SITE_PASSWORD || "",
  authDisabled: process.env.AUTH_DISABLED === "true",
  sessionSecret:
    process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  studioWebOrigin: process.env.STUDIO_WEB_ORIGIN || "http://localhost:5174",
}

const resolvedGoogleApiKey =
  process.env.GOOGLE_CLOUD_API_KEY || process.env.GOOGLE_API_KEY || ""

// LangChain google-genai provider reads GOOGLE_API_KEY from process.env.
// Always normalize to the resolved key so external shell env values cannot
// accidentally inject an unsupported token type.
if (resolvedGoogleApiKey) {
  process.env.GOOGLE_API_KEY = resolvedGoogleApiKey
}

export const aiConfig = {
  googleApiKey: resolvedGoogleApiKey,
  provider: process.env.AI_PROVIDER || "google-genai",
  model:
    process.env.AI_MODEL ||
    process.env.GEMINI_MODEL_CODEGEN ||
    process.env.GEMINI_MODEL_ANALYSIS ||
    "gemini-3.1-pro-preview",
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
