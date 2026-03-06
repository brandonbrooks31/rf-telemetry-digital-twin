/**
 * seed-baseline.ts
 * ─────────────────────────────────────────────────────────────
 * One-time script to seed the Firestore baseline_config/active
 * document with realistic RF telemetry baseline statistics.
 *
 * Sensor vector dimensions (n=6):
 *   [0] RSSI          — Received Signal Strength Indicator (dBm)
 *   [1] SNR           — Signal-to-Noise Ratio (dB)
 *   [2] BER           — Bit Error Rate (log10 scale, e.g. -4 = 1e-4)
 *   [3] DopplerShift  — Doppler frequency shift (kHz)
 *   [4] TxPower       — Transmit power (W)
 *   [5] CarrierDev    — Carrier frequency deviation (ppm)
 *
 * Run: npm run seed
 * Prerequisites: GOOGLE_APPLICATION_CREDENTIALS or ADC configured
 */

import 'dotenv/config';
import * as admin from 'firebase-admin';
import { invertCovarianceMatrix } from '../lib/anomaly';

admin.initializeApp();
const db = admin.firestore();

// S-Band nominal RF link baseline statistics
const mu: number[] = [
  -85.0,  // RSSI   (dBm)
   14.5,  // SNR    (dB)
   -4.0,  // BER    (log10)
    0.2,  // Doppler (kHz)
   50.0,  // TxPower (W)
    0.5,  // CarrierDev (ppm)
];

// Correlated covariance matrix (RSSI-SNR, SNR-BER correlations)
const sigma: number[][] = [
  [16.0,  4.0,  0.5,  0.0,  0.0,  0.0],
  [ 4.0,  4.0,  0.8,  0.0,  0.0,  0.0],
  [ 0.5,  0.8,  0.25, 0.0,  0.0,  0.0],
  [ 0.0,  0.0,  0.0,  0.04, 0.0,  0.0],
  [ 0.0,  0.0,  0.0,  0.0, 25.0,  0.0],
  [ 0.0,  0.0,  0.0,  0.0,  0.0,  0.01],
];

const sigmaInv = invertCovarianceMatrix(sigma);

async function seed() {
  await db.collection('baseline_config').doc('active').set({
    mu,
    sigma,
    sigmaInv,
    threshold: 2.449,
    dimensions: 6,
    description: 'S-Band nominal link baseline (seeded)',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('✅  baseline_config/active seeded successfully.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
