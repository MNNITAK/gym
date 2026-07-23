# KEYSTONE

The operating system for gyms that keep members for life. Three AI engines —
**Diet**, **Training**, **Retention** — on one shared **member brain**, delivered
over **WhatsApp**, with a **coach in the loop** (AI drafts, a human approves).

Sold to gyms as a per-active-member subscription. The moat is the compounding
data: per-member memory (switching cost) + cross-gym learning (network effect).

> **All five phases are built** (see the [build plan](./docs/PLAN.md)): the shared
> member brain, multi-tenant auth, WhatsApp gateway, LLM abstraction (Groq, swappable),
> the recurring-jobs worker, the coach console, and all three AI engines —
> **Diet**, **Training**, and **Retention** — plus the cross-gym learning flywheel.
> Every engine is validated end-to-end against real Firestore + Groq.

## Architecture

Everything runs in **one Next.js app** — pages and API routes together — so it
deploys to Vercel as a single project with no separate server and no Redis.

```
Member (WhatsApp) ─┐                          ┌─ Coach (console UI)
                   ▼                          ▼
        apps/dashboard — Next.js app router (pages + /api routes)
                   │                          │
                   │  engines: Diet · Training · Retention
                   ▼
   Firebase Firestore — the SHARED MEMBER BRAIN (multi-tenant, gymId on every doc)

   Recurring work (metabolic · churn · memory · rituals · wins · cross-gym
   patterns) runs via /api/jobs/run — Vercel Cron daily, or one click in the console.
```

### Workspaces

| Package | What it is |
|---|---|
| `packages/db` | Firestore (Admin SDK) data layer for the shared member brain — typed collections, repositories + seed |
| `packages/core` | Shared types, zod schemas, and the deterministic rules that must be correct: Metabolic Twin regression, adherence gate, Fatigue Guardian, auto-progression, churn scoring, safety guardrails, the k-anonymity/PII gate, the coach-approval state machine |
| `packages/ai` | `LlmProvider` interface + `GroqProvider` (default, swappable) + engine reasoning |
| `packages/whatsapp` | Cloud API client, webhook parsing, signature verification |
| `apps/dashboard` | **The app** — coach console + all API routes + the engine orchestration in `lib/server/` |
| `apps/api`, `apps/worker` | Legacy standalone NestJS API + BullMQ worker. Kept for reference; **not** part of the deployed app (their logic lives in `apps/dashboard/lib/server/`). |

## Prerequisites

- Node 22+, pnpm 9+ (`npm i -g pnpm`)
- A **Firebase project** + a service-account key (`service-account.json` in the repo root)

## Quickstart

```bash
cp .env.example .env            # set FIREBASE_PROJECT_ID; add GROQ_API_KEY for real generations (optional)
# Drop your Firebase service-account key at ./service-account.json (gitignored)
pnpm install
pnpm db:seed                    # demo gym + coach + member + protocol library + rituals
pnpm dev                        # the whole app on :3000
```

Open http://localhost:3000 and sign in with `coach@demo.gym` / `keystone-demo`.

## Deploy to Vercel

One project, one deploy.

1. **Push the repo** to GitHub and import it in Vercel. `vercel.json` already sets
   the monorepo build (`pnpm turbo run build --filter=@keystone/dashboard...`) and
   the daily cron — leave Root Directory as the repo root.
2. **Generate the Firebase credential** for serverless (no filesystem, so the key
   travels as an env var):
   ```bash
   node scripts/print-service-account-env.mjs
   ```
3. **Set env vars** in Vercel → Settings → Environment Variables:

   | Variable | Value |
   |---|---|
   | `FIREBASE_PROJECT_ID` | your project id |
   | `FIREBASE_SERVICE_ACCOUNT` | the base64 blob from step 2 |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `GROQ_API_KEY` | your Groq key (omit → deterministic mock responses) |
   | `CRON_SECRET` | any random string; Vercel Cron sends it automatically |

4. **Seed once** against the same Firebase project (`pnpm db:seed` locally is enough —
   it writes to the same Firestore).
5. Deploy. The daily cron hits `/api/jobs/run`; the console's **Run engine jobs**
   button does the same on demand during a demo.

> No `GROQ_API_KEY`? The app still runs end-to-end on a deterministic mock provider —
> useful for a dry run, but generate with a real key for a client demo.

## Demo script (what to show the client)

With the app running (`pnpm dev`) and a `GROQ_API_KEY` set, sign in as
`coach@demo.gym` / `keystone-demo`, then walk this path:

1. **Overview** — the gym at a glance. Hit **Run engine jobs** to fire the
   recurring work live (Metabolic Twin recompute, churn scoring, memory
   extraction, ritual dispatch, win detection, cross-gym aggregation).
2. **Members → Aarav** — the *shared member brain*: the individualized Metabolic
   Twin TDEE, churn risk with a specific intervention, and the durable memories
   extracted from his conversations (the switching cost).
3. **Draft diet plan** — the AI picks a protocol from the library, explains why in
   one sentence, and personalizes it against his TDEE and memories. The adherence
   gate and the safe-calorie floor are enforced server-side no matter what the
   model returns.
4. **Draft training week** — same flow on the Trend Library. The **Fatigue
   Guardian** can force a deload the model is not allowed to override, and injured
   regions get programmed around.
5. **Approvals** — nothing above has reached the member. Review the payload, open
   the branded PDF, then **Approve & send** — that is the moment it is delivered.
6. **Overview → WhatsApp simulator** — send `what's my plan today?` as the member
   (the concierge auto-answers from his brain), then `I have chest pain during
   squats` (hard-escalates to a human *before* any model call).
7. **Retention** — the at-risk queue with per-member suggested interventions, plus
   the anonymized cross-gym patterns that improve every gym's AI.

To verify the whole thing headlessly:

```bash
node scripts/e2e-demo.mjs      # all three engines + the flywheel, through /api
```

### API surface

| Route | What it does |
|---|---|
| `POST /api/members/:id/diet-plan/generate` | draft a diet plan (coach-gated) |
| `POST /api/members/:id/training-plan/generate` | draft a training week (coach-gated) |
| `GET /api/plans/:id` · `GET /api/plans/:id/pdf` | review payload · branded PDF |
| `POST /api/plans/:id/transition` | the coach gate (`APPROVED` → `ACTIVE` delivers) |
| `GET /api/messages/pending` · `POST /api/messages/:id/approve` | message approval queue |
| `POST /api/whatsapp/simulate` | inbound member message, no live number needed |
| `GET /api/retention/at-risk` · `POST /api/members/:id/wins/scan` | churn queue · send-a-win |
| `GET /api/analytics/overview` · `GET /api/analytics/patterns` | owner numbers · cross-gym priors |
| `POST /api/jobs/run` | the recurring engine work (Vercel Cron calls this daily) |

## Tests

```bash
pnpm test        # unit tests across packages (adherence gate, metabolic twin,
                 # churn, guardrails, webhook parsing, LLM structured output)
```

## Database (Firebase Firestore)

The shared member brain lives in **Firebase Firestore**, accessed server-side via
the **Admin SDK** (`packages/db`). App code uses typed repositories
(`repos.members.*`, `repos.plans.*`, …) — never raw queries scattered around.

- **Credentials:** set `FIREBASE_PROJECT_ID`, then either point
  `GOOGLE_APPLICATION_CREDENTIALS` at your service-account JSON locally
  (`./service-account.json`, gitignored) **or** set `FIREBASE_SERVICE_ACCOUNT` to the
  key itself (raw JSON or base64) for serverless hosts with no filesystem — see
  `scripts/print-service-account-env.mjs`. `getDb()` throws early if the project id
  is missing.
- **Rules & indexes:** deploy the deny-all client rules in `firestore.rules` and
  the composite indexes in `firestore.indexes.json` with
  `firebase deploy --only firestore`. All access is server-side through the Admin
  SDK, which bypasses rules — no member or coach browser touches Firestore directly.
- **Multi-tenancy:** every document carries `gymId`; uniqueness (gym slug, member
  phone, staff email) is enforced via deterministic document IDs.

## LLM provider

Set `LLM_PROVIDER=groq` and `GROQ_API_KEY` in `.env`. Without a key the app boots
on a deterministic **mock provider** so the loop still runs offline. Swapping
providers means implementing one `LlmProvider` class in `packages/ai` — no engine
code changes.

## Roadmap (see docs/PLAN.md)

- **Phase 0 — Foundation** ✅
- **Phase 1 — Diet Engine v1** ✅ (first paid product)
- **Phase 2 — Training Engine v1** ✅
- **Phase 3 — Retention Engine (full)** ✅
- **Phase 4 — Scale & cross-gym flywheel** ✅
