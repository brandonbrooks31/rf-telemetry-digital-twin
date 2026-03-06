# RF Telemetry & Predictive Maintenance Digital Twin

> **Genkit-powered Node.js microservice** for real-time RF sensor anomaly detection using the **Mahalanobis distance** metric, deployed as a stateless container on **Google Cloud Run**.

---

## Architecture

```
POST /telemetry
  │
  ├─► Zod Input Validation
  ├─► Mamba-2-Inspired Context Router   (context-router.ts)
  │     └─ Routes through 3 paths: nominal / elevated / critical
  ├─► Firestore Baseline Load           (firestore.ts, TTL-cached)
  ├─► Mahalanobis Anomaly Scorer        (anomaly.ts)
  │     S(x) = √( (x-μ)ᵀ Σ⁻¹ (x-μ) )
  ├─► Firestore Logger
  │     ├─ telemetry_events      (every request)
  │     └─ anomaly_triggers      (WARNING/CRITICAL only)
  └─► JSON Response
```

### Sensor Vector (n=6)
| Dim | Signal | Units |
|-----|--------|-------|
| 0 | RSSI | dBm |
| 1 | SNR | dB |
| 2 | BER | log₁₀ |
| 3 | Doppler Shift | kHz |
| 4 | Tx Power | W |
| 5 | Carrier Deviation | ppm |

### Alert Thresholds (Chi-squared, df=6)
| Level | Score | Confidence |
|-------|-------|------------|
| NOMINAL  | S(x) < 2.449 | < 95% CI |
| WARNING  | 2.449 ≤ S(x) < 3.162 | 95–99% CI |
| CRITICAL | S(x) ≥ 3.162 | > 99% CI |

---

## API

### `POST /telemetry`

**Request:**
```json
{
  "sessionId": "HW-TRANSPONDER-001",
  "rfBand": "S-Band",
  "sensorVector": [-85.0, 14.5, -4.0, 0.2, 50.0, 0.5],
  "metadata": { "orbit": "GEO", "elevation": 42.5 }
}
```

**Response:**
```json
{
  "sessionId": "HW-TRANSPONDER-001",
  "anomalyScore": 0.312,
  "isAnomaly": false,
  "alertLevel": "NOMINAL",
  "contextState": "nominal",
  "firestoreDocId": "abc123xyz",
  "processingLatencyMs": 48,
  "timestamp": "2026-03-05T23:29:41.000Z"
}
```

### `GET /health`
Cloud Run health check. Returns `{ status: 'ok', uptime: '...' }`.

### `GET /metrics`
Lightweight counters: total requests, anomalies, errors.

---

## Firestore Schema

```
baseline_config/
  active                    ← μ, Σ, Σ⁻¹, threshold, dimensions

telemetry_events/
  {auto-id}                 ← every ingested event + result

anomaly_triggers/
  {auto-id}                 ← WARNING/CRITICAL events only, acknowledged flag
```

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Fill in GOOGLE_GENAI_API_KEY and GOOGLE_CLOUD_PROJECT

# 3. Seed Firestore baseline
npm run seed

# 4. Run locally
npm run dev

# 5. Test
curl -X POST http://localhost:8080/telemetry \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-001","rfBand":"S-Band","sensorVector":[-85,14.5,-4,0.2,50,0.5]}'
```

## Cloud Run Deployment

```bash
# Trigger Cloud Build pipeline
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_SERVICE_NAME=rf-telemetry-digital-twin \
  --project=YOUR_PROJECT_ID
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Orchestration | [Firebase Genkit](https://firebase.google.com/docs/genkit) |
| Runtime | Node.js 20 + TypeScript |
| HTTP | Express 4 |
| Math | mathjs (Mahalanobis) |
| Database | Cloud Firestore |
| Deployment | Google Cloud Run |
| CI/CD | Cloud Build |
| Validation | Zod |
