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
 *   5.5 Dispatch ERP webhook (fire-and-forget, WARNING/CRITICAL only)
 *   6. Return structured result
 *
 * This flow is exposed as an HTTP endpoint via Express in index.ts.
 * No Genkit Developer UI is started — strictly headless for Cloud Run.
 */

import { defineFlow } from 'genkit';
import { z } from 'zod';
import { routeContext } from '../lib/context-router';
import { computeAnomalyScore } from '../lib/anomaly';
import { loadBaselineConfig, logTelemetryEvent } from '../lib/firestore';
import { dispatchErpWebhook } from '../lib/webhook';

// ─── Input / Output Schemas ────────────────────────────────────────────────

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
    workOrderId: z.string().nullable().optional().describe('ERP work order ID if dispatched'),
});

export type TelemetryInput = z.infer<typeof TelemetryInputSchema>;
export type TelemetryOutput = z.infer<typeof TelemetryOutputSchema>;

// ─── Genkit Flow Definition ────────────────────────────────────────────────

export const telemetryAnalysisFlow = defineFlow(
    {
        name: 'telemetryAnalysisFlow',
        inputSchema: TelemetryInputSchema,
        outputSchema: TelemetryOutputSchema,
    },
    async (input: TelemetryInput): Promise<TelemetryOutput> => {
        const startTime = Date.now();

        // ── Step 1: Mamba-2-inspired context routing ─────────────────────────
        const contextResult = routeContext(input.sensorVector);

        // ── Step 2: Load baseline config (TTL-cached Firestore read) ─────────
        const baseline = await loadBaselineConfig();

        // ── Step 3: Mahalanobis anomaly scoring ──────────────────────────────
        const anomalyResult = computeAnomalyScore(
            input.sensorVector,
            baseline.mu,
            baseline.sigmaInv,
            baseline.threshold
        );

        const processingLatencyMs = Date.now() - startTime;
        const processingTimestamp = new Date().toISOString();

        // ── Step 4: Log to Firestore ──────────────────────────────────────────
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

        // ── Step 5.5: Fire-and-forget ERP webhook (WARNING / CRITICAL only) ────
        // Does NOT block the response — preserves latency SLA.
        const webhookPromise = anomalyResult.isAnomaly
            ? dispatchErpWebhook({
                sessionId:     input.sessionId,
                alertLevel:    anomalyResult.alertLevel,
                anomalyScore:  anomalyResult.score,
                rfBand:        input.rfBand ?? 'Unknown',
                asset:         input.sessionId,
                firestoreDocId,
                timestamp:     processingTimestamp,
              })
            : Promise.resolve(null);

        // Await with a short grace window so the WO ID can be included
        // in the response if the ERP service is local (typically <50ms).
        const workOrderId = await Promise.race([
            webhookPromise,
            new Promise<null>(resolve => setTimeout(() => resolve(null), 200)),
        ]);

        // ── Step 6: Return result ─────────────────────────────────────────────
        return {
            sessionId: input.sessionId,
            anomalyScore: anomalyResult.score,
            isAnomaly: anomalyResult.isAnomaly,
            alertLevel: anomalyResult.alertLevel,
            contextState: contextResult.routingPath,
            firestoreDocId,
            processingLatencyMs,
            timestamp: processingTimestamp,
            workOrderId,
        };
    }
);
