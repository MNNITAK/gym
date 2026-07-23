# KEYSTONE — Build Plan

B2B SaaS "operating system for gyms." Members interact entirely over WhatsApp;
gyms pay a per-active-member subscription. Three AI engines on one shared member
brain, coach-in-the-loop. The moat is data (compounding per-member memory +
cross-gym learning), not the model.

## Stack

TypeScript full-stack, pnpm + Turborepo monorepo. Next.js dashboard · NestJS API ·
BullMQ/Redis worker · **Firebase Firestore** (Admin SDK) for the member brain. LLM
behind a `LlmProvider` interface with **Groq** as the default impl (swappable).
WhatsApp Business Cloud API.

## Phased execution

- **Phase 0 — Foundation** ✅ **DONE**: monorepo + infra, member-brain schema,
  multi-tenancy + auth + RBAC, LLM abstraction + safety guardrails, WhatsApp
  gateway, coach-approval state machine, recurring-jobs worker, coach console.
  _Exit: member → api → coach → member loop works end-to-end._
- **Phase 1 — Diet Engine v1** ✅ **DONE** (first paid product): intake → macro
  engine → protocol selection → Note parsing → Metabolic Twin baseline → branded
  PDF + WhatsApp delivery → coach approval. Validated live (`scripts/e2e-diet.mjs`).
- **Phase 2 — Training Engine v1** ✅ **DONE**: Trend Library (7 protocols),
  Fatigue Guardian (forced deloads), auto-progression from logs, injury-aware
  substitution, movement regression/progression, diet/training macro coupling.
  Validated live (`scripts/e2e-training.mjs`).
- **Phase 3 — Retention Engine (full)** ✅ **DONE**: memory-extraction pipeline
  (worker), Ritual Engine (daily WhatsApp micro-rituals), churn prediction with
  live sentiment, streaks/tiers, send-a-win (milestone → coach-gated congrats),
  concierge bot (auto-answers + escalation). Validated live (`scripts/e2e-retention.mjs`).
- **Phase 4 — Scale & flywheel** ✅ **DONE**: cross-gym learning (k-anonymized,
  PII-gated `aggregatePatterns`), Trend Library expansion, owner analytics
  (`/analytics/overview`, `/analytics/patterns`).

## Patent-candidate methods (already scaffolded as deterministic, tested logic)

1. **Adherence-gated plan adjustment** — `packages/core/src/adherence.ts`
2. **Cross-engine calorie coupling** — `packages/core/src/training.ts` (`coupleMacrosToTraining`)
3. **Individualized TDEE regression** — `packages/core/src/metabolic.ts`
4. **Structured memory extraction** — `packages/core` schema + `apps/worker/src/processors/memory.ts`

Plus the Fatigue Guardian + auto-progression (`packages/core/src/training.ts`) and
the k-anonymized, PII-gated cross-gym aggregation (`packages/core/src/flywheel.ts`).

## Billing tiers

`CORE ₹49` (retention only) · `PRO ₹149` (+ diet) · `ELITE ₹249` (full) — gated
via `Gym.tier`.

## Open decisions (tracked, non-blocking)

WhatsApp direct-Meta vs Indian BSP · Groq model-per-task + structured-output
fallback · Auth.js vs Clerk · churn heuristic → trained model · gym-software sync
targets (depend on anchor gyms) · brand/trademark + IP workup in parallel.
