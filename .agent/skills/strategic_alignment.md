---
name: Strategic Alignment Loop
description: >
  Forces the agent to read the business strategy context before writing any code,
  then update the strategy with technical findings after every successful commit or deployment.
  Ensures every PR directly serves the MRO Digital Twin pitch goal.
---

# Skill: Strategic Alignment Loop

## Trigger

Activate at the **start of every new task**, feature request, architectural change, or PR — before writing any code.

---

## Rules

### Rule 1 — Context Ingestion (MANDATORY FIRST STEP)

Before writing a single line of code or making any architectural decision, you **MUST**:

1. Read `.agent/STRATEGY.md` in full.
2. Identify the **Current Goal** and **Active Questions** sections.
3. Read the **Pitch Readiness Checklist** to understand what is P0/P1/P2.

If `.agent/STRATEGY.md` does not exist, **stop** and create it using the template from the project README before proceeding.

---

### Rule 2 — Value Justification (MANDATORY BEFORE CODING)

Before generating any code, explicitly state (in your internal reasoning or in a PR description):

> **"This change serves the strategy by: [explain how it advances the Current Goal or answers an Active Question]."**

If you cannot draw a direct line from the code to the strategy, escalate to the user before proceeding. Do not write code that does not serve the pitch.

---

### Rule 3 — ICP Alignment Check

Every technical decision must pass the **ICP filter**:

- Does this help an **MRO Maintenance Director** trust the system?
- Does this reduce **AOG risk** or improve **ERP integration**?
- Would this survive a **FAA/EASA airworthiness audit** narrative?

If the answer to all three is "no", reconsider the approach.

---

### Rule 4 — The Reverse Loop (MANDATORY AFTER EVERY COMMIT/DEPLOY)

After every successful deployment, committed PR, or completed feature:

1. Open `.agent/STRATEGY.md`.
2. Append a bullet to the **Technical Capabilities Log** section using this format:
   ```
   - **[YYYY-MM-DD]** [Brief description of new capability and its pitch value.]
   ```
3. Update the **Pitch Readiness Checklist**: change `🔴 Not Started` → `🟡 In Progress` → `✅ Done` as appropriate.
4. If an **Active Question** was answered by the technical work, strike it through and add the answer inline.

---

### Rule 5 — Pitch-First Engineering

When multiple valid technical approaches exist, **always choose the one that is most demonstrable in a 3-minute live pitch**:

- Prefer visual / observable outputs (Firestore console, webhook response payloads, real-time scores).
- Prefer deterministic, replayable flows over randomized ones.
- Prefer sub-500ms end-to-end latency as the default SLA target.
- Prefer Cloud Run over VMs for zero-cold-start demo reliability.

---

## Ignition Prompt Template

When the Lead Engineer has a high-level business question, use this framework internally before responding:

```
Role: Lead Research & Systems Engineer for the MRO Digital Twin.
Context: Read .agent/STRATEGY.md in full.
Steps:
  1. Use sequential-thinking to analyze the business requirement.
  2. Identify which Pitch Readiness item(s) this addresses.
  3. Propose the minimum viable architecture to satisfy the requirement.
  4. Update .agent/STRATEGY.md → Technical Capabilities Log after completion.
  5. Scaffold the required code and commit via github-mcp-server.
Goal: Every output must advance the 30-second pitch hook.
```

---

## Quick Reference: Pitch Pillars

| Pillar | What It Proves |
|---|---|
| **Sense** | Edge simulator → Pub/Sub pipeline is live and realistic |
| **Detect** | Mahalanobis score crosses threshold 72h before failure |
| **Act** | Firestore + ERP webhook fires a work order automatically |
| **Trust** | Human-in-the-loop: agent flags, humans approve |

Every feature must advance at least one of these four pillars.
