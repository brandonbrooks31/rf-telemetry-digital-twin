/**
 * webhook.ts — Anomaly Webhook Dispatcher
 * ─────────────────────────────────────────────────────────────
 * Fires a POST to ERP_WEBHOOK_URL when alertLevel is WARNING or CRITICAL.
 *
 * Design principles:
 *   - Fire-and-forget: never awaited on the hot path, preserves latency SLA
 *   - Silent failure: logs warnings, never throws to the caller
 *   - 2-second timeout: won't hang if ERP service is slow during demo
 *
 * Environment Variables:
 *   ERP_WEBHOOK_URL — full URL of the work-order endpoint
 *                     e.g. http://localhost:9090/work-orders
 *                          https://<erp-cloud-run-url>/work-orders
 */

export interface WebhookPayload {
  sessionId:    string;
  alertLevel:   string;
  anomalyScore: number;
  rfBand:       string;
  asset:        string;
  firestoreDocId: string;
  timestamp:    string;
}

export interface WorkOrderResponse {
  workOrderId:  string;
  status:       string;
  priority:     string;
  description:  string;
  created:      string;
}

const ERP_WEBHOOK_URL = process.env.ERP_WEBHOOK_URL ?? '';
const WEBHOOK_TIMEOUT_MS = 2000;

/**
 * Dispatch an ERP work-order webhook for WARNING / CRITICAL anomalies.
 * Returns the work order ID on success, null if disabled or on failure.
 *
 * This function intentionally does NOT throw — it is designed to be
 * called fire-and-forget: `void dispatchErpWebhook(payload)`.
 */
export async function dispatchErpWebhook(payload: WebhookPayload): Promise<string | null> {
  if (!ERP_WEBHOOK_URL) {
    // Not configured — silently skip (nominal operation in dev without ERP)
    return null;
  }

  if (payload.alertLevel === 'NOMINAL') {
    return null; // Only dispatch for anomalies
  }

  try {
    const res = await fetch(ERP_WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(
        `[WEBHOOK] ERP endpoint returned HTTP ${res.status} for ` +
        `session=${payload.sessionId} level=${payload.alertLevel}`
      );
      return null;
    }

    const data = await res.json() as Partial<WorkOrderResponse>;
    const woId = data.workOrderId ?? 'unknown';

    console.log(
      `[WEBHOOK] ERP work order created: ${woId}  ` +
      `priority=${data.priority ?? '?'}  ` +
      `session=${payload.sessionId}  level=${payload.alertLevel}`
    );

    return woId;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[WEBHOOK] Failed to reach ERP endpoint: ${msg}`);
    return null;
  }
}
