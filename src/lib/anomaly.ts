/**
 * anomaly.ts
 * ─────────────────────────────────────────────────────────────
 * Mahalanobis distance-based anomaly scorer for RF telemetry.
 *
 * Computes the anomaly score:
 *
 *   S(x) = √( (x - μ)ᵀ  Σ⁻¹  (x - μ) )
 *
 * where:
 *   x  = incoming sensor vector (n-dim)
 *   μ  = baseline mean vector   (n-dim)
 *   Σ⁻¹= inverse covariance matrix (n×n)
 *
 * Thresholds (chi-squared approximation for n=6 at 95%/99% CI):
 *   NOMINAL  : S(x) < 2.449 (≈√chi²₀.₉₅,₆)
 *   WARNING  : 2.449 ≤ S(x) < 3.162 (≈√chi²₀.₉₉,₆)
 *   CRITICAL : S(x) ≥ 3.162
 */

import * as math from 'mathjs';

export interface AnomalyResult {
  score: number;
  isAnomaly: boolean;
  alertLevel: 'NOMINAL' | 'WARNING' | 'CRITICAL';
}

/**
 * Compute the inverse of the covariance matrix Σ.
 * Adds a small regularization term (ridge) for numerical stability.
 */
export function invertCovarianceMatrix(sigma: number[][]): number[][] {
  const n = sigma.length;
  const ridge = 1e-6;

  // Add ridge regularization: Σ_reg = Σ + ε·I
  const regularized = sigma.map((row, i) =>
    row.map((val, j) => (i === j ? val + ridge : val))
  );

  return math.inv(regularized) as number[][];
}

/**
 * Compute the Mahalanobis distance S(x) using pre-inverted Σ⁻¹.
 *
 * @param x         Incoming n-dimensional sensor vector
 * @param mu        Baseline mean vector (n-dim)
 * @param sigmaInv  Pre-computed inverse covariance matrix (n×n)
 * @returns         Scalar anomaly score S(x) ≥ 0
 */
export function mahalanobisDistance(
  x: number[],
  mu: number[],
  sigmaInv: number[][]
): number {
  if (x.length !== mu.length) {
    throw new Error(
      `Dimension mismatch: sensor vector=${x.length}, baseline=${mu.length}`
    );
  }

  // diff = x - μ  (row vector / 1×n)
  const diff = x.map((xi, i) => xi - mu[i]);

  // term = diff  ·  Σ⁻¹  ·  diffᵀ  →  scalar
  const diffRow = math.matrix([diff]);                      // shape: [1, n]
  const sigmaInvMat = math.matrix(sigmaInv);               // shape: [n, n]

  // [1, n] × [n, n] → [1, n]
  const intermediate = math.multiply(diffRow, sigmaInvMat);

  // [1, n] × [n, 1] → [1, 1]
  const diffCol = math.transpose(diffRow);
  const quadratic = math.multiply(intermediate, diffCol);

  // Extract scalar value
  const scalar = math.subset(
    quadratic as math.Matrix,
    math.index(0, 0)
  ) as number;

  return Math.sqrt(Math.max(0, scalar));
}

/**
 * Classify an anomaly score against thresholds.
 *
 * @param score      Mahalanobis distance S(x)
 * @param threshold  Base anomaly threshold (default: 2.449 for n=6, 95% CI)
 */
export function classifyAnomaly(
  score: number,
  threshold: number = 2.449
): AnomalyResult {
  const criticalThreshold = threshold * Math.SQRT2; // ~3.162 for n=6 default

  if (score >= criticalThreshold) {
    return { score, isAnomaly: true, alertLevel: 'CRITICAL' };
  } else if (score >= threshold) {
    return { score, isAnomaly: true, alertLevel: 'WARNING' };
  } else {
    return { score, isAnomaly: false, alertLevel: 'NOMINAL' };
  }
}

/**
 * High-level entry point: compute full anomaly result.
 */
export function computeAnomalyScore(
  x: number[],
  mu: number[],
  sigmaInv: number[][],
  threshold: number = 2.449
): AnomalyResult {
  const score = mahalanobisDistance(x, mu, sigmaInv);
  return classifyAnomaly(score, threshold);
}
