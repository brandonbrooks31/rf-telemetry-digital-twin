/**
 * simulate.ts — RF Edge Simulator (Pitch Demo)
 * ─────────────────────────────────────────────────────────────
 * Replays a deterministic 60-step S-Band transponder degradation
 * curve to the telemetry endpoint. Perfect for a live pitch:
 *
 *   Steps  0–19 → NOMINAL   (clean RF link)
 *   Steps 20–39 → WARNING   (progressive degradation)
 *   Steps 40–59 → CRITICAL  (fault signature, triggers ERP WO)
 *
 * Duration: 60 steps × 1.5 s = 90 seconds total.
 *
 * Usage:
 *   TELEMETRY_URL=http://localhost:8080/telemetry npm run simulate
 *   TELEMETRY_URL=https://<cloud-run-url>/telemetry npm run simulate
 *
 * Environment Variables:
 *   TELEMETRY_URL   — target endpoint (default: http://localhost:8080/telemetry)
 *   STEP_INTERVAL   — ms between steps       (default: 1500)
 *   SESSION_ID      — device ID              (default: HW-TRANSPONDER-001)
 */

import 'dotenv/config';

const TELEMETRY_URL = process.env.TELEMETRY_URL ?? 'http://localhost:8080/telemetry';
const STEP_INTERVAL = parseInt(process.env.STEP_INTERVAL ?? '1500', 10);
const SESSION_ID    = process.env.SESSION_ID    ?? 'HW-TRANSPONDER-001';
const TOTAL_STEPS   = 60;

// ─── Baseline (nominal S-Band transponder) ────────────────────────────────
// [RSSI(dBm), SNR(dB), BER(log10), Doppler(kHz), TxPower(W), CarrierDev(ppm)]
const NOMINAL: number[]  = [-85.0, 14.5, -4.0,  0.2, 50.0, 0.5];
const WARNING: number[]  = [-97.0,  9.0, -2.5,  0.8, 43.0, 1.5];
const CRITICAL: number[] = [-105.0,  5.5, -0.8,  2.1, 35.0, 3.2];

// ─── Noise floor per dimension ────────────────────────────────────────────
const NOISE: number[] = [1.2, 0.4, 0.15, 0.05, 0.8, 0.08];

// ─── Linear interpolation ─────────────────────────────────────────────────
function lerp(a: number[], b: number[], t: number): number[] {
  return a.map((ai, i) => ai + (b[i] - ai) * t);
}

// ─── Gaussian noise (Box-Muller) ──────────────────────────────────────────
function gaussianNoise(std: number): number {
  const u = Math.random(), v = Math.random();
  return std * Math.sqrt(-2 * Math.log(u + 1e-12)) * Math.cos(2 * Math.PI * v);
}

// ─── Build sensor vector for step i ──────────────────────────────────────
function buildVector(step: number): number[] {
  let base: number[];

  if (step < 20) {
    base = NOMINAL;
  } else if (step < 40) {
    const t = (step - 20) / 19;
    base = lerp(NOMINAL, WARNING, t);
  } else {
    const t = (step - 40) / 19;
    base = lerp(WARNING, CRITICAL, t);
  }

  return base.map((b, i) => parseFloat((b + gaussianNoise(NOISE[i])).toFixed(4)));
}

// ─── Expected alert level label for console ───────────────────────────────
function expectedLevel(step: number): string {
  if (step < 20) return 'NOMINAL ';
  if (step < 40) return 'WARNING ';
  return 'CRITICAL';
}

// ─── ANSI colour helpers ──────────────────────────────────────────────────
const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const BOLD   = '\x1b[1m';
const CYAN   = '\x1b[36m';

function colourLevel(level: string): string {
  if (level.includes('NOMINAL'))  return `${GREEN}${level}${RESET}`;
  if (level.includes('WARNING'))  return `${YELLOW}${level}${RESET}`;
  if (level.includes('CRITICAL')) return `${RED}${BOLD}${level}${RESET}`;
  return level;
}

// ─── Sleep helper ─────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Main simulator loop ──────────────────────────────────────────────────
async function runSimulator(): Promise<void> {
  console.clear();
  console.log(`\n${CYAN}${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}${BOLD}║     RF Edge Simulator — MRO Digital Twin Pitch Demo          ║${RESET}`);
  console.log(`${CYAN}${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}`);
  console.log(`\n  Target  : ${CYAN}${TELEMETRY_URL}${RESET}`);
  console.log(`  Session : ${CYAN}${SESSION_ID}${RESET}`);
  console.log(`  Steps   : ${TOTAL_STEPS} (interval: ${STEP_INTERVAL}ms)\n`);
  console.log(`  ${GREEN}█ NOMINAL${RESET}  (steps  0–19)  Clean link, baseline RF`);
  console.log(`  ${YELLOW}█ WARNING${RESET}  (steps 20–39)  Progressive transponder degradation`);
  console.log(`  ${RED}${BOLD}█ CRITICAL${RESET} (steps 40–59)  Fault signature → ERP work order triggers\n`);
  console.log(`  Starting in 3 seconds…\n`);
  await sleep(3000);

  // ── Header row ──────────────────────────────────────────────────────────
  const hdr = ` ${'Step'.padEnd(5)} ${'Phase'.padEnd(9)} ${'Score'.padEnd(8)} ${'Level'.padEnd(10)} ${'WO'.padEnd(10)} ${'Latency'.padEnd(9)} RSSI(dBm)`;
  console.log(`${BOLD}${hdr}${RESET}`);
  console.log('─'.repeat(hdr.length));

  let workOrderCount = 0;

  for (let step = 0; step < TOTAL_STEPS; step++) {
    const vector = buildVector(step);
    const timestamp = new Date().toISOString();

    const payload = {
      sessionId: SESSION_ID,
      timestamp,
      rfBand: 'S-Band',
      sensorVector: vector,
      metadata: {
        step,
        orbit: 'GEO',
        elevation: 42.5,
        simulatorMode: true,
      },
    };

    let anomalyScore = '--';
    let alertLevel   = '?';
    let woId         = '';
    let latencyMs    = '--';

    try {
      const t0  = Date.now();
      const res = await fetch(TELEMETRY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      latencyMs = String(Date.now() - t0) + 'ms';

      if (res.ok) {
        const data = await res.json() as {
          anomalyScore?: number;
          alertLevel?: string;
          workOrderId?: string;
        };
        anomalyScore = (data.anomalyScore ?? 0).toFixed(3);
        alertLevel   = data.alertLevel ?? '?';
        woId         = data.workOrderId ? data.workOrderId : '';
        if (woId) workOrderCount++;
      } else {
        alertLevel = `HTTP ${res.status}`;
      }
    } catch (err: unknown) {
      alertLevel = 'ERR';
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED')) {
        console.error(`\n  ${RED}[FATAL] Cannot reach ${TELEMETRY_URL}${RESET}`);
        console.error(`  Is the telemetry service running? (npm run dev)\n`);
        process.exit(1);
      }
    }

    const exp = expectedLevel(step);
    const row = ` ${String(step).padStart(2).padEnd(5)} ${exp.padEnd(9)} ${String(anomalyScore).padEnd(8)} ${alertLevel.padEnd(10)} ${woId.padEnd(10)} ${latencyMs.padEnd(9)} ${vector[0].toFixed(1)}`;
    console.log(colourLevel(row));

    if (step < TOTAL_STEPS - 1) {
      await sleep(STEP_INTERVAL);
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`\n${GREEN}${BOLD}✅  Simulation complete.${RESET}`);
  console.log(`   ${workOrderCount} ERP work order(s) triggered during this run.`);
  console.log(`   Session ID : ${SESSION_ID}`);
  console.log(`   Total steps: ${TOTAL_STEPS}`);
  console.log(`   Duration   : ~${Math.round((TOTAL_STEPS * STEP_INTERVAL) / 1000)}s\n`);
}

runSimulator().catch(err => {
  console.error('Simulator crashed:', err);
  process.exit(1);
});
