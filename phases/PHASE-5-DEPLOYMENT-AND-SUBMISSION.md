# Phase 5: AWS Deployment, Hardening, and Submission

**Goal:** Deploy the backend to AWS App Runner, the frontend to S3 + CloudFront, use DynamoDB and Bedrock in production, harden security, complete testing, and prepare the final README for evaluation.

**Estimated effort:** 15 to 20% of total time.

---

## 1. Target Architecture

```
User ──► CloudFront ──► S3 (React static build)
  │
  └───► App Runner (Node API, container from ECR)
              ├──► DynamoDB (data)
              ├──► Bedrock (GenAI)
              └──► Secrets Manager (JWT secret)
```

| Component        | AWS Service                                          |
| ---------------- | ---------------------------------------------------- |
| Frontend hosting | S3 (private) + CloudFront with Origin Access Control |
| Backend hosting  | App Runner (from ECR image)                          |
| Database         | DynamoDB (on-demand capacity)                        |
| GenAI            | Bedrock                                              |
| Secrets          | Secrets Manager or SSM Parameter Store               |
| Logs/metrics     | CloudWatch                                           |

## 2. A Note on Your AWS Keys

You plan to put AWS keys in the backend `.env`. That is fine for **local development**. Keep in mind:

- `.env` must stay git-ignored. A key pushed to a public repo gets scraped within minutes.
- `.env` is not part of the Docker image either: add `.env` to `.dockerignore`.
- **In App Runner, do not ship access keys.** Attach an **instance role** with the needed permissions. The AWS SDK picks up credentials automatically, and the code works unchanged because it only reads `AWS_ACCESS_KEY_ID` when present.
- For app secrets like `JWT_SECRET`, use App Runner's Secrets Manager integration instead of plain environment values.
- If a key is ever committed, **rotate it immediately**; deleting the commit is not enough.

## 3. Backend Deployment (App Runner)

### 3.1 Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

Also create `backend/.dockerignore` with `node_modules`, `.env`, `.env.*`, `tests`, `coverage`.

### 3.2 Steps

1. **DynamoDB:** create table `eventplanner-prod` (PK/SK strings, on-demand, point-in-time recovery on).
2. **ECR:** create repository `eventplanner-api`; build, tag, and push the image.
3. **IAM instance role** for App Runner with least privilege:
   - DynamoDB: `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query` on the table ARN only.
   - Bedrock: `InvokeModel`/`Converse` on the chosen model ARN only.
   - Secrets Manager: `GetSecretValue` on the JWT secret only.
4. **App Runner service:**
   - Source: ECR image.
   - Port `8080`.
   - Health check path `/api/health`.
   - Env vars: `NODE_ENV=production`, `AWS_REGION`, `DDB_TABLE_NAME`, `BEDROCK_MODEL_ID`, `FRONTEND_ORIGIN` (the CloudFront URL).
   - Secret: `JWT_SECRET` from Secrets Manager.
   - Attach the instance role.
5. Test: `curl https://<apprunner-url>/api/health`.

## 4. Frontend Deployment (S3 + CloudFront)

1. Set `VITE_API_URL` to the App Runner URL and run `npm run build` in `frontend/`.
2. Create a private S3 bucket (Block Public Access ON).
3. Create a CloudFront distribution:
   - Origin: the S3 bucket with **Origin Access Control**.
   - Default root object: `index.html`.
   - Custom error responses: `403` and `404` → `/index.html` with `200` (for React Router).
   - Viewer protocol: redirect HTTP to HTTPS.
   - Attach a response headers policy (HSTS, `X-Content-Type-Options`, `X-Frame-Options`, a CSP).
4. Upload build output:

```bash
aws s3 sync dist/ s3://<bucket-name> --delete
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

5. Update the backend `FRONTEND_ORIGIN` to the CloudFront domain so CORS matches exactly.

## 5. Security Hardening Checklist

- [ ] No secrets in git history (`git log -p | grep -i "AKIA"` returns nothing).
- [ ] `.env` ignored by git and Docker.
- [ ] HTTPS everywhere; CORS locked to the CloudFront origin.
- [ ] Helmet enabled; request body size limited.
- [ ] Rate limits on auth and AI routes.
- [ ] All inputs validated with Zod.
- [ ] Ownership checks on every event route.
- [ ] Least-privilege IAM roles (no `*` resources).
- [ ] `npm audit` reviewed; dependencies pinned via lockfile.
- [ ] Error responses do not expose stack traces.
- [ ] Logs contain no passwords, tokens, or keys.
- [ ] Consider an AWS Budget alert to guard against Bedrock cost surprises.

## 6. Testing and Quality Gate

Run before submission:

```bash
# backend
npm run lint && npm run test && npm run build
# frontend
npm run lint && npm run test && npm run build
```

Optional CI: GitHub Actions workflow running the above on push to `main` (still a single branch). Do **not** store AWS credentials in the workflow unless using GitHub OIDC.

Manual end-to-end pass on the deployed URL:

1. Sign up and log in.
2. Create a wedding, a birthday, and a community event; check the plans differ sensibly.
3. Try a tiny budget and a very close date; check the warnings appear.
4. Generate ideas, refine, and chat.
5. Confirm the app works with AI disabled (simulate by an invalid model ID).
6. Keyboard-only run through the main flow.

## 7. Final README (root `README.md`) Must Contain

1. **Chosen vertical:** Event Planning Assistant (weddings, birthdays, community events).
2. **Approach and logic:** deterministic engine first, AI layer on top, why.
3. **How it works:** architecture diagram, request flow, feature list.
4. **Tech stack and AWS services.**
5. **Setup:** prerequisites, install, `.env.example` explanation, run locally, run tests.
6. **Deployment summary:** App Runner, S3 + CloudFront, DynamoDB, Bedrock.
7. **Security measures:** auth, validation, rate limiting, prompt-injection defenses, IAM least privilege.
8. **Accessibility measures:** list from Phase 4.
9. **Testing:** what is covered and how to run it.
10. **Assumptions and limitations:** single currency per event, vendors are checklist categories (no real vendor database), AI suggestions are estimates, etc.
11. **Live demo link** (CloudFront URL).

## 8. Submission Checklist (Hard Rules)

- [ ] Repository is **public**.
- [ ] Only **one branch** (`main`). Verify: `git branch -a`.
- [ ] Repo size **under 10 MB**. Verify: check the repo folder size without `node_modules`; make sure `node_modules`, `dist`, and large assets are ignored.
- [ ] No `.env` or keys committed.
- [ ] README complete (section 7).
- [ ] Final push done: `git push origin main`.
- [ ] Open the GitHub URL in a private browser window to confirm it is visible without login.
- [ ] You have **at most 3 attempts**; do a full review before submitting the first one.

## 9. Evaluation Mapping

| Focus area        | Where it is covered                                       |
| ----------------- | --------------------------------------------------------- |
| Code quality      | Phase 1 structure, pure-function engine in Phase 2        |
| Security          | Phases 2, 3, 5 (auth, validation, prompt safety, IAM)     |
| Efficiency        | Caching, on-demand DynamoDB, code splitting, token limits |
| Testing           | Unit, API, component, accessibility tests                 |
| Accessibility     | Phase 4 checklist                                         |
| Problem alignment | Budget + timeline + vendor checklist + personalized ideas |

## 10. Definition of Done

- [ ] Live CloudFront URL works against the live App Runner API.
- [ ] Security checklist complete.
- [ ] All tests green; builds pass.
- [ ] README finalized; submission checklist complete.
