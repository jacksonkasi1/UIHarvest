#!/usr/bin/env bash
set -euo pipefail

SCRIPT_START_TS=$(date +%s)

# ════════════════════════════════════════════════════
# UIHarvest Scraper — Cloud Run deployment
# ════════════════════════════════════════════════════
#
# Usage:
#   ./deploy.sh
#
# Required (in .env or exported):
#   GOOGLE_CLOUD_API_KEY  — Gemini API key
#
# Optional:
#   SITE_PASSWORD         — Password to protect the web UI
#   GCP_PROJECT           — Google Cloud project ID
#   GCP_REGION            — Cloud Run region (default: asia-south1)
#   SERVICE_NAME          — Cloud Run service name (default: uiharvest-scraper)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load variables from an env file, skipping already-set vars.
load_env_file() {
  local env_file="$1"
  local label="$2"
  [ -f "$env_file" ] || return 0
  echo "📄  Loading ${label}…"
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    key="$(echo "$key" | xargs)"
    value="$(echo "$value" | xargs)"
    value="${value%\"}" ; value="${value#\"}"
    value="${value%\'}" ; value="${value#\'}"
    [ -z "${!key:-}" ] && export "$key=$value"
  done < "$env_file"
}

# Local scraper .env takes highest precedence; root .env fills in any missing vars.
load_env_file "${SCRIPT_DIR}/.env"        "scraper .env file"
load_env_file "${SCRIPT_DIR}/../../.env"  "root .env file"

GCS_BUCKET="${GCS_BUCKET:-uiharvest-jobs}"
SERVICE_NAME="${SERVICE_NAME:-uiharvest-scraper}"
GCP_REGION="${GCP_REGION:-asia-south1}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-10}"

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

if [ -z "${SESSION_SECRET:-}" ]; then
  SESSION_SECRET="$(printf "%s" "${SITE_PASSWORD:-uiharvest}-${GCP_PROJECT:-local}-${SERVICE_NAME}" | shasum -a 256 | awk '{print $1}')"
fi
ENV_VARS="${ENV_VARS},SESSION_SECRET=${SESSION_SECRET}"

ENV_VARS="${ENV_VARS},GCS_BUCKET=${GCS_BUCKET}"

if [ -n "${GEMINI_MODEL_VISION:-}" ]; then
  ENV_VARS="${ENV_VARS},GEMINI_MODEL_VISION=${GEMINI_MODEL_VISION}"
fi

if [ -n "${GEMINI_MODEL_ANALYSIS:-}" ]; then
  ENV_VARS="${ENV_VARS},GEMINI_MODEL_ANALYSIS=${GEMINI_MODEL_ANALYSIS}"
fi

if [ -n "${GEMINI_MODEL_CODEGEN:-}" ]; then
  ENV_VARS="${ENV_VARS},GEMINI_MODEL_CODEGEN=${GEMINI_MODEL_CODEGEN}"
fi

echo "🚀  Deploying ${SERVICE_NAME} to Cloud Run (${GCP_REGION})…"

REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [ -z "${GCP_PROJECT:-}" ]; then
  echo "❌  GCP_PROJECT is required (or set gcloud default project)"
  exit 1
fi

ARTIFACT_REPO="${ARTIFACT_REPO:-uiharvest}"
IMAGE_NAME="${IMAGE_NAME:-${SERVICE_NAME}}"

if command -v git >/dev/null 2>&1; then
  GIT_SHA="$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || true)"
else
  GIT_SHA=""
fi

if [ -n "${IMAGE_TAG:-}" ]; then
  TAG="${IMAGE_TAG}"
elif [ -n "${GIT_SHA}" ]; then
  TAG="${GIT_SHA}-$(date +%Y%m%d%H%M%S)"
else
  TAG="$(date +%Y%m%d%H%M%S)"
fi

IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${ARTIFACT_REPO}/${IMAGE_NAME}:${TAG}"
CACHE_REPO="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${ARTIFACT_REPO}/cache"

echo "📦  Using image: ${IMAGE_URI}"

if ! gcloud artifacts repositories describe "${ARTIFACT_REPO}" \
  --location "${GCP_REGION}" \
  --project "${GCP_PROJECT}" >/dev/null 2>&1; then
  echo "🧱  Creating Artifact Registry repository: ${ARTIFACT_REPO}"
  gcloud artifacts repositories create "${ARTIFACT_REPO}" \
    --repository-format=docker \
    --location "${GCP_REGION}" \
    --project "${GCP_PROJECT}" \
    --description "UIHarvest Docker images"
fi

echo "🏗️  Building image in Cloud Build (remote with cache)..."
BUILD_START_TS=$(date +%s)
gcloud builds submit "${REPO_ROOT}" \
  --project "${GCP_PROJECT}" \
  --config "${SCRIPT_DIR}/cloudbuild.yaml" \
  --substitutions "_IMAGE_URI=${IMAGE_URI},_CACHE_REPO=${CACHE_REPO}"
BUILD_END_TS=$(date +%s)
BUILD_ELAPSED=$((BUILD_END_TS - BUILD_START_TS))
echo "⏱️  Build time: ${BUILD_ELAPSED}s"

echo "☁️  Deploying prebuilt image to Cloud Run..."
DEPLOY_START_TS=$(date +%s)
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_URI}" \
  --project "${GCP_PROJECT}" \
  --region "${GCP_REGION}" \
  --allow-unauthenticated \
  --memory 16Gi \
  --cpu 8 \
  --timeout 3600 \
  --cpu-boost \
  --min-instances "${MIN_INSTANCES}" \
  --max-instances "${MAX_INSTANCES}" \
  --concurrency 80 \
  --set-env-vars "${ENV_VARS}"
DEPLOY_END_TS=$(date +%s)
DEPLOY_ELAPSED=$((DEPLOY_END_TS - DEPLOY_START_TS))
TOTAL_ELAPSED=$((DEPLOY_END_TS - SCRIPT_START_TS))
echo "⏱️  Deploy time: ${DEPLOY_ELAPSED}s"
echo "⏱️  Total time: ${TOTAL_ELAPSED}s"

URL=$(gcloud run services describe "${SERVICE_NAME}" --region "${GCP_REGION}" --format 'value(status.url)')
echo ""
echo "✅  Deployed successfully!"
echo "🌐  Live URL: $URL"
