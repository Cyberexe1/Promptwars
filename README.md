# Promptwars: GenAI Event Planning Assistant

A planning assistant for **weddings, birthdays, and community events**. It turns event context—type, date, guests, budget, city, and preferences—into a practical budget, dated timeline, vendor checklist, and personalized ideas.

**Stack:** React 19 + Vite · Node.js + Express · Amazon DynamoDB · Amazon Bedrock · AWS App Runner · S3 + CloudFront

## Project Status

Phases 1 and 2 are implemented. The project now includes the TypeScript monorepo, secure account access, DynamoDB persistence, complete event APIs, and a deterministic planning engine. Bedrock personalization begins in Phase 3.

| Phase                               | Status   | Document                                               |
| ----------------------------------- | -------- | ------------------------------------------------------ |
| 1. Foundation and project setup     | Complete | [Phase 1](phases/PHASE-1-FOUNDATION.md)                |
| 2. Backend core and planning engine | Complete | [Phase 2](phases/PHASE-2-BACKEND-CORE.md)              |
| 3. GenAI integration with Bedrock   | Planned  | [Phase 3](phases/PHASE-3-GENAI-INTEGRATION.md)         |
| 4. Frontend and accessibility       | Planned  | [Phase 4](phases/PHASE-4-FRONTEND.md)                  |
| 5. AWS deployment and submission    | Planned  | [Phase 5](phases/PHASE-5-DEPLOYMENT-AND-SUBMISSION.md) |

## Chosen Vertical

**Event Planning Assistant** for weddings, birthdays, and community events. The assistant accounts for event type, date, location, guest count, total budget, indoor/outdoor setting, audience, and preferences such as vegetarian or eco-friendly planning.

## Approach and Logic

- **Deterministic engine first:** tested rules produce the budget, timeline, warnings, and vendor checklist. Core planning remains reliable when GenAI is unavailable.
- **Contextual decisions:** high guest counts shift money toward venue and food; outdoor events receive rentals and additional contingency; kids' events prioritize entertainment and omit bar service; short-notice events mark missed tasks urgent.
- **Exact budget math:** allocations use integer cents internally, reserve 5–10% contingency, and always add back to the user's total.
- **AI as enhancement:** Phase 3 will use Bedrock for personalized ideas, plan refinement, and chat while schema-validating model output.
- **Secure and accessible by design:** strict validation, authentication, rate limits, least-privilege IAM, semantic HTML, keyboard support, and visible status messaging.

## Architecture

```text
React browser app
       |
       | HTTPS / JSON API
       v
Express API on App Runner (planned Phase 5)
       |-- Bcrypt password hashing + one-hour JWTs
       |-- Deterministic planning engine
       |-- DynamoDB repository interface
       v
Amazon DynamoDB single table

Amazon Bedrock integration begins in Phase 3
```

Repository interfaces keep AWS access out of route and planning code. API tests use in-memory implementations; production composition uses the AWS SDK default credential chain and DynamoDB.

## Current Features

- Account signup and login with normalized emails, bcrypt cost 12, and one-hour signed JWTs.
- Event CRUD with ownership enforced for every event and nested resource operation.
- Context-sensitive budget allocation with feasibility and overspending warnings.
- Timeline generation with deterministic tasks, lead times, phases, urgency, and overdue status.
- Vendor checklist with recommended lead time, questions, budget linkage, quote tracking, and status flow.
- Regeneration after context changes while preserving spending, completed tasks, vendor status, and quotes where stable IDs still match.
- DynamoDB single-table persistence with atomic account and plan writes.

## Repository Layout

```text
.
├── backend/
│   ├── src/
│   │   ├── config/          Environment, logging, DynamoDB client
│   │   ├── domain/          Domain models
│   │   ├── middleware/      Authentication, validation, errors
│   │   ├── repositories/    DynamoDB contracts and implementations
│   │   ├── routes/          Auth, events, health
│   │   ├── schemas/         Strict Zod request schemas
│   │   └── services/        Auth, event orchestration, planning engine
│   └── tests/               API, health, and planning tests
├── frontend/                React application and component tests
├── infrastructure/          DynamoDB CloudFormation template
├── phases/                  Five implementation guides
├── package.json             npm workspaces and shared commands
└── README.md
```

## Local Setup

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm 10+
- Git
- AWS CLI and credentials with DynamoDB access for persistent auth/event calls

### Install and configure

```powershell
npm install
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Set a unique `JWT_SECRET` of at least 32 characters in `backend/.env`; production startup rejects the public example value. Real AWS keys may only go in that backend file for local development; it is ignored by Git and Docker. Never place secrets in the frontend or in `VITE_` variables. Production will use an App Runner IAM role and managed secret rather than access keys or checked-in values.

### Create the DynamoDB table

The table uses on-demand billing, encryption, point-in-time recovery, and `PK`/`SK` string keys. Its current access patterns need no secondary index.

```powershell
aws cloudformation deploy `
  --template-file infrastructure/dynamodb-table.yml `
  --stack-name promptwars-dev `
  --parameter-overrides Environment=dev
```

Set `DDB_TABLE_NAME=eventplanner-dev`. For DynamoDB Local, set `DDB_ENDPOINT=http://localhost:8000` and use non-production placeholder AWS credentials.

### Run locally

```powershell
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:8080`.

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
| `GET`    | `/api/events`                       | List the authenticated user's events     |
| `POST`   | `/api/events`                       | Create an event and deterministic plan   |
| `GET`    | `/api/events/:id`                   | Get the complete plan                    |
| `PATCH`  | `/api/events/:id`                   | Update context and optionally regenerate |
| `DELETE` | `/api/events/:id`                   | Delete the event and plan                |
| `PATCH`  | `/api/events/:id/tasks/:taskId`     | Change task completion status            |
| `PATCH`  | `/api/events/:id/budget/:category`  | Record category spending                 |
| `PATCH`  | `/api/events/:id/vendors/:vendorId` | Record vendor status and quote           |

### Example event request

```json
{
  "type": "wedding",
  "title": "Alex and Sam",
  "date": "2027-06-12",
  "guestCount": 120,
  "totalBudget": 25000,
  "currency": "USD",
  "city": "Portland",
  "indoorOutdoor": "outdoor",
  "preferences": ["vegetarian", "eco-friendly"],
  "audience": "mixed"
}
```

Unknown body/query keys, invalid IDs, past dates, more than 2,000 guests, and malformed money values are rejected with structured `400` responses.

## DynamoDB Design

| Entity              | PK                        | SK                  |
| ------------------- | ------------------------- | ------------------- |
| User                | `USER#<userId>`           | `PROFILE`           |
| Email lookup        | `EMAIL#<normalizedEmail>` | `USER`              |
| Event owner/summary | `USER#<userId>`           | `EVENT#<eventId>`   |
| Budget item         | `EVENT#<eventId>`         | `BUDGET#<category>` |
| Task                | `EVENT#<eventId>`         | `TASK#<taskId>`     |
| Vendor              | `EVENT#<eventId>`         | `VENDOR#<vendorId>` |

Task dates are attributes rather than part of the key so a task can be updated directly and regenerated without a scan. Generated plans remain below DynamoDB's 100-action transaction limit.

## Security

- Bcrypt password hashing with cost 12; password hashes never leave the service layer.
- JWTs use HS256, contain only the user ID, and expire after one hour.
- Auth routes are rate-limited; request bodies are capped at 100 KB.
- Zod strictly validates bodies, path parameters, and query strings.
- Resource ownership is checked before every event, task, budget, and vendor operation.
- Helmet, exact-origin CORS, generic login failures, production-safe errors, and redacted structured logs are enabled.
- `.env`, certificates, logs, dependencies, coverage, and build output are excluded from Git.
- App Runner will receive least-privilege DynamoDB permissions through IAM in Phase 5.

## Testing

The default backend suite runs 19 tests covering budget totals and contextual adjustment, short-notice timelines, invalid dates, vendor selection, quote overspend, account access, strict validation, every event mutation, cross-user ownership denial, and DynamoDB command behavior.

Two additional integration tests exercise the production repositories against DynamoDB Local: atomic account uniqueness, complete-plan reconstruction, child updates, stale-write conflicts, replacement cleanup, ownership, and versioned deletion. With DynamoDB Local running on port 8000, execute:

```powershell
$env:RUN_DYNAMODB_INTEGRATION = "true"
$env:DDB_ENDPOINT = "http://localhost:8000"
npm run test --workspace backend -- tests/integration/dynamodb-local.test.ts
```

## Assumptions and Current Limitations

- Monetary input supports up to two decimal places; each event uses one currency from the supported two-decimal ISO 4217 set.
- Vendor entries are planning categories, not a live vendor marketplace.
- Regeneration preserves progress only where category/task/vendor stable IDs still match.
- Production repository semantics are validated with DynamoDB Local; deployment to the AWS-hosted table occurs in Phase 5.
- The frontend account and event workflow arrives in Phase 4; Phase 2 APIs can be exercised with an API client.
- GenAI suggestions are not included until Phase 3.
- The final live demo URL will be added in Phase 5.
