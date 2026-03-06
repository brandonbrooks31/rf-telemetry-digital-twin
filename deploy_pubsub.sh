#!/usr/bin/env bash
# deploy_pubsub.sh
# ─────────────────────────────────────────────────────────────────────────────
# Pub/Sub Push Subscription + Zero-Trust IAM Setup
# for rf-telemetry-digital-twin (Cloud Run)
#
# Architecture:
#   Edge Hardware  →  Pub/Sub Topic (edge-telemetry-ingress)
#                  →  Push Subscription (OIDC-authenticated)
#                  →  Cloud Run /pubsub endpoint (--no-allow-unauthenticated)
#
# Prerequisites:
#   gcloud auth login && gcloud config set project YOUR_PROJECT_ID
#   Cloud Run service already deployed (see cloudbuild.yaml)
#
# Usage:
#   chmod +x deploy_pubsub.sh
#   ./deploy_pubsub.sh YOUR_PROJECT_ID us-central1
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Arguments ────────────────────────────────────────────────────────────────
PROJECT_ID="${1:?Usage: $0 PROJECT_ID [REGION]}"
REGION="${2:-us-central1}"

# ── Constants ─────────────────────────────────────────────────────────────────
SERVICE_NAME="rf-telemetry-digital-twin"
TOPIC_NAME="edge-telemetry-ingress"
SUBSCRIPTION_NAME="edge-telemetry-push-sub"
SA_NAME="pubsub-invoker-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " RF Telemetry Digital Twin — Pub/Sub + IAM Provisioning"
echo " Project : ${PROJECT_ID}"
echo " Region  : ${REGION}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Enable required APIs ─────────────────────────────────────────────
echo ""
echo "[1/7] Enabling required GCP APIs..."
gcloud services enable \
  pubsub.googleapis.com \
  run.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project="${PROJECT_ID}"

# ── Step 2: Resolve Cloud Run endpoint URL ───────────────────────────────────
echo ""
echo "[2/7] Resolving Cloud Run service URL..."
CLOUD_RUN_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)")

PUBSUB_PUSH_ENDPOINT="${CLOUD_RUN_URL}/pubsub"
echo "      Cloud Run URL   : ${CLOUD_RUN_URL}"
echo "      Push endpoint   : ${PUBSUB_PUSH_ENDPOINT}"

# ── Step 3: Lock down Cloud Run (remove public access) ───────────────────────
echo ""
echo "[3/7] Locking down Cloud Run to authenticated requests only (Zero-Trust)..."
gcloud run services update "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --no-allow-unauthenticated
echo "      ✓ Cloud Run is now private (--no-allow-unauthenticated)"

# ── Step 4: Create OIDC invoker Service Account ──────────────────────────────
echo ""
echo "[4/7] Creating Pub/Sub OIDC invoker service account..."
if gcloud iam service-accounts describe "${SA_EMAIL}" \
  --project="${PROJECT_ID}" &>/dev/null; then
  echo "      ✓ Service account already exists: ${SA_EMAIL}"
else
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="Pub/Sub → Cloud Run OIDC Invoker" \
    --project="${PROJECT_ID}"
  echo "      ✓ Created service account: ${SA_EMAIL}"
fi

# Grant Cloud Run invoker role to the service account
gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.invoker"
echo "      ✓ Granted roles/run.invoker to ${SA_EMAIL}"

# Also grant the Pub/Sub system account permission to create OIDC tokens
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
PUBSUB_SA="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${PUBSUB_SA}" \
  --role="roles/iam.serviceAccountTokenCreator"
echo "      ✓ Granted roles/iam.serviceAccountTokenCreator to Pub/Sub system SA"

# ── Step 5: Create Pub/Sub Topic ─────────────────────────────────────────────
echo ""
echo "[5/7] Creating Pub/Sub topic: ${TOPIC_NAME}..."
if gcloud pubsub topics describe "${TOPIC_NAME}" \
  --project="${PROJECT_ID}" &>/dev/null; then
  echo "      ✓ Topic already exists"
else
  gcloud pubsub topics create "${TOPIC_NAME}" \
    --project="${PROJECT_ID}" \
    --labels="service=rf-telemetry,env=production"
  echo "      ✓ Topic created: projects/${PROJECT_ID}/topics/${TOPIC_NAME}"
fi

# ── Step 6: Create Push Subscription with OIDC ───────────────────────────────
echo ""
echo "[6/7] Creating push subscription with OIDC authentication..."
if gcloud pubsub subscriptions describe "${SUBSCRIPTION_NAME}" \
  --project="${PROJECT_ID}" &>/dev/null; then
  echo "      ✓ Subscription already exists — updating push config..."
  gcloud pubsub subscriptions modify-push-config "${SUBSCRIPTION_NAME}" \
    --project="${PROJECT_ID}" \
    --push-endpoint="${PUBSUB_PUSH_ENDPOINT}" \
    --push-auth-service-account="${SA_EMAIL}" \
    --push-auth-token-audience="${CLOUD_RUN_URL}"
else
  gcloud pubsub subscriptions create "${SUBSCRIPTION_NAME}" \
    --project="${PROJECT_ID}" \
    --topic="${TOPIC_NAME}" \
    --push-endpoint="${PUBSUB_PUSH_ENDPOINT}" \
    --push-auth-service-account="${SA_EMAIL}" \
    --push-auth-token-audience="${CLOUD_RUN_URL}" \
    --ack-deadline=30 \
    --message-retention-duration=10m \
    --min-retry-delay=5s \
    --max-retry-delay=60s
  echo "      ✓ Push subscription created with OIDC: ${SUBSCRIPTION_NAME}"
fi

# ── Step 7: Smoke test — publish a test message ──────────────────────────────
echo ""
echo "[7/7] Publishing smoke-test telemetry message to topic..."
TEST_PAYLOAD=$(cat <<'EOF'
{
  "sessionId": "DEPLOY-SMOKE-TEST",
  "rfBand": "S-Band",
  "sensorVector": [-85.0, 14.5, -4.0, 0.2, 50.0, 0.5],
  "metadata": { "source": "deploy_pubsub.sh", "test": true }
}
EOF
)
gcloud pubsub topics publish "${TOPIC_NAME}" \
  --project="${PROJECT_ID}" \
  --message="${TEST_PAYLOAD}" \
  --attribute="source=smoke-test,version=1"
echo "      ✓ Smoke-test message published"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✅  INFRASTRUCTURE READY"
echo ""
echo " Topic           : projects/${PROJECT_ID}/topics/${TOPIC_NAME}"
echo " Subscription    : ${SUBSCRIPTION_NAME} (push → ${PUBSUB_PUSH_ENDPOINT})"
echo " OIDC SA         : ${SA_EMAIL}"
echo " Cloud Run auth  : Private (OIDC only — Zero Trust ✓)"
echo ""
echo " To publish from edge hardware:"
echo "   gcloud pubsub topics publish ${TOPIC_NAME} \\"
echo "     --project=${PROJECT_ID} \\"
echo '     --message='"'"'{"sessionId":"HW-01","sensorVector":[-85,14,-4,0.2,50,0.5]}'"\'"'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
