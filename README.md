# KEYSTONE

The operating system for gyms that keep members for life. Three named AI engines —
**Hearth**, **Forge**, **Anchor** — on one shared **member brain**, with a **coach in
the loop** (AI drafts, a human approves).

Sold to gyms as a per-active-member subscription. The moat is the compounding data:
per-member memory (switching cost) + cross-gym learning (network effect).

> **All five phases of the [build plan](./docs/PLAN.md) are built**, plus a full
> member-facing panel. Everything runs as **one Next.js app** that deploys to
> Vercel as a single project — no separate API server, no Redis.

## The three engines

| | Engine | Domain | What it means |
|---|---|---|---|
| 🔥 | **Hearth** | Nutrition | *Where you're fed* |
| ⚒️ | **Forge** | Training | *Where you're built* |
| ⚓ | **Anchor** | Retention | *What keeps you here* |

They are separate products, not three prompts. Each has its own module, persona,
scope and **capability set** — enforced at runtime. Only Forge can flag an injury;
only Hearth can log food. An engine is never even told about actions it may not
perform, and out-of-scope actions are dropped on return.

📁 `packages/ai/src/agents/{hearth,forge,anchor}.ts` · `packages/core/src/engines.ts`

## Two surfaces, one brain

```
   MEMBER  →  /app          COACH / OWNER  →  /dashboard
   Today · Diet · Training   Members · Approvals · Retention
   Coach · Progress · Gym    Library · Analytics
        │                          │
        └────────────┬─────────────┘
                     ▼
   Firestore — the SHARED MEMBER BRAIN (multi-tenant, gymId on every doc)

   Recurring work (metabolic · churn · memory · rituals · wins · tiers ·
   plans · renewals · cross-gym patterns) runs via /api/jobs/run —
   Vercel Cron daily, or one click in the console.
```

Members sign in with their phone number and get everything in the browser. Plans
render digitally — **there is no PDF**. Coach messages arrive in an in-app inbox;
WhatsApp is an optional mirror that only fires if it's configured.

### Workspaces

| Package | What it is |
|---|---|
| `packages/core` | The deterministic rules that must be correct: Metabolic Twin regression, adherence gate, Fatigue Guardian, auto-progression, cross-engine coupling, churn, safety guardrails, the k-anonymity/PII gate, movement + rehab library, engine definitions, approval state machine |
| `packages/ai` | `LlmProvider` interface + `GroqProvider` (default, swappable), the plan-generation engines, and the three member-facing agents |
| `packages/db` | Firestore (Admin SDK) data layer — typed repositories + seed |
| `packages/whatsapp` | Cloud API client (optional mirror channel) |
| `apps/dashboard` | **The app** — member panel, coach console, all API routes, engine orchestration in `lib/server/` |
| `apps/api`, `apps/worker` | Legacy standalone NestJS API + BullMQ worker. Kept for reference, **not** built or deployed. |

## Quickstart

```bash
cp .env.example .env      # set FIREBASE_PROJECT_ID; add GROQ_API_KEY for real generations
# Drop your Firebase service-account key at ./service-account.json (gitignored)
pnpm install
pnpm db:seed              # demo gym, 11 members, 24 days of logs, protocols, rituals
pnpm dev                  # the whole app on :3000
```

| Surface | URL | Login |
|---|---|---|
| Member panel | http://localhost:3000/app | `9000000001` / `member-demo` |
| Coach console | http://localhost:3000/dashboard | `coach@demo.gym` / `keystone-demo` |

## Demo script

**As a member** (`/app`) — Today shows their calories and session at a glance, with
rituals to tap off. Diet has the day's meals, a **Craving SOS**, and a food log.
Training gives real coaching cues and common mistakes per exercise, with "too hard /
too easy / **it hurts**". Coach is the three engines; tell Hearth *"had dal and 2
rotis"* and it logs it. Progress shows **their** metabolism vs what a generic
calculator would have said. Me shows every fact the AI remembers — with a Forget button.

**As a coach** (`/dashboard`) — Members → open one to see the brain. Draft a plan;
open **Review & revise** to see the **"Why the AI did this"** panel (enforced rules
in red — the moment it stops looking like ChatGPT) and to chat the plan into shape.
Approve & send. Retention shows who to call and why. Overview runs the engine jobs live.

```bash
node scripts/e2e-demo.mjs     # coach flow: both engines + flywheel
node scripts/e2e-member.mjs   # member flow: panel + all three agents
pnpm test                     # 93 unit tests on the deterministic rules
```

### API surface

| Route | What it does |
|---|---|
| `POST /api/me/login` · `GET /api/me/today` | member auth + home |
| `GET /api/me/diet` · `/training` · `/progress` · `/profile` · `/gym` · `/inbox` | member screens |
| `POST /api/me/agent` · `GET /api/me/agent?agent=hearth` | talk to an engine · load its thread |
| `POST /api/me/log` · `/rituals` | direct logging + ritual completion |
| `POST /api/members/:id/{diet,training}-plan/generate` | draft a plan (coach-gated) |
| `POST /api/plans/:id/revise` · `/transition` | AI revision chat · the coach gate |
| `GET /api/retention/at-risk` · `POST /api/members/:id/wins/scan` | churn queue · send-a-win |
| `GET /api/analytics/overview` · `/patterns` | owner numbers · cross-gym priors |
| `POST /api/sync/import` | roster import from existing gym software (CSV or webhook) |
| `POST /api/jobs/run` | the recurring engine work (Vercel Cron calls this daily) |

## Deploy to Vercel

1. Push and import the repo. `vercel.json` sets the monorepo build and the daily cron.
2. `node scripts/print-service-account-env.mjs` → paste as `FIREBASE_SERVICE_ACCOUNT`
   (serverless has no filesystem for a key file).
3. Env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT`, `AUTH_SECRET`,
   `GROQ_API_KEY`, `CRON_SECRET`.
4. `pnpm db:seed` once against the same Firebase project.

> No `GROQ_API_KEY`? The app runs end-to-end on a deterministic mock provider —
> fine for a dry run, but use a real key for a client demo.

## Tests

```bash
pnpm test    # adherence gate, metabolic twin, Fatigue Guardian, auto-progression,
             # cravings, events, movement library, entitlements, churn, flywheel
             # PII gate, engine separation + capability isolation
```

## Database (Firebase Firestore)

The shared member brain lives in **Firestore**, accessed server-side via the Admin
SDK. App code uses typed repositories (`repos.members.*`) — never raw queries.

- **Credentials:** `FIREBASE_PROJECT_ID` plus either `GOOGLE_APPLICATION_CREDENTIALS`
  (local file) or `FIREBASE_SERVICE_ACCOUNT` (raw/base64 JSON, for serverless).
- **Rules & indexes:** deploy the deny-all client rules in `firestore.rules` with
  `firebase deploy --only firestore`. All access is server-side through the Admin
  SDK — no browser touches Firestore directly.
- **Multi-tenancy:** every document carries `gymId`; uniqueness (gym slug, member
  phone, staff email) is enforced via deterministic document IDs.

## LLM provider

Set `LLM_PROVIDER=groq` and `GROQ_API_KEY`. Two models per task — `reasoning` for
plan generation, `fast` for agents and parsing. Swapping providers means writing one
`LlmProvider` class; no engine code changes.

## Roadmap (see docs/PLAN.md)

- **Phase 0 — Foundation** ✅
- **Phase 1 — Diet Engine (Hearth)** ✅
- **Phase 2 — Training Engine (Forge)** ✅
- **Phase 3 — Retention Engine (Anchor)** ✅
- **Phase 4 — Scale & cross-gym flywheel** ✅
- **Phase 5 — Member panel** ✅ *(beyond the original plan)*
