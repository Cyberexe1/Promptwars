# Promptwars: GenAI Event Planning Assistant

A planning assistant for **weddings, birthdays, and community events**. It turns event context—type, date, guests, budget, city, and preferences—into a practical budget, dated timeline, vendor checklist, and personalized ideas.

**Stack:** React 19 + Vite · Node.js + Express · Amazon DynamoDB · Amazon Bedrock · AWS App Runner · S3 + CloudFront

## Project Status

All five phases are implemented and deployed to AWS. The public React application uses CloudFront with a private S3 origin; the Node API runs on App Runner with DynamoDB persistence, Secrets Manager, ECR, and live Amazon Nova Lite generation.

| Phase                               | Status                           | Document                                               |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------ |
| 1. Foundation and project setup     | Complete                         | [Phase 1](phases/PHASE-1-FOUNDATION.md)                |
| 2. Backend core and planning engine | Complete                         | [Phase 2](phases/PHASE-2-BACKEND-CORE.md)              |
| 3. GenAI integration with Bedrock   | Complete; live Nova smoke passed | [Phase 3](phases/PHASE-3-GENAI-INTEGRATION.md)         |
| 4. Frontend and accessibility       | Complete                         | [Phase 4](phases/PHASE-4-FRONTEND.md)                  |
| 5. AWS deployment and submission    | Complete                         | [Phase 5](phases/PHASE-5-DEPLOYMENT-AND-SUBMISSION.md) |

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
Express API (AWS App Runner)
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
- Visual design: a landing page with an animated plan preview, feature grid, how-it-works steps, and event-type cards. The dashboard has a hero header with a countdown, icon tabs, KPI cards, an animated progress ring and budget bar, and styled timeline, budget, vendor, and chat panels. Motion is CSS-only (system fonts, no external assets, compatible with the strict CloudFront CSP) and is turned off by `prefers-reduced-motion`.

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
├── infrastructure/             CloudFormation stacks and deployment guide
├── scripts/                    Safe deployment and validation scripts
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

The script sends one synthetic, non-personal event to Bedrock and fails unless the response is available and schema-valid. It does not run in CI. A live smoke passed with `amazon.nova-lite-v1:0`, returning five schema-valid, budget-bound ideas.

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

The default suite runs 127 backend tests and 64 frontend tests, and `npm run test:coverage` fails if coverage drops below the minimums in the table.

| Area     | Lines | Branches | Enforced minimum (lines / branches) |
| -------- | ----- | -------- | ----------------------------------- |
| Backend  | 99%   | 89%      | 97% / 87%                           |
| Frontend | 98%   | 92%      | 96% / 88%                           |

- **Backend:** planning decisions, auth, ownership, mutations, optimistic concurrency, refinement confirmation, AI sanitization, prompt allowlisting, JSON repair, semantic validation, caching, fallbacks, Bedrock transport behavior, API contracts, quotas, error handling, config validation, response compression, and cache-header safety. The DynamoDB repository also runs against an in-memory client that implements transactions, conditions, updates, and paging, so its real logic is exercised on every run. DynamoDB Local tests (below) additionally run it against the real engine.
- **Frontend:** mocked HTTP only. Covers every page, every dashboard tab, all error and retry paths, form validation, the refinement dialog (focus trap, Escape, conflict handling), keyboard tab navigation, and jsdom axe scans.
- **Browser end-to-end test** (`npm run e2e`): builds the frontend against a local API, starts the real Express app with in-memory storage and an unavailable AI model, and drives Edge/Chrome through sign-up (including weak-password rejection), the five-step wizard, completing a task, overspending, vendor updates, the AI fallback paths, reload persistence, deletion, log out/in with a wrong password, and the 404 page. Current result: 13/13 steps.
- **Real-browser accessibility audit** (`npm run build && npm run audit:a11y`): runs axe-core (WCAG 2.0/2.1/2.2 A and AA plus best practices, including colour contrast) in Edge or Chrome on 14 screens at desktop and phone sizes. It also checks reflow at 320px, 44px touch targets, and visible keyboard focus. Current result: 45 checks, 0 violations.
- **Delivery performance** (Lighthouse, mobile profile, live CloudFront site, median of 5 runs): performance 97 (range 94-98), accessibility 100, best practices 100, SEO 100. Assets are brotli-compressed and immutable-cached, the landing page ships in the main bundle, and API responses are gzip-compressed. Single runs vary by about 5 points on shared hardware.

```powershell
$env:RUN_DYNAMODB_INTEGRATION = "true"
$env:DDB_ENDPOINT = "http://localhost:8000"
npm run test --workspace backend -- tests/integration/dynamodb-local.test.ts
```

## Assumptions and Current Limitations

- Monetary input uses currencies from the supported two-decimal ISO 4217 set.
- Vendor entries are planning categories, not a live marketplace.
- AI estimates are suggestions, not quotes or professional advice.
- Accepted refinement previews are revalidated and atomically persisted by the Phase 4 confirmation endpoint.
- The five-minute cache and AI rate limiter are in-process MVP controls; the prepared App Runner configuration caps the service at one instance. Move both controls to a shared store before horizontal scaling.
- Bedrock output safety is strongest when the optional Guardrail is configured.
- The selected deployment model is `amazon.nova-lite-v1:0`; its live synthetic smoke check passed.
- The accessible React workflow is deployed; a manual NVDA screen-reader walkthrough remains a recommended human release check.
- Live production URLs are listed below.

## AWS Deployment

The application is deployed in `us-east-1`. The target architecture is:

```text
CloudFront ──OAC──> private/versioned S3 frontend
    |
    `── browser HTTPS calls ──> App Runner API (single instance)
                                      |── DynamoDB retained table
                                      |── Bedrock Converse + optional Guardrail
                                      `── Secrets Manager JWT secret

ECR stores immutable Git-SHA backend images.
```

`infrastructure/foundation.yml` provisions retained data/secrets, ECR, separate App Runner pull/runtime roles, S3, CloudFront security headers/SPA fallback, and an optional cost budget. `infrastructure/application.yml` provisions the image-based App Runner service. See [the deployment runbook](infrastructure/README.md).

AWS documentation now states that App Runner is closed to new customers after April 30, 2026; an existing eligible account is required. The deployment script checks App Runner API access before creating resources.

### Safe preflight (no resource changes)

```powershell
./scripts/deploy.ps1 `
  -Region us-east-1 `
  -BedrockModelId '<model-or-inference-profile-id>' `
  -BedrockModelArn '<exact-allowed-resource-arn>'
```

### Authorized deployment

The same command with `-Execute` creates billable public AWS resources. Do not run it until the account, region, model access, monthly budget, IAM policy, retained-resource behavior, and S3 `--delete` preview have been reviewed and explicitly approved.

The backend image uses pinned `public.ecr.aws/docker/library/node:22.23.4-alpine3.23`, was remotely built by CodeBuild from Git SHA `5d9b7ebae98a`, runs as the non-root `node` user, excludes all `.env` files, and has zero ECR scan findings. The React build embeds the App Runner URL at build time. CloudFront serves the private S3 origin with HTTPS, CSP, HSTS, clickjacking/content-type/referrer protections, and `/index.html` fallback for direct React routes.

### Live URLs

- Frontend: **https://d2tqgtztkwfw4j.cloudfront.net**
- API: **https://uvpwnzxmbe.us-east-1.awsapprunner.com**

## Submission Readiness

- Public repository: [Cyberexe1/Promptwars](https://github.com/Cyberexe1/Promptwars)
- Required branch: `main` only
- Repository limit: under 10 MB (verified after each phase)
- Secrets: `.env` and build outputs ignored; history scanned before deployment/submission
- Code, security, efficiency, testing, accessibility, and problem alignment are documented above
- Remaining human check: manual NVDA walkthrough before final challenge submission

### Production validation evidence

- App Runner and both CloudFormation stacks reached successful completion.
- Public API health, allowed/blocked CORS behavior, CloudFront security headers, React SPA fallback, and direct S3 denial passed.
- An authenticated synthetic E2E created wedding, birthday, and community plans; verified exact budget totals, event listing, task mutation, and DynamoDB transactions.
- Deployed Bedrock returned five validated, budget-bound Nova Lite ideas with `aiAvailable: true`.
- All synthetic events and account records were removed after validation.
