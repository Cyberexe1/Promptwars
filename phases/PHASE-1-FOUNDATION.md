# Phase 1: Foundation and Project Setup

**Goal:** A clean monorepo where the React frontend and Node backend both run locally, talk to each other, and are ready for features. Nothing "smart" yet.

**Vertical chosen:** Event Planning Assistant for weddings, birthdays, and community events.

**Estimated effort:** 10 to 12% of total time.

---

## 1. Outcomes

- Public GitHub repo, single `main` branch, under 10 MB.
- Monorepo with `frontend/` and `backend/`.
- Backend `GET /api/health` returns `200`.
- Frontend renders a page that calls `/api/health` and shows the result.
- Linting, formatting, and a test runner configured in both apps.
- `.env` handling is safe from day one (never committed).

## 2. Tech Stack

| Layer            | Choice                              | Why                                     |
| ---------------- | ----------------------------------- | --------------------------------------- |
| Frontend         | React 19 + Vite + TypeScript        | Fast dev loop, small bundle             |
| Backend          | Node 20 + Express + TypeScript      | Simple, widely understood               |
| Validation       | Zod                                 | One schema for runtime and types        |
| Database         | Amazon DynamoDB                     | Serverless, cheap, no schema migrations |
| GenAI            | Amazon Bedrock                      | Same AWS account, no extra API keys     |
| Backend hosting  | AWS App Runner                      | Container in, HTTPS URL out             |
| Frontend hosting | S3 + CloudFront                     | Cheap static hosting with CDN           |
| Tests            | Vitest (both apps), Supertest (API) | One runner across the repo              |

## 3. Repository Layout

```
Promptwars/
├── README.md
├── .gitignore
├── phases/                 # These phase documents
├── backend/
│   ├── src/
│   │   ├── config/         # env loading and validation
│   │   ├── routes/
│   │   ├── services/       # business logic (budget, timeline, vendors, AI)
│   │   ├── middleware/     # auth, validation, rate limit, errors
│   │   ├── repositories/   # DynamoDB access
│   │   ├── schemas/        # Zod schemas
│   │   └── app.ts / server.ts
│   ├── tests/
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   ├── hooks/
    │   ├── api/            # typed API client
    │   └── main.tsx
    ├── tests/
    ├── .env.example
    └── package.json
```

## 4. Step-by-Step Tasks

### 4.1 Repo and Git

```bash
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/Cyberexe1/Promptwars.git
git push -u origin main
```

Rules to keep all the way through:

- Only the `main` branch. Do not create feature branches.
- Commit small and often, with messages like `feat(backend): add health route`.
- Keep the repo under 10 MB: no `node_modules`, no build output, no large images.

### 4.2 `.gitignore` (create before anything else)

```
node_modules/
dist/
build/
coverage/
.env
.env.*
!.env.example
*.pem
*.log
.DS_Store
```

### 4.3 Backend skeleton

1. `cd backend && npm init -y`
2. Install: `express cors helmet zod dotenv pino`
3. Dev: `typescript tsx vitest supertest @types/express @types/cors @types/node eslint prettier`
4. Create `src/config/env.ts` that parses `process.env` with Zod and **fails fast** on missing values.
5. Create `src/app.ts` (Express app, exported for tests) and `src/server.ts` (listens on `PORT`).
6. Add `GET /api/health` returning `{ status: "ok", time: <ISO> }`.
7. Add a central error handler that never leaks stack traces in production.

### 4.4 Frontend skeleton

1. `npm create vite@latest frontend -- --template react-ts`
2. Add `react-router-dom`.
3. Create `src/api/client.ts` that reads `VITE_API_URL`.
4. Landing page that calls `/api/health` and shows "Backend connected".
5. Add a skip link and semantic landmarks (`header`, `main`, `footer`) from the start.

### 4.5 Environment files

`backend/.env.example` (commit this):

```
NODE_ENV=development
PORT=8080
FRONTEND_ORIGIN=http://localhost:5173

# AWS (local development only)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# DynamoDB
DDB_TABLE_NAME=eventplanner-dev

# Bedrock
BEDROCK_MODEL_ID=

# Auth
JWT_SECRET=
```

Copy to `backend/.env` and fill in your real values. That file is git-ignored.

`frontend/.env.example`:

```
VITE_API_URL=http://localhost:8080
```

> **Security note:** Your AWS keys go only in `backend/.env` locally. Never put them in the frontend, never commit them. For App Runner in Phase 5 we replace them with an IAM instance role so no long-lived keys exist in production.

### 4.6 Quality tooling

- ESLint + Prettier configs in both apps.
- `npm run lint`, `npm run test`, `npm run build` scripts in both apps.
- Optional: root `package.json` with `npm run dev` using `concurrently` to start both.

## 5. Definition of Done

- [ ] `npm run dev` starts backend (8080) and frontend (5173).
- [ ] Landing page shows a successful health check.
- [ ] One passing backend test (`/api/health`).
- [ ] `.env` is not tracked (`git ls-files | grep .env` shows only `.env.example`).
- [ ] Pushed to `main`; repo is public.

## 6. Hand-off to Phase 2

Phase 2 builds the data model and the **deterministic planning engine** (budget, timeline, vendor checklist). This keeps the app useful even if the AI call fails.
