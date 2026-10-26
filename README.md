# Promptwars: GenAI Event Planning Assistant

A planning assistant for **weddings, birthdays, and community events**. It turns event context—type, date, guests, budget, city, and preferences—into a practical budget, dated timeline, vendor checklist, and personalized ideas.

**Stack:** React 19 + Vite · Node.js + Express · Amazon DynamoDB · Amazon Bedrock · AWS App Runner · S3 + CloudFront

## Project Status

Phase 1 is implemented: the TypeScript monorepo, secured Express foundation, health endpoint, responsive React landing page, typed API client, environment validation, linting, formatting, tests, and production builds are ready.

| Phase                               | Status   | Document                                               |
| ----------------------------------- | -------- | ------------------------------------------------------ |
| 1. Foundation and project setup     | Complete | [Phase 1](phases/PHASE-1-FOUNDATION.md)                |
| 2. Backend core and planning engine | Planned  | [Phase 2](phases/PHASE-2-BACKEND-CORE.md)              |
| 3. GenAI integration with Bedrock   | Planned  | [Phase 3](phases/PHASE-3-GENAI-INTEGRATION.md)         |
| 4. Frontend and accessibility       | Planned  | [Phase 4](phases/PHASE-4-FRONTEND.md)                  |
| 5. AWS deployment and submission    | Planned  | [Phase 5](phases/PHASE-5-DEPLOYMENT-AND-SUBMISSION.md) |

## Approach

- **Deterministic engine first:** budget, timeline, and vendor checklist calculations will come from tested rules based on user context.
- **AI as enhancement:** Bedrock will add personalized ideas, plan refinement, and chat. Model output will be schema-validated, and the core app will remain usable if AI is unavailable.
- **Secure and accessible by design:** strict input validation, authentication, rate limits, least-privilege IAM, semantic HTML, keyboard support, and visible status messaging.

## Phase 1 Architecture

```text
React browser app (localhost:5173)
             |
             | GET /api/health
             v
Express API (localhost:8080)
```

The backend applies Helmet security headers, origin-restricted CORS, a 100 KB JSON body limit, centralized error handling, and Zod-validated environment configuration. The frontend uses a typed API client and presents checking, connected, unavailable, and retry states.

## Repository Layout

```text
.
├── backend/        Express API, configuration, middleware, routes, tests
├── frontend/       React application, API client, styles, component tests
├── phases/         Five implementation guides
├── package.json    npm workspaces and shared commands
└── README.md
```

## Local Setup

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm 10+
- Git

### Install and configure

```powershell
npm install
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

AWS values may remain empty during Phase 1. Real AWS keys must only go in `backend/.env`; that file is ignored by both Git and Docker. Never place secrets in the frontend or in variables prefixed with `VITE_`.

### Run locally

```powershell
npm run dev
```

Open `http://localhost:5173`. The page reports **Backend connected** when the API at `http://localhost:8080/api/health` is available.

### Quality commands

```powershell
npm run lint
npm run test
npm run build
npm run format:check
```

## Current API

| Method | Path          | Response                                        |
| ------ | ------------- | ----------------------------------------------- |
| `GET`  | `/api/health` | `{ "status": "ok", "time": "<ISO timestamp>" }` |

## Security Notes

- `.env`, certificates, logs, dependencies, coverage, and build output are excluded from Git.
- Dependencies and development tools are pinned exactly in `package-lock.json`.
- Production errors do not expose internal messages or stack traces.
- App Runner will use an IAM role rather than long-lived AWS access keys in Phase 5.

## Assumptions

- Phase 1 intentionally contains no account, event, database, or GenAI behavior; these begin in Phases 2 and 3.
- Local ports are `5173` for the frontend and `8080` for the API.
- The final live demo URL and complete deployment instructions will be added in Phase 5.
