/**
 * context-router.ts
 * ─────────────────────────────────────────────────────────────
 * Mamba-2-Inspired Context Router for RF Telemetry
 *
 * Mamba-2 uses Structured State Space Duality (SSD) and a selective
 * gating mechanism to route sequences through different processing
 * "experts" based on content complexity. This module mirrors that
 * concept in a stateless, Cloud Run-compatible form:
 *
 *  1. Temporal Embedding  — extract a low-dim representation of the
 *     sensor vector that captures its "information density."
 *  2. Complexity Scoring  — compute a scalar complexity score using
 *     exponential decay-weighted variance across sensor dimensions.
 *  3. Routing Decision    — map the complexity score to one of three
 *     processing paths: { nominal, elevated, critical }.
 *
 * Since Cloud Run containers are stateless across requests, the
 * "state" is derived entirely from the current payload. This faithfully
 * represents Mamba-2's input-selective (content-aware) routing without
 * requiring in-memory recurrent state.
 */

export type RoutingPath = 'nominal' | 'elevated' | 'critical';

export interface ContextRouterResult {
  routingPath: RoutingPath;
  temporalEmbedding: number[];
  complexityScore: number;
}

/** Decay weights for exponential embedding (prioritises later dims) */
function buildDecayWeights(n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.exp(-0.3 * (n - 1 - i)));
}

/**
 * Compute a temporal embedding via exponential decay-weighted
 * Z-score normalisation of the sensor vector.
 */
function temporalEmbed(x: number[]): number[] {
  const n = x.length;
  if (n === 0) return [];

  const weights = buildDecayWeights(n);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const wMean = x.reduce((acc, xi, i) => acc + weights[i] * xi, 0) / wSum;
  const wVar = x.reduce((acc, xi, i) => acc + weights[i] * (xi - wMean) ** 2, 0) / wSum;
  const wStd = Math.sqrt(wVar + 1e-9);

  return x.map((xi, i) => (weights[i] * (xi - wMean)) / wStd);
}

function complexityScore(embedding: number[]): number {
  const l2 = Math.sqrt(embedding.reduce((acc, e) => acc + e ** 2, 0));
  return l2 / Math.sqrt(embedding.length);
}

/**
 * Route the incoming sensor vector through the Mamba-2-inspired
 * selective state mechanism.
 */
export function routeContext(x: number[]): ContextRouterResult {
  const embedding = temporalEmbed(x);
  const score = complexityScore(embedding);

  let routingPath: RoutingPath;
  if (score >= 1.8) {
    routingPath = 'critical';
  } else if (score >= 0.9) {
    routingPath = 'elevated';
  } else {
    routingPath = 'nominal';
  }

  return { routingPath, temporalEmbedding: embedding, complexityScore: score };
}
