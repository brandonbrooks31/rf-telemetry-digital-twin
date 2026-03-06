/**
 * erp-webhook/index.ts — Mock ERP Work-Order Service
 * ─────────────────────────────────────────────────────────────
 * Simulates a SAP PM / IBM Maximo work-order endpoint for pitch demos.
 *
 *   POST /work-orders  → creates a work order, returns WO-XXXX
 *   GET  /work-orders  → lists all work orders created this session
 *   GET  /health       → liveness probe
 *
 * Work order priority maps from alert level:
 *   WARNING  → HIGH
 *   CRITICAL → AOG   (Aircraft on Ground — highest urgency)
 *
 * Usage:
 *   ERP_PORT=9090 npm run erp
 */

import express, { Request, Response } from 'express';

const app  = express();
const PORT = parseInt(process.env.ERP_PORT ?? '9090', 10);

app.use(express.json({ limit: '256kb' }));

// ─── ANSI helpers ─────────────────────────────────────────────────────────
const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const BOLD   = '\x1b[1m';
const CYAN   = '\x1b[36m';

// ─── In-memory work order store (pitch session) ───────────────────────────
interface WorkOrder {
  workOrderId:  string;
  status:       'OPEN';
  priority:     'ROUTINE' | 'HIGH' | 'AOG';
  alertLevel:   string;
  asset:        string;
  sessionId:    string;
  anomalyScore: number;
  description:  string;
  created:      string;
}

const workOrders: WorkOrder[] = [];
let woCounter = 0;

// ─── Priority mapping ─────────────────────────────────────────────────────
function toPriority(alertLevel: string): WorkOrder['priority'] {
  if (alertLevel === 'CRITICAL') return 'AOG';
  if (alertLevel === 'WARNING')  return 'HIGH';
  return 'ROUTINE';
}

// ─── POST /work-orders ────────────────────────────────────────────────────
app.post('/work-orders', (req: Request, res: Response) => {
  const {
    sessionId    = 'UNKNOWN',
    alertLevel   = 'WARNING',
    anomalyScore = 0,
    rfBand       = 'S-Band',
    asset,
  } = req.body as {
    sessionId?:    string;
    alertLevel?:   string;
    anomalyScore?: number;
    rfBand?:       string;
    asset?:        string;
  };

  woCounter++;
  const workOrderId = `WO-${String(woCounter).padStart(4, '0')}`;
  const priority    = toPriority(alertLevel);
  const assetId     = asset ?? sessionId;

  const wo: WorkOrder = {
    workOrderId,
    status:  'OPEN',
    priority,
    alertLevel,
    asset:        assetId,
    sessionId,
    anomalyScore,
    description:  `Predictive maintenance alert on ${rfBand} transponder. ` +
                  `Mahalanobis score ${anomalyScore.toFixed(3)} exceeded threshold. ` +
                  `Inspect RF subsystem — possible component degradation.`,
    created: new Date().toISOString(),
  };

  workOrders.push(wo);

  // ── Console log (styled for pitch visibility) ─────────────────────────
  const colour = priority === 'AOG'  ? `${RED}${BOLD}`  :
                 priority === 'HIGH' ? `${YELLOW}${BOLD}` : GREEN;
  console.log(
    `\n  ${colour}[${workOrderId}]${RESET} ${colour}${priority.padEnd(7)}${RESET}  ` +
    `asset=${CYAN}${assetId}${RESET}  score=${anomalyScore.toFixed(3)}  ${new Date().toLocaleTimeString()}`
  );

  res.status(201).json(wo);
});

// ─── GET /work-orders ─────────────────────────────────────────────────────
app.get('/work-orders', (_req: Request, res: Response) => {
  res.json({ total: workOrders.length, workOrders });
});

// ─── GET /health ──────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', workOrdersCreated: workOrders.length });
});

// ─── Start ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n${CYAN}${BOLD}╔═══════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}${BOLD}║   Mock ERP Work-Order Service  (Pitch Demo)   ║${RESET}`);
  console.log(`${CYAN}${BOLD}╚═══════════════════════════════════════════════╝${RESET}`);
  console.log(`\n  Listening on port ${BOLD}${PORT}${RESET}`);
  console.log(`  POST /work-orders  → create work order`);
  console.log(`  GET  /work-orders  → list all WOs this session`);
  console.log(`  GET  /health       → liveness\n`);
  console.log(`  ${YELLOW}Waiting for anomaly events…${RESET}\n`);
});
