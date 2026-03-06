# Product Requirements Document
## RF Telemetry Digital Twin — MVP v1.0
**Status:** In Development | **Date:** March 2026 | **Owner:** brandonbrooks31

---

## 1. Executive Summary

This PRD defines the MVP for **rf-telemetry-digital-twin**, a FACE/MOSA-aligned SaaS platform providing real-time RF telemetry anomaly detection via a cloud-native Mahalanobis distance scoring API. The MVP transitions from a standalone HTTP endpoint to a **Zero-Trust, OIDC-authenticated Google Cloud Pub/Sub event-driven pipeline** suitable for enterprise and government customers.

---

## 2. Goals & Success Metrics

| Goal | KPI | Target (60-day post-launch) |
|------|-----|-----------------------------|
| Pipeline availability | Uptime SLA | ≥ 99.5% |
| Anomaly detection accuracy | False positive rate | ≤ 1% (χ² 95th percentile) |
| Latency | P99 processing time | ≤ 500ms end-to-end |
| Developer adoption | Active API keys | 10 by Day 30 |
| Pilot revenue | MRO contracts signed | 2 by Day 60 |

---

## 3. User Personas

### Persona 1: RF Systems Engineer ("Maya")
- **Goal:** Quantitative anomaly score without involving a data scientist
- **Frustration:** Current tools over-alert (noise) or miss correlated faults
- **MVP Need:** `POST /telemetry` → score + Firestore log → webhook alert

### Persona 2: DoD Program Manager ("Col. Reyes")
- **Goal:** FACE-certifiable, FedRAMP-roadmapped RF CBM software
- **Frustration:** Proprietary tools are not open-standard or certifiable
- **MVP Need:** API documentation, FACE alignment statement, `simulate_edge.ts` test suite

### Persona 3: Integration Architect ("Dev Patel")
- **Goal:** Integrate RF anomaly scoring into existing Pub/Sub pipeline in < 1 day
- **Frustration:** CBM tools require hardware co-procurement or on-prem deployment
- **MVP Need:** OpenAPI spec, `deploy_pubsub.sh` quickstart, `docs/rf_simulation.ipynb` demo

---

## 4. Functional Requirements

### 4.1 Core Endpoints

| Endpoint | Method | Auth | Priority |
|----------|--------|------|----------|
| `/telemetry` | POST | Optional Bearer | P0 — MVP |
| `/pubsub` | POST | OIDC (Google-signed JWT) | P0 — MVP |
| `/health` | GET | None | P0 — MVP |
| `/metrics` | GET | None | P0 — MVP |
| `/baseline` | GET | API key | P1 — v1.1 |
| `/telemetry/history` | GET | API key | P1 — v1.1 |

### 4.2 Pub/Sub Zero-Trust Pipeline (P0)

```
Edge Hardware / Simulator
         │
         ▼
 Pub/Sub Topic: edge-telemetry-ingress
         │  (base64-encoded JSON payload)
         ▼
 Push Subscription (OIDC-authenticated)
         │  Authorization: Bearer <Google-signed JWT>
         ▼
 Cloud Run POST /pubsub
         │
         ├── Verify OIDC token (OAuth2Client)
         ├── Decode base64 message.data
         ├── Zod schema validation (TelemetryInputSchema)
         ├── Mahalanobis scoring (anomaly.ts)
         ├── Context routing (Mamba-2 inspired, context-router.ts)
         └── Firestore dual-write (telemetry_events + anomaly_triggers)
```

**Security model:**
- Cloud Run: `--no-allow-unauthenticated` (no public access)
- Push subscription: OIDC token audience = Cloud Run service URL
- Service account: `pubsub-invoker-sa` with `roles/run.invoker` (least privilege)

### 4.3 Anomaly Scoring (P0)

$$S(x) = \sqrt{(x - \mu)^T \Sigma^{-1} (x - \mu)}$$

**Sensor vector (fixed order — must not change without baseline re-seed):**

| Index | Sensor | Unit | Baseline μ |
|-------|--------|------|-----------|
| 0 | RSSI | dBm | −85.0 |
| 1 | SNR | dB | 14.5 |
| 2 | BER | log₁₀ | −4.0 |
| 3 | Doppler shift | kHz | 0.2 |
| 4 | Tx Power | W | 50.0 |
| 5 | Carrier deviation | ppm | 0.5 |

**Alert thresholds (χ² df=6):**

| Level | S(x) Range | Action |
|-------|-----------|--------|
| NOMINAL | < 2.449 | Log to `telemetry_events` |
| WARNING | 2.449 – 3.162 | Log + increment warning counter |
| CRITICAL | ≥ 3.162 | Log to `anomaly_triggers` + fire webhook (v1.1) |

### 4.4 Firestore Schema (P0)

**`telemetry_events`**
```typescript
{
  sessionId: string,        timestamp: Timestamp,
  rfBand: string,           sensorVector: number[],
  anomalyScore: number,     alertLevel: "NOMINAL" | "WARNING" | "CRITICAL",
  contextState: "nominal" | "elevated" | "critical",
  isAnomaly: boolean,       source: "http" | "pubsub"
}
```

**`anomaly_triggers`** *(WARNING + CRITICAL only)*
```typescript
{
  sessionId: string,        anomalyScore: number,
  alertLevel: "WARNING" | "CRITICAL",
  sensorVector: number[],   telemetryDocId: string,
  resolvedAt?: Timestamp
}
```

**`baseline_config`** *(read-only at runtime)*
```typescript
{
  mu: number[],             covarianceInverse: number[][],
  nominalThreshold: number, warningThreshold: number,
  rfBand: string,           createdAt: Timestamp
}
```

---

## 5. Non-Functional Requirements

| Requirement | Spec |
|-------------|------|
| Scalability | 10,000 concurrent events/sec (Cloud Run max-instances=1000) |
| Latency | P99 < 500ms (Firestore ~20ms; Mahalanobis <1ms; Pub/Sub delivery ~100ms) |
| Cost at idle | $0/mo (scale-to-zero) |
| Portability | Docker + REST + stateless (FACE/MOSA compliant) |
| Auditability | Every event logged with source, sessionId, timestamp, firestoreDocId |

---

## 6. FACE / MOSA Alignment Statement

Per the **December 2024 DoD Tri-Services MOSA Memo**, FACE is the only open standard with an established conformance program and third-party Verification Authority sign-off.

| FACE 3.1 Requirement | MVP Status |
|---------------------|------------|
| Software portability via open interfaces | ✅ REST + Pub/Sub |
| No proprietary OS dependency | ✅ Node 20 Alpine container |
| CTS-verifiable behavior | ✅ `simulate_edge.ts` deterministic suite |
| Data model aligned to FACE segments | 🔄 Formal DM Segment definition TBD |
| FACE Registry listing | 📋 Q3 2026 FACE 3.1 UoC submission |
| Verification Authority engagement | 📋 Q2 2026 (LDRA / DornerWorks) |

> **Note:** FACE editions 1.x/2.0.x deprecate June 2025 → June 2026. Target **FACE 3.1** — the current active standard.

---

## 7. Out of Scope (MVP v1.0)

- Dashboard UI (Grafana or custom React)
- PagerDuty / Slack webhook alerts on CRITICAL events
- Multi-tenant API key scoping
- FedRAMP Authorization
- DO-178C traceability documentation
- ARM/embedded Rust SDK
- Billing / Stripe subscription management

---

## 8. Deployment Quickstart

```bash
# 1. Deploy Pub/Sub pipeline (idempotent)
chmod +x deploy_pubsub.sh
./deploy_pubsub.sh YOUR_PROJECT_ID us-central1

# 2. Seed Firestore baseline
npm install
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID npx tsx src/scripts/seed-baseline.ts

# 3. Run edge simulator (local)
npm run simulate

# 4. Open investor demo notebook
# Upload docs/rf_simulation.ipynb to colab.research.google.com → Run All
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_GENAI_API_KEY` | ✅ | Gemini API key (Secret Manager recommended) |
| `GOOGLE_CLOUD_PROJECT` | ✅ | GCP project ID |
| `CLOUD_RUN_URL` | ✅ prod | OIDC audience for /pubsub verification |
| `PORT` | — | Defaults to 8080 |

---

## 9. Acceptance Criteria (Definition of Done)

- [ ] `POST /telemetry` returns `anomalyScore` and `alertLevel` within 500ms
- [ ] `POST /pubsub` with valid OIDC token + base64 envelope returns 200, logs to Firestore
- [ ] `POST /pubsub` with missing/invalid OIDC token returns 401
- [ ] `GET /metrics` returns `pubsubMessages`, `anomalies`, `discarded`, `errors`
- [ ] `deploy_pubsub.sh` runs idempotently (no error on re-run)
- [ ] `npm run simulate` prints formatted 40-packet anomaly score table
- [ ] `anomaly_triggers` receives entries for WARNING and CRITICAL packets
- [ ] WEAK_SIGNAL packets score ≥ 2.449 in ≥ 95% of cases
- [ ] BURST_FAULT packets score ≥ 3.162 in 100% of cases
- [ ] `npm run build` compiles cleanly (zero TypeScript errors)

---
*PRD Owner: brandonbrooks31 | Next Review: 30 days post-pilot onboarding*
