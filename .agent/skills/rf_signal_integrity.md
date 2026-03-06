---
description: RF Signal Integrity principles for NTMS-compliant digital twin development
---

# RF Signal Integrity — Agent Skill

## Context
This skill governs how Antigravity reasons about RF telemetry data in the
`rf-telemetry-digital-twin` microservice and any descendant systems. It encodes
**NTMS (Network Telemetry Management System)** and **ITU-R** signal quality
principles so the agent defaults to aerospace/defense standards rather than
generic web or IoT conventions.

---

## Core Signal Domains

### Link Budget Awareness
Every RF link has a budget. The agent must respect these physics when generating
test vectors or evaluating anomaly thresholds:

| Parameter | Symbol | Typical S-Band Range | Unit |
|-----------|--------|---------------------|------|
| RSSI | P_rx | −120 to −60 | dBm |
| SNR | γ | 0 to 30 | dB |
| BER | ε | 10⁻⁶ to 10⁻¹ | (log₁₀ scale: −6 to −1) |
| Doppler Shift | Δf | −20 to +20 | kHz |
| Tx Power | P_tx | 5 to 200 | W |
| Carrier Deviation | δf | 0 to 50 | ppm |

### ITU-R Thresholds (Do Not Cross)
- **BER > 10⁻³** (log₁₀ > −3): Unacceptable for voice/data. Flag CRITICAL.
- **SNR < 6 dB**: Below Shannon limit for BPSK at target BER. Flag WARNING.
- **Carrier Deviation > 10 ppm**: Out-of-band per ITU-R SM.1633. Flag CRITICAL.
- **Doppler > 5 kHz at S-Band**: Indicates either high relative velocity
  (>1000 m/s) or LO instability. Flag WARNING.

### Mahalanobis Threshold Rationale
The service uses χ² thresholds for df=6 (6-dimensional sensor vector):
- **NOMINAL**: d < √χ²(0.95, 6) ≈ 2.449
- **WARNING**: 2.449 ≤ d < 3.162 (√χ²(0.99, 6))
- **CRITICAL**: d ≥ 3.162

When adding new sensor dimensions, update threshold via χ² CDF for new df.

---

## Anomaly Signature Library

### Weak-Signal Fade (W5LUA/KM5PO Signature)
- SNR collapse below 3 dB
- RSSI drop ≥ 15 dBm from baseline
- BER spike to 10⁻² or higher
- Action: escalate to CRITICAL; check receive chain for LNA failure

### Multipath Interference
- RSSI oscillates ±6 dBm at 1–10 Hz
- SNR variance increases but mean stays nominal
- BER spikes intermittently
- Action: WARNING; recommend beam diversity or frequency hop

### Power Amplifier Fault (SSPA/TWTA)
- TxPower drops >30% from baseline
- Carrier deviation spikes (ALC loop instability)
- RSSI/SNR on receive chain may appear normal (fault is transmit-side)
- Action: CRITICAL; recommend hardware inspection

### LO Phase Noise / Frequency Drift
- Carrier deviation exceeds 10 ppm
- Doppler reading inconsistent with known platform kinematics
- BER elevated despite adequate SNR
- Action: WARNING → CRITICAL based on deviation magnitude

---

## Code Conventions for This Repository

1. **Sensor vector order is fixed**: `[RSSI, SNR, BER(log₁₀), Doppler(kHz), TxPower(W), CarrierDev(ppm)]`
   - Never reorder dimensions without updating `baseline_config/active` in Firestore
   - Never add dimensions without re-computing Σ and running `npm run seed`

2. **Baseline updates**: Only update `baseline_config/active` after collecting
   ≥ 1000 nominal readings. Use the Ledoit-Wolf shrinkage estimator for Σ if
   n < 30 × dimensions.

3. **Thresholds are physics-derived**: Do not lower NOMINAL threshold below 1.5
   (risks false positives). Do not raise CRITICAL above 4.0 (risks missed faults).

4. **All test vectors must be physically plausible**: The simulator
   (`simulate_edge.ts`) uses real S-Band physics. Do not generate vectors with
   RSSI > −50 dBm (thermal noise floor violation) or TxPower > 500 W without
   domain justification.

---

## References
- ITU-R SM.1633: Compatibility analysis between different radio systems
- ECSS-E-ST-50-05C: Radio frequency and modulation (ESA standard)
- Proakis, J.G. "Digital Communications" (5th Ed.) — Chapter 14 (Fading channels)
- W5LUA Operating Techniques for Weak Signal Work (ARRL)
