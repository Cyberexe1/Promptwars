# Promptwars: GenAI Event Planning Assistant

A planning assistant for **weddings, birthdays, and community events**. It turns event context—type, date, guests, budget, city, and preferences—into a practical budget, dated timeline, vendor checklist, and personalized ideas.

**Stack:** React 19 + Vite · Node.js + Express · Amazon DynamoDB · Amazon Bedrock · AWS App Runner · S3 + CloudFront

## Project Status

Phases 1–4 are implemented. The project now includes a secure TypeScript API, deterministic planning engine, DynamoDB persistence, guarded Bedrock features, and a responsive, accessible React experience covering the complete planning workflow.

| Phase                               | Status                                | Document                                               |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| 1. Foundation and project setup     | Complete                              | [Phase 1](phases/PHASE-1-FOUNDATION.md)                |
| 2. Backend core and planning engine | Complete                              | [Phase 2](phases/PHASE-2-BACKEND-CORE.md)              |
| 3. GenAI integration with Bedrock   | Complete; live smoke needs a model ID | [Phase 3](phases/PHASE-3-GENAI-INTEGRATION.md)         |
| 4. Frontend and accessibility       | Complete                              | [Phase 4](phases/PHASE-4-FRONTEND.md)                  |
| 5. AWS deployment and submission    | Planned                               | [Phase 5](phases/PHASE-5-DEPLOYMENT-AND-SUBMISSION.md) |

## Chosen Vertical

**Event Planning Assistant** for weddings, birthdays, and community events. The assistant considers event type, date, location, guest count, total budget, setting, audience, and preferences such as vegetarian or eco-friendly planning.

## Approach and Logic

- **Deterministic engine first:** tested rules always produce the budget, timeline, warnings, and vendor checklist.
- **Contextual decisions:** large guest counts shift funds toward venue and food; outdoor events add rentals and contingency; kids' events prioritize entertainment and omit bar service; short-notice events mark missed tasks urgent.
- **Exact budget math:** allocations use integer cents, reserve 5–10% contingency, and always total the user's budget.
- **AI as a guarded enhancement:** Bedrock personalizes ideas, refinement proposals, and chat without replacing or silently mutating the deterministic plan.
- **Graceful degradation:** unavailable, filtered, timed-out, malformed, or over-budget model output returns useful deterministic content with `aiAvailable: false`.
- **Secure and accessible by design:** strict validation, authentication, rate limits, prompt isolation, least-privilege IAM, semantic HTML, keyboard support, and explicit status messaging.

## Architecture

```text
React browser app
       |
       | HTTPS / JSON API
       v
Express API (AWS App Runner in Phase 5)
       |-- Auth: bcrypt + one-hour JWT
       |-- Deterministic planning engine
       |-- AI safety/orchestration layer
       |       |-- input sanitization + escaped delimiters
       |       |-- Zod output + budget/date validation
       |       |-- one repair attempt within one 25s deadline
       |       `-- deterministic fallback + short-lived cache
       |                         |
       |                         `--> Amazon Bedrock Converse API
       |
       `--> Amazon DynamoDB single table
```

Repository and model-client interfaces isolate AWS from route and business logic. Unit/API tests use in-memory repositories and fake models; production uses the AWS SDK default credential chain.

## Current Features

### Planning core

- Account signup/login with normalized emails, bcrypt cost 12, and one-hour JWTs.
- Event CRUD with ownership enforcement on every event and nested operation.
- Context-sensitive budget allocation, timeline generation, vendor checklist, and warnings.
- Spending, task, quote, and vendor-status tracking.
- Optimistic concurrency and progress-preserving plan regeneration.
- Strongly consistent, paginated, transactional DynamoDB persistence.

### GenAI layer

- Personalized theme, menu, activity, decor, and gift ideas.
- Read-only plan refinement proposals with balanced budget shifts, valid task dates, and a `baseVersion` for stale-preview protection.
- Context-aware event chat using the latest tasks, budgets, vendors, and warnings.
- Strict JSON/Zod model-output validation and one corrective request for malformed or semantically invalid output.
- Model idea costs rejected when they exceed the applicable remaining category allocation.
- Five-minute, 100-entry successful-ideas cache keyed by owner, event version, category, and hashed notes.
- Aggregate 20-request/15-minute per-user AI quota.
- Optional Bedrock Guardrail configuration and rejection of filtered/guardrail/tool/truncated responses.
- Safe, useful fallback responses when Bedrock is unavailable.

### React experience

- Public landing, signup/login, protected routes, session restoration, and automatic `401` logout with return-path preservation.
- Five-step event wizard with per-step validation, focus management, per-guest budget feedback, and review.
- Event list with loading, empty, retry, deletion, and creation states.
- URL-addressable, keyboard-operated dashboard tabs for overview, budget, timeline, vendors, ideas, and assistant.
- Full-plan refresh after serialized mutations, with committed-write/refresh-failure distinction.
- Accessible budget table, progress text, task controls, vendor forms, AI fallback banners, live chat announcements, and a focus-contained refinement dialog.
- Route-level code splitting, responsive layouts down to 360px, reduced-motion support, 44px targets, and text equivalents for visual status.

## Repository Layout

```text
.
├── backend/
│   ├── scripts/ai-smoke.ts
│   ├── src/
│   │   ├── config/             Environment, logging, AWS clients
│   │   ├── domain/             Domain models
│   │   ├── middleware/         Authentication, validation, errors
│   │   ├── repositories/       DynamoDB contracts and implementations
│   │   ├── routes/             Auth, events, health, AI
│   │   ├── schemas/            Strict HTTP request schemas
│   │   └── services/
│   │       ├── ai/             Bedrock adapter, prompts, safety, fallbacks
│   │       └── planning/       Deterministic planning engine
│   └── tests/                  API, planning, AI, and AWS adapter tests
├── frontend/                   React application and component tests
├── infrastructure/             DynamoDB CloudFormation template
├── phases/                     Five implementation guides
├── package.json                npm workspaces and shared commands
└── README.md
```

## Local Setup

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm 10+
- Git
- AWS credentials with DynamoDB and Bedrock permissions for live calls
- Model access enabled in the selected AWS region

### Install and configure

```powershell
npm install
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Set a unique `JWT_SECRET` of at least 32 characters. Production startup rejects the public example value. Local AWS keys may only go in `backend/.env`, which is ignored by Git and Docker; never place secrets in the frontend or `VITE_` variables. App Runner will use an IAM role and managed secret instead of static credentials.

Relevant backend variables:

```dotenv
AWS_REGION=us-east-1
DDB_TABLE_NAME=eventplanner-dev
BEDROCK_MODEL_ID=<approved-model-or-inference-profile-id>
BEDROCK_GUARDRAIL_ID=
BEDROCK_GUARDRAIL_VERSION=
JWT_SECRET=<at-least-32-random-characters>
```

The Guardrail values are optional but must be configured together. Do not place personal or sensitive information in event titles, preferences, AI notes, or chat messages because those selected fields may be sent to Bedrock for personalization.

### Create the DynamoDB table

```powershell
aws cloudformation deploy `
  --template-file infrastructure/dynamodb-table.yml `
  --stack-name promptwars-dev `
  --parameter-overrides Environment=dev
```

For DynamoDB Local, use `DDB_ENDPOINT=http://localhost:8000` and non-production placeholder AWS credentials.

### Run locally

```powershell
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:8080`.

### Run a live Bedrock smoke test

After setting an approved `BEDROCK_MODEL_ID`:

```powershell
npm run ai:smoke --workspace backend
```

The script sends one synthetic, non-personal event to Bedrock and fails unless the response is available and schema-valid. It does not run in CI. At the end of Phase 3, local credentials were configured but no model ID was present, so this environment-specific check remains unexecuted.

### Quality commands

```powershell
npm run lint
npm run test
npm run build
npm run format:check
npm audit --audit-level=high
```

## API

All `/api/events` endpoints require `Authorization: Bearer <token>`.

| Method   | Path                                | Purpose                                  |
| -------- | ----------------------------------- | ---------------------------------------- |
| `GET`    | `/api/health`                       | Service health                           |
| `POST`   | `/api/auth/signup`                  | Create an account and token              |
| `POST`   | `/api/auth/login`                   | Authenticate and return a token          |
| `GET`    | `/api/events`                       | List the user's events                   |
| `POST`   | `/api/events`                       | Create an event and deterministic plan   |
| `GET`    | `/api/events/:id`                   | Get the complete plan                    |
| `PATCH`  | `/api/events/:id`                   | Update context and optionally regenerate |
| `DELETE` | `/api/events/:id`                   | Delete the event and plan                |
| `PATCH`  | `/api/events/:id/tasks/:taskId`     | Change task completion status            |
| `PATCH`  | `/api/events/:id/budget/:category`  | Record category spending                 |
| `PATCH`  | `/api/events/:id/vendors/:vendorId` | Record vendor status and quote           |
| `POST`   | `/api/events/:id/ai/ideas`          | Generate personalized ideas              |
| `POST`   | `/api/events/:id/ai/refine`         | Preview validated plan changes           |
| `POST`   | `/api/events/:id/refinements/apply` | Confirm and atomically apply a preview   |
| `POST`   | `/api/events/:id/ai/chat`           | Ask an event-context question            |

### AI requests

```json
{ "category": "decor", "extraNotes": "Keep it low waste" }
```

```json
{ "instruction": "Move some venue budget to vegetarian catering" }
```

```json
{
  "message": "What should I do this week?",
  "history": [{ "role": "user", "content": "Help me prioritize" }]
}
```

Text fields are sanitized and capped at 500 Unicode characters. Chat history is restricted to user/assistant roles and 10 messages. Unknown fields and query parameters are rejected.

AI endpoint failures intentionally return HTTP `200` with the normal response shape and `aiAvailable: false`, allowing the UI to remain useful. Authentication, ownership, validation, and rate-limit failures still use `401`, `404`, `400`, and `429` respectively.

Refinement preview never writes to DynamoDB. The response includes the event's `baseVersion`; the React UI displays an accessible before/after confirmation dialog. Apply sends the unchanged proposal to `POST /api/events/:id/refinements/apply`, where the backend revalidates ownership, version, categories, dates, amounts, duplicates, and plan capacity before one atomic write. Cancel performs no write.

## DynamoDB Design

| Entity              | PK                        | SK                  |
| ------------------- | ------------------------- | ------------------- |
| User                | `USER#<userId>`           | `PROFILE`           |
| Email lookup        | `EMAIL#<normalizedEmail>` | `USER`              |
| Event owner/summary | `USER#<userId>`           | `EVENT#<eventId>`   |
| Budget item         | `EVENT#<eventId>`         | `BUDGET#<category>` |
| Task                | `EVENT#<eventId>`         | `TASK#<taskId>`     |
| Vendor              | `EVENT#<eventId>`         | `VENDOR#<vendorId>` |

## Security

- Bcrypt cost 12 and enumeration-resistant login behavior.
- One-hour HS256 JWT containing only the user ID.
- Strict Zod validation for bodies, path parameters, query strings, model JSON, money, categories, and dates.
- Ownership is checked before every AI call and before cache access.
- User content is normalized, control-stripped, escaped inside explicit untrusted-data delimiters, and excluded from logs/cache keys.
- Prompt context uses an allowlist and excludes user IDs, timestamps, JWTs, credentials, and environment values.
- Bedrock requests cap tokens/temperature, use SDK retries, and share a 25-second end-to-end deadline across the initial and repair calls.
- Optional Bedrock Guardrails are supported; guardrail intervention, filtering, tool use, truncation, non-text, and empty output all fall back safely.
- Helmet, exact-origin CORS, request-size limits, safe production errors, and redacted structured logs are enabled.
- The frontend persists the one-hour bearer token in `localStorage` so sessions survive reloads. This MVP choice is vulnerable to token theft if an XSS flaw is introduced; model output is rendered only as React text, no HTML injection APIs are used, and a `401` clears the session. A production hardening option is a short-lived in-memory access token plus a rotating refresh token in a secure, SameSite, `httpOnly` cookie.
- Production AWS access uses least-privilege IAM; no static credentials are committed.

## Testing

The default suite runs 68 backend tests and 5 frontend workflow tests. Backend coverage includes planning decisions, auth, ownership, mutations, concurrency, refinement confirmation, DynamoDB commands, AI sanitization, prompt allowlisting, JSON repair, semantic validation, caching, fallbacks, Bedrock transport behavior, API contracts, and quotas. Frontend tests use mocked HTTP only and cover health, protected login, the five-step wizard, per-guest calculation, mutation/refetch behavior, keyboard tabs, budget/overspend text, AI fallback states, chat, refinement Cancel/Apply, and axe scans. DynamoDB Local tests separately execute real transaction and lifecycle behavior.

```powershell
$env:RUN_DYNAMODB_INTEGRATION = "true"
$env:DDB_ENDPOINT = "http://localhost:8000"
npm run test --workspace backend -- tests/integration/dynamodb-local.test.ts
```

## Assumptions and Current Limitations

- Monetary input uses currencies from the supported two-decimal ISO 4217 set.
- Vendor entries are planning categories, not a live marketplace.
- AI estimates are suggestions, not quotes or professional advice.
- Refinements are non-persistent previews until the Phase 4 confirmation UX is implemented.
- The five-minute cache and AI rate limiter are in-process MVP controls. Phase 5 must use a shared store or a single App Runner instance before horizontal scaling.
- Bedrock output safety is strongest when the optional Guardrail is configured.
- The live model smoke test requires the user-selected model ID and access; none was configured during this phase.
- The accessible React workflow is complete; deployment and a manual NVDA screen-reader walkthrough remain Phase 5 release checks.
- The final live demo URL will be added in Phase 5.
