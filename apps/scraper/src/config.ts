// ** import core packages
import crypto from "node:crypto"

export const appConfig = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3333),
  sitePassword: process.env.SITE_PASSWORD || "",
  sessionSecret:
    process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
}

export const aiConfig = {
  apiKey: process.env.GOOGLE_CLOUD_API_KEY || "",
  modelVision: process.env.GEMINI_MODEL_VISION || "gemini-3.1-pro-preview",
  modelAnalysis:
    process.env.GEMINI_MODEL_ANALYSIS || "gemini-3.1-pro-preview",
  modelCodegen:
    process.env.GEMINI_MODEL_CODEGEN || "gemini-3.1-pro-preview",
}

export const extractConfig = {
  maxConcurrency: Number(process.env.MAX_CONCURRENCY || 0),
}

export const firestoreConfig = {
  projectId:
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIRESTORE_PROJECT_ID ||
    "",
}

export function isProduction(): boolean {
  return appConfig.nodeEnv === "production"
}
