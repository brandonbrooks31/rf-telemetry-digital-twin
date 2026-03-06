---
description: Time domain analysis and harmonic distortion principles for RF telemetry integrity
---

# Time Domain & Harmonics — Agent Skill

## Context
This skill governs how Antigravity detects, classifies, and responds to
**temporal anomalies and harmonic distortion artifacts** in the RF telemetry
pipeline. It is a companion to `rf_signal_integrity.md` and must be
consulted whenever the agent encounters timestamp irregularities or
frequency-domain artifacts in sensor data.

---

## Temporal Integrity Rules

### Timestamp Validity
The `TelemetryInputSchema` accepts `timestamp` as an optional ISO 8601 string.
However, the following rules apply at the application level:

| Condition | Classification | Action |
|-----------|---------------|--------|
| `timestamp` missing | Acceptable | Use server receipt time |
| `timestamp` > 30s in future | STALE_FUTURE | Log warning, score payload |
| `timestamp` = prior packet | HARMONIC_DUPLICATE | Flag in metadata, score payload |
| `timestamp` > 10 min in past | STALE_PAST | Log warning; do not re-score |
| Clock rollback sequence | CLOCK_ROLLBACK | Escalate to WARNING anomaly |

**Key principle**: Timestamp invalidity **never** causes a packet to be silently
dropped. The Mahalanobis scorer must run on every payload with valid sensor data.

### Why Harmonic Duplicates Matter
In RF hardware (FPGA-based transponders, DDS synthesizers), buffer overflow
conditions cause the same measurement frame to be transmitted multiple times.
These duplicates must be detected, scored independently, and logged.

---

## Harmonic Distortion in the Frequency Domain

### What Harmonics Look Like in the Sensor Vector

| Harmonic | BER pattern | Doppler pattern | Cause |
|----------|------------|-----------------|-------|
| 2nd (f₀ × 2) | BER = 10⁻² | Δf × 2 | PA non-linearity |
| 3rd (f₀ × 3) | BER = 10⁻¹·⁵ | Δf × 3 | Intermodulation distortion |
| 5th (f₀ × 5) | BER = 10⁻¹ | δf × 5 | Oscillator harmonic |

### Detection via Mahalanobis
The covariance matrix Σ captures correlation between BER and Doppler in
dimensions [2] and [3]. A harmonic event causes **both** to spike proportionally,
making the quadratic form especially sensitive to correlated harmonic distortion
vs. independent Gaussian noise.

**Critical**: Do not replace Σ with an identity matrix — it loses harmonic detection.

---

## Mamba-2 Context Routing & Temporal State

### Why Stateless Temporal Routing Works
The Mamba-2-inspired router extracts temporal information from the **structure**
of the sensor vector itself:

- High-entropy vectors → elevated/critical routing path
- Harmonic patterns → elevated routing (high L2 norm from decay embedding)
- True nominal noise → low L2 norm → nominal routing

The router naturally separates harmonic artifacts from random noise without
requiring cross-request state.

### When to Add True Temporal State
Add Redis/Memorystore-backed correlation only if:
1. > 5% of real packets are duplicate timestamps in production
2. Clock rollback sequences span multiple requests
3. Hardware firmware produces systematic duplicate windows > 10 packets

---

## References
- ECSS-E-ST-50-05C §5.4: Time code formats for space data links
- IEEE Std 1588-2019: Precision Time Protocol (PTP)
- Pozar, D.M. "Microwave Engineering" §10.3: Harmonic distortion in amplifiers
- ITU-T G.8262: Timing characteristics of synchronous equipment slave clocks
