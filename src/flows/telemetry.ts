/**
 * telemetry.ts — Genkit Flow: telemetryAnalysisFlow
 * ─────────────────────────────────────────────────────────────
 * Core Genkit flow that orchestrates the full RF telemetry
 * analysis pipeline:
 *
 *   1. Validate incoming sensor payload (Zod)
 *   2. Route through the Mamba-2-inspired context router
 *   3. Load baseline config from Firestore (TTL-cached)
 *   4. Compute Mahalanobis anomaly score S(x)
 *   5. Log telemetry event + any anomaly trigger to Firestore
 *   6. Return structured result
 *
 * Headless — no Genkit Dev UI started. Strictly for Cloud Run.
 */

import { defineFlow } from 'genkit';
import { z } from 'zod';
import { routeContext } from '../lib/context-router';
import { computeAnomalyScore } from '../lib/anomaly';
import { loadBaselineConfig, logTelemetryEvent } from '../lib/firestore';

export const TelemetryInputSchema = z.object({
  sessionId: z.string().min(1).describe('Unique hardware device identifier'),
  timestamp: z.string().optional().describe('ISO 8601 event timestamp'),
  rfBand: z.string().optional().default('Unknown').describe('RF band (e.g. S-Band, X-Band, Ka-Band)'),
  sensorVector: z
    .array(z.number())
    .min(1)
    .describe(
      'n-dimensional sensor reading: [RSSI (dBm), SNR (dB), BER, DopplerShift (Hz), TxPower (W), CarrierDeviation (Hz), ...]'
    ),
  metadata: z.record(z.unknown()).optional().describe('Arbitrary key-value metadata'),
});

export const TelemetryOutputSchema = z.object({
  sessionId: z.string(),
  anomalyScore: z.number().describe('Mahalanobis distance S(x)'),
  isAnomaly: z.boolean(),
  alertLevel: z.enum(['NOMINAL', 'WARNING', 'CRITICAL']),
  contextState: z.enum(['nominal', 'elevated', 'critical']),
  firestoreDocId: z.string().describe('ID of the created telemetry_events document'),
  processingLatencyMs: z.number(),
  timestamp: z.string().describe('ISO 8601 processing timestamp'),
});

export type TelemetryInput = z.infer<typeof TelemetryInputSchema>;
export type TelemetryOutput = z.infer<typeof TelemetryOutputSchema>;

export const telemetryAnalysisFlow = defineFlow(
  {
    name: 'telemetryAnalysisFlow',
    inputSchema: TelemetryInputSchema,
    outputSchema: TelemetryOutputSchema,
  },
  async (input: TelemetryInput): Promise<TelemetryOutput> => {
    const startTime = Date.now();

    // Step 1: Mamba-2 context routing
    const contextResult = routeContext(input.sensorVector);

    // Step 2: Load baseline config (TTL-cached)
    const baseline = await loadBaselineConfig();

    // Step 3: Mahalanobis anomaly scoring
    const anomalyResult = computeAnomalyScore(
      input.sensorVector,
      baseline.mu,
      baseline.sigmaInv,
      baseline.threshold
    );

    const processingLatencyMs = Date.now() - startTime;
    const processingTimestamp = new Date().toISOString();

    // Step 4: Log to Firestore
    const firestoreDocId = await logTelemetryEvent(
      {
        sessionId: input.sessionId,
        sensorVector: input.sensorVector,
        anomalyScore: anomalyResult.score,
        isAnomaly: anomalyResult.isAnomaly,
        alertLevel: anomalyResult.alertLevel,
        contextState: contextResult.routingPath,
        rfBand: input.rfBand ?? 'Unknown',
        processingLatencyMs,
        rawPayload: input as Record<string, unknown>,
      },
      baseline
    );

    return {
      sessionId: input.sessionId,
      anomalyScore: anomalyResult.score,
      isAnomaly: anomalyResult.isAnomaly,
      alertLevel: anomalyResult.alertLevel,
      contextState: contextResult.routingPath,
      firestoreDocId,
      processingLatencyMs,
      timestamp: processingTimestamp,
    };
  }
);
