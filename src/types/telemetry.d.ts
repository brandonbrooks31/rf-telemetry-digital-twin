// RF Telemetry TypeScript type definitions

export interface TelemetryInput {
  sessionId: string;
  timestamp?: string;
  rfBand?: string;
  sensorVector: number[]; // [RSSI, SNR, BER, DopplerShift, TxPower, CarrierDeviation, ...]
  metadata?: Record<string, unknown>;
}

export interface TelemetryOutput {
  sessionId: string;
  anomalyScore: number;
  isAnomaly: boolean;
  alertLevel: 'NOMINAL' | 'WARNING' | 'CRITICAL';
  contextState: 'nominal' | 'elevated' | 'critical';
  firestoreDocId: string;
  processingLatencyMs: number;
  timestamp: string;
}

export interface BaselineConfig {
  mu: number[];
  sigma: number[][];
  sigmaInv: number[][];
  threshold: number;
  dimensions: number;
  updatedAt?: string;
}

export interface ContextRouterResult {
  routingPath: 'nominal' | 'elevated' | 'critical';
  temporalEmbedding: number[];
  complexityScore: number;
}

export interface TelemetryEventDoc {
  sessionId: string;
  timestamp: FirebaseFirestore.Timestamp;
  sensorVector: number[];
  anomalyScore: number;
  isAnomaly: boolean;
  alertLevel: string;
  contextState: string;
  rfBand: string;
  processingLatencyMs: number;
  rawPayload: Record<string, unknown>;
}

export interface AnomalyTriggerDoc {
  eventRef: FirebaseFirestore.DocumentReference;
  sessionId: string;
  timestamp: FirebaseFirestore.Timestamp;
  anomalyScore: number;
  alertLevel: string;
  baselineMu: number[];
  sensorVector: number[];
  acknowledged: boolean;
}
