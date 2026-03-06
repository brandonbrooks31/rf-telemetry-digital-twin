/**
 * index.ts — Service Entry Point
 * ─────────────────────────────────────────────────────────────
 * Initialises Genkit (headless, no Dev UI), mounts the
 * telemetryAnalysisFlow on an Express HTTP server, and starts
 * listening on PORT (default 8080 for Cloud Run).
 *
 * Endpoints:
 *   POST /telemetry        — RF telemetry ingestion
 *   GET  /health           — Cloud Run health check
 *   GET  /metrics          — Lightweight operational counters
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-ai';
import { telemetryAnalysisFlow, TelemetryInputSchema } from './flows/telemetry';

// Genkit Initialisation (headless — no startFlowsServer())
const ai = genkit({
  plugins: [
    googleAI(),
  ],
});

const metrics = {
  totalRequests: 0,
  anomalies: 0,
  errors: 0,
  uptimeStart: new Date().toISOString(),
};

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: metrics.uptimeStart });
});

app.get('/metrics', (_req: Request, res: Response) => {
  res.json(metrics);
});

app.post('/telemetry', async (req: Request, res: Response) => {
  metrics.totalRequests++;

  const parseResult = TelemetryInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    metrics.errors++;
    return res.status(400).json({
      error: 'Invalid telemetry payload',
      details: parseResult.error.flatten(),
    });
  }

  try {
    const result = await telemetryAnalysisFlow(parseResult.data);

    if (result.isAnomaly) {
      metrics.anomalies++;
      console.warn(
        `[ANOMALY] sessionId=${result.sessionId} level=${result.alertLevel} score=${result.anomalyScore.toFixed(4)} docId=${result.firestoreDocId}`
      );
    }

    return res.status(200).json(result);
  } catch (err: unknown) {
    metrics.errors++;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[telemetry route error]', message);
    return res.status(500).json({ error: 'Internal processing error', message });
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  metrics.errors++;
  console.error('[unhandled error]', err);
  res.status(500).json({ error: err.message });
});

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, () => {
  console.log(`RF Telemetry Digital Twin listening on port ${PORT}`);
  console.log(`Genkit AI service initialised (headless mode)`);
});

export { app, ai };
