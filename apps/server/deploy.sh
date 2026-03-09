#!/usr/bin/env bash
set -euo pipefail

# ════════════════════════════════════════════════════
# UIHarvest Server — Cloud Run deployment
# ════════════════════════════════════════════════════
#
# Usage:
#   ./deploy.sh
#
# Required (in .env or exported):
#   GOOGLE_CLOUD_API_KEY  — Gemini API key
#
# Optional:
#   SITE_PASSWORD         — Password to protect the API
#   MORPH_API_KEY         — Morph Fast Apply API key
#   GCP_PROJECT           — Google Cloud project ID
#   GCP_REGION            — Cloud Run region (default: asia-south1)
#   SERVICE_NAME          — Cloud Run service name (default: uiharvest-server)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "${SCRIPT_DIR}/../../.env" ]; then
  echo "📄  Loading root .env file…"
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    key="$(echo "$key" | xargs)"
    value="$(echo "$value" | xargs)"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    if [ -z "${!key:-}" ]; then
      export "$key=$value"
    fi
  done < "${SCRIPT_DIR}/../../.env"
fi

SERVICE_NAME="${SERVICE_NAME:-uiharvest-server}"
GCP_REGION="${GCP_REGION:-asia-south1}"

if [ -z "${GOOGLE_CLOUD_API_KEY:-}" ]; then
  echo "❌  GOOGLE_CLOUD_API_KEY is required"
  exit 1
fi

ENV_VARS="GOOGLE_CLOUD_API_KEY=${GOOGLE_CLOUD_API_KEY}"

GCP_PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
if [ -n "${GCP_PROJECT:-}" ]; then
  ENV_VARS="${ENV_VARS},GOOGLE_CLOUD_PROJECT=${GCP_PROJECT}"
fi

if [ -n "${SITE_PASSWORD:-}" ]; then
  ENV_VARS="${ENV_VARS},SITE_PASSWORD=${SITE_PASSWORD}"
fi

if [ -n "${SESSION_SECRET:-}" ]; then
  ENV_VARS="${ENV_VARS},SESSION_SECRET=${SESSION_SECRET}"
fi

if [ -n "${MORPH_API_KEY:-}" ]; then
  ENV_VARS="${ENV_VARS},MORPH_API_KEY=${MORPH_API_KEY}"
fi

if [ -n "${MORPH_BASE_URL:-}" ]; then
  ENV_VARS="${ENV_VARS},MORPH_BASE_URL=${MORPH_BASE_URL}"
fi

if [ -n "${MORPH_MODEL:-}" ]; then
  ENV_VARS="${ENV_VARS},MORPH_MODEL=${MORPH_MODEL}"
fi

if [ -n "${STUDIO_WEB_ORIGIN:-}" ]; then
  ENV_VARS="${ENV_VARS},STUDIO_WEB_ORIGIN=${STUDIO_WEB_ORIGIN}"
fi

if [ -n "${COOKIE_DOMAIN:-}" ]; then
  ENV_VARS="${ENV_VARS},COOKIE_DOMAIN=${COOKIE_DOMAIN}"
fi

echo "🚀  Deploying ${SERVICE_NAME} to Cloud Run (${GCP_REGION})…"

gcloud run deploy "${SERVICE_NAME}" \
  --source "${SCRIPT_DIR}" \
  --no-cache \
  --region "${GCP_REGION}" \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --cpu-boost \
  --min-instances 0 \
  --max-instances 5 \
  --concurrency 80 \
  --session-affinity \
  --set-env-vars "${ENV_VARS}"

URL=$(gcloud run services describe "${SERVICE_NAME}" --region "${GCP_REGION}" --format 'value(status.url)')
echo ""
echo "✅  Deployed successfully!"
echo "🌐  Live URL: $URL"
