# 🚀 MRO Digital Twin — Agentic Strategy Document

> **Living Document.** Every agent commit or architectural change MUST update the `## Technical Capabilities Log` section below.
> Every new task MUST be grounded in the `## Current Goal` and `## Active Questions` sections.

---

## 🎯 Mission

Build a **production-grade RF Telemetry Digital Twin** that can be demonstrated end-to-end to an MRO Director, proving that Mahalanobis anomaly detection can:

1. **Detect** a transponder fault signature **72 hours before failure**.
2. **Trigger** an automated ERP work order (SAP PM / IBM Maximo) within seconds of detection.
3. **Simulate** realistic edge data from a grounded aircraft so no live hardware is needed for the pitch.

---

## 👤 Ideal Customer Profile (ICP)

| Attribute | Detail |
|---|---|
| **Title** | Director of Maintenance / VP of MRO Operations |
| **Industry** | Regional & legacy airline carriers; MRO third-party providers (AAR Corp, ST Engineering, FL Technics) |
| **Geography** | DFW, ATL, MIA hubs (FAA Part 145 certified facilities) |
| **Pain Point** | Unscheduled AOG (Aircraft on Ground) events cost $10K–$150K/hr. Current CMMS are reactive, not predictive. |
| **Buying Trigger** | FAA / EASA airworthiness directive compliance pressure; Boeing 737 MAX return-to-service scrutiny |
| **Decision Criteria** | Must integrate with existing ERP (SAP PM / Maximo), must show ROI via avoidable AOG events, must be certifiable |
| **Key Objection** | "We can't run unvalidated AI on flight-critical systems." → Answer: Digital Twin runs parallel, only triggers work orders — humans still approve actions. |

---

## 🏆 Current Goal

**Goal:** Demonstrate the complete **Sense → Detect → Act** loop in a live pitch environment with zero physical hardware.

> *"When the edge simulator fires a degraded RF vector, the audience sees an anomaly score cross the CRITICAL threshold in real-time, a Firestore document appear, and a mock ERP work order webhook fire — all within 3 seconds."*

---

## ❓ Active Questions

1. **ERP Webhook:** What is the simplest mock SAP PM or Maximo work-order webhook we can stand up in Cloud Run for the pitch?
2. **Edge Simulator:** Should the simulator run as a local CLI script or as a second Cloud Run service so it can be shown running "from the aircraft"?
3. **Data Replay:** Can we pre-record a 10-minute telemetry degradation curve and replay it during the demo so the pitch is deterministic?
4. **Latency SLA:** What is the end-to-end p99 latency from Pub/Sub message → anomaly score → Firestore write → webhook call? Target: < 500ms.
5. **Auth for Pitch:** Should we use an API key or a service-account JWT for the live demo endpoint? (Keep it simple but professional.)

---

## 🏗️ Architecture Overview

```
[Edge Simulator (CLI / Cloud Run)]
        │  RF Sensor Vector (JSON)
        ▼
[Google Cloud Pub/Sub]  ← zero-trust ingestion boundary
        │
        ▼
[RF Telemetry Service  (Cloud Run)]
   ├─ Zod Validation
   ├─ Context Router (Mamba-2 inspired)
   ├─ Mahalanobis Anomaly Scorer
   ├─ Firestore Logger
   └─ Anomaly Webhook Dispatcher  ← NEW (ERP integration point)
        │
        ▼
[Mock ERP Work-Order Service (Cloud Run)]
   └─ POST /work-orders  →  returns WO-{uuid}
```

---

## 📦 Technical Capabilities Log

> *Agent: append a bullet here after every successful deployment or architectural commit.*

- **[2026-03-06]** Core RF Telemetry microservice deployed to Cloud Run. Mahalanobis scorer live with 6-dim sensor vector (RSSI, SNR, BER, Doppler, Tx Power, Carrier Dev). Firestore logging for all events and anomaly triggers.
- **[2026-03-06]** Pub/Sub event-driven pipeline scaffolded: `deploy_pubsub.sh` creates topic, subscription, and push endpoint. Zero-trust perimeter established.
- **[2026-03-06]** Existing skills injected: `rf_signal_integrity.md` (RF domain knowledge) and `time_and_harmonics.md` (temporal signal processing). Agent context now domain-aware.
- **[2026-03-06]** Strategy-to-Execution (S2E) loop initialized: `STRATEGY.md` and `strategic_alignment.md` skill committed. Agent now reads business context before every code task and updates this log after every deploy.

---

## 📋 Pitch Readiness Checklist

| Capability | Status | Priority |
|---|---|---|
| Mahalanobis anomaly detection (live endpoint) | ✅ Done | — |
| Pub/Sub secure event pipeline | ✅ Done | — |
| S2E strategy loop (STRATEGY.md + skill) | ✅ Done | — |
| RF Edge Simulator (degradation curve) | 🔴 Not Started | **P0** |
| Mock ERP Work-Order Webhook | 🔴 Not Started | **P0** |
| End-to-end latency benchmark (< 500ms p99) | 🔴 Not Started | **P1** |
| Deterministic 10-min demo replay script | 🔴 Not Started | **P1** |
| Auth hardening for pitch endpoint | 🔴 Not Started | **P2** |
| One-page pitch data sheet (ROI math) | 🔴 Not Started | **P2** |

---

## 💡 Pitch Narrative (30-Second Hook)

> *"Right now, airlines lose $10,000 every minute an aircraft sits grounded with a fault that could have been predicted. Our digital twin reads six RF telemetry channels continuously. Seventy-two hours ago, it saw this degradation pattern on Transponder HW-001. Today, it has already opened an ERP work order, the part is on order, and the aircraft never goes AOG. That is the delta we sell."*

---

*Last updated by: Antigravity Agent | 2026-03-06*
