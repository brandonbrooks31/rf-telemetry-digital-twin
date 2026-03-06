/**
 * firestore.ts
 * ─────────────────────────────────────────────────────────────
 * Firestore I/O layer for the RF Telemetry Digital Twin.
 *
 * Collections:
 *   telemetry_events   — every ingested telemetry payload + result
 *   anomaly_triggers   — only anomalous events (WARNING | CRITICAL)
 *   baseline_config    — baseline μ, Σ, Σ⁻¹, threshold
 *
 * Baseline config is cached in-module with a 5-minute TTL to avoid
 * a Firestore read on every request while still allowing hot updates.
 */

import * as admin from 'firebase-admin';
import { invertCovarianceMatrix } from './anomaly';
import { BaselineConfig } from '../types/telemetry';

let _db: FirebaseFirestore.Firestore | null = null;

export function getDb(): FirebaseFirestore.Firestore {
  if (!_db) {
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    _db = admin.firestore();
  }
  return _db;
}

interface CachedBaseline {
  config: BaselineConfig;
  expiresAt: number;
}

let _baselineCache: CachedBaseline | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function loadBaselineConfig(): Promise<BaselineConfig> {
  const now = Date.now();

  if (_baselineCache && _baselineCache.expiresAt > now) {
    return _baselineCache.config;
  }

  const db = getDb();
  const doc = await db.collection('baseline_config').doc('active').get();

  let config: BaselineConfig;

  if (!doc.exists) {
    console.warn('[firestore] No baseline_config/active document found — using default 6-dim identity baseline.');
    config = defaultBaseline();
  } else {
    const data = doc.data()!;
    const sigma: number[][] = data.sigma;
    config = {
      mu: data.mu,
      sigma,
      sigmaInv: data.sigmaInv ?? invertCovarianceMatrix(sigma),
      threshold: data.threshold ?? 2.449,
      dimensions: data.dimensions ?? data.mu.length,
      updatedAt: data.updatedAt?.toDate?.().toISOString(),
    };
  }

  _baselineCache = { config, expiresAt: now + CACHE_TTL_MS };
  return config;
}

function defaultBaseline(): BaselineConfig {
  const n = 6;
  const mu = [0, 0, 0, 0, 0, 0];
  const sigma = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.0))
  );
  return { mu, sigma, sigmaInv: sigma, threshold: 2.449, dimensions: n };
}

export interface TelemetryLogPayload {
  sessionId: string;
  sensorVector: number[];
  anomalyScore: number;
  isAnomaly: boolean;
  alertLevel: 'NOMINAL' | 'WARNING' | 'CRITICAL';
  contextState: string;
  rfBand: string;
  processingLatencyMs: number;
  rawPayload: Record<string, unknown>;
}

export async function logTelemetryEvent(
  payload: TelemetryLogPayload,
  baseline: BaselineConfig
): Promise<string> {
  const db = getDb();
  const now = admin.firestore.Timestamp.now();

  const eventRef = await db.collection('telemetry_events').add({
    ...payload,
    timestamp: now,
  });

  if (payload.isAnomaly) {
    await db.collection('anomaly_triggers').add({
      eventRef,
      sessionId: payload.sessionId,
      timestamp: now,
      anomalyScore: payload.anomalyScore,
      alertLevel: payload.alertLevel,
      baselineMu: baseline.mu,
      sensorVector: payload.sensorVector,
      acknowledged: false,
    });
  }

  return eventRef.id;
}
