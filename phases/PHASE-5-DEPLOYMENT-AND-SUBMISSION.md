# Phase 5: AWS Deployment, Hardening, and Submission

**Goal:** Deploy the API to AWS App Runner and the React application to private S3 + CloudFront, then complete live security, accessibility, and submission checks.

**Status:** Complete and live in `us-east-1`.

- Frontend: `https://d2tqgtztkwfw4j.cloudfront.net`
- API: `https://uvpwnzxmbe.us-east-1.awsapprunner.com`
- Deployed image: `961308088417.dkr.ecr.us-east-1.amazonaws.com/promptwars-api:5d9b7ebae98a`

---

## 1. Target Architecture

```text
User ──> CloudFront ──OAC──> private, versioned S3 bucket
  |
  `──> App Runner (non-root Node container from immutable ECR tag)
              |──> DynamoDB (retained, encrypted, PITR)
              |──> Bedrock Converse (optional Guardrail)
              `──> Secrets Manager (generated JWT secret)
```

App Runner is capped at one instance while the AI cache and quota store are process-local. Increase capacity only after moving those controls to shared storage.

## 2. Implemented Artifacts

| Artifact                          | Purpose                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `backend/Dockerfile`              | Workspace-aware multi-stage build pinned to Node 22.23.4 on Alpine 3.23 via public ECR; non-root runtime and health check |
| `.dockerignore`                   | Excludes Git, dependencies, builds, logs, `.env`, and local/review files from image context                               |
| `infrastructure/foundation.yml`   | Retained DynamoDB/secret/S3, ECR, CodeBuild, IAM roles, CloudFront OAC/security/SPA behavior, optional budget             |
| `infrastructure/application.yml`  | App Runner service, secret mapping, health check, exact runtime settings, single-instance scaling                         |
| `infrastructure/README.md`        | Deployment, rollback, security, and cleanup runbook                                                                       |
| `scripts/deploy.ps1`              | Safe no-change preflight by default; provisioning requires `-Execute`                                                     |
| `scripts/validate-deployment.ps1` | Live health, CORS, headers, SPA route, and private-origin checks                                                          |
| `SECURITY.md`                     | Vulnerability reporting and secret/security policy                                                                        |

## 3. Credential Rules

- `backend/.env` is for local development only and must remain ignored by both Git and Docker.
- The deployment script intentionally does not read that file. Configure an AWS CLI profile/session separately.
- Production receives no `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` variables.
- App Runner uses separate ECR pull and runtime roles.
- Secrets Manager generates and supplies `JWT_SECRET`; the value never enters CloudFormation output, source, image, or logs.
- Rotating the JWT secret logs out every user and must be deliberate.

## 4. Least-Privilege Runtime Access

The runtime role is scoped to:

- DynamoDB `GetItem`, `Query`, `PutItem`, `UpdateItem`, and `DeleteItem` on one table. These item actions authorize the members of `TransactWriteItems` calls.
- Bedrock `InvokeModel` on the supplied exact model/profile ARN.
- Optional Bedrock `ApplyGuardrail` on one supplied Guardrail ARN.
- Secrets Manager `GetSecretValue` on one JWT secret.

The ECR access role uses AWS's App Runner ECR pull policy and is never attached to running application code.

## 5. Safe Deployment Sequence

1. Configure a valid AWS CLI profile/session and start Docker Desktop.
2. Confirm account/region, App Runner eligibility, Bedrock model access, exact IAM ARNs, expected costs, and budget alerts.
3. Commit all deployment files so the image can use an immutable Git SHA tag.
4. Run preflight **without** `-Execute`:

```powershell
./scripts/deploy.ps1 `
  -Region us-east-1 `
  -BedrockModelId '<model-or-inference-profile-id>' `
  -BedrockModelArn '<exact-model-or-profile-arn>'
```

5. Review the two CloudFormation templates and all resources they create.
6. After explicit approval, rerun with `-Execute`, optionally adding budget email/amount and all three Guardrail arguments.
7. Run the full authenticated E2E checklist and inspect CloudWatch logs/costs.
8. Add the live CloudFront/API URLs to the root README, commit, push, and perform submission checks once before using an attempt.

The execute path previews `aws s3 sync --delete` before applying it, builds React with the final App Runner URL, rejects a build containing `localhost:8080`, uploads hashed assets with immutable caching, uploads `index.html` without caching, invalidates CloudFront, and runs the deployment validator.

## 6. Security Hardening Status

- [x] `.env`, keys, dependencies, builds, coverage, and logs excluded from Git.
- [x] `.env` excluded from root Docker context.
- [x] Pinned non-root container definition.
- [x] Helmet, exact-origin CORS, 100 KB request limit, and production-safe errors.
- [x] Auth and aggregate per-user AI rate limits.
- [x] Strict Zod validation and owner checks.
- [x] Prompt isolation, output/domain validation, time/token bounds, fallback, optional Guardrail.
- [x] Retention for production DynamoDB, JWT secret, and versioned frontend bucket.
- [x] Private S3 origin with CloudFront OAC.
- [x] CloudFront CSP, HSTS, frame, content-type, referrer, and permissions headers.
- [x] ECR scan-on-push, immutable tags, and lifecycle limit.
- [x] Optional 80%-forecast/100%-actual monthly cost notifications.
- [x] CloudFormation passes pinned `cfn-lint` 1.58.0.
- [x] AWS-side CloudFormation validation and stack deployment succeeded.
- [x] CodeBuild image build and ECR scan completed with zero findings.
- [x] Live HTTPS, exact/blocked CORS, security headers, SPA fallback, and private S3-origin validation passed.
- [x] CloudWatch application logs were reviewed and contain only metadata-level AI request records.

## 7. Quality and Accessibility Status

- [x] 70 backend tests pass; 2 additional DynamoDB Local tests previously passed and remain opt-in.
- [x] 8 frontend tests pass using mocked HTTP.
- [x] Axe checks cover landing, auth, wizard, dashboard, and refinement states.
- [x] Backend/frontend lint, builds, formatting, and high-severity dependency audit pass.
- [x] Route-level splitting; main frontend bundle approximately 84.7 KB gzip.
- [x] Authenticated deployed E2E passed for wedding, birthday, and community plans; synthetic records were cleaned.
- [x] Local and deployed Bedrock return `aiAvailable: true` with five validated `amazon.nova-lite-v1:0` ideas; deterministic fallback is covered by automated tests.
- [ ] Keyboard-only deployed walkthrough at desktop and 360px.
- [ ] Manual NVDA screen-reader walkthrough and 200% zoom check.

## 8. Rollback and Cleanup

- Backend rollback: redeploy `application.yml` with the previous ECR Git-SHA image.
- Frontend rollback: restore previous S3 object versions and invalidate CloudFront.
- Data recovery: use DynamoDB point-in-time recovery; never solve an app rollback by deleting data.
- Foundation deletion retains DynamoDB, secret, and S3 resources.
- Destructive cleanup of stacks, retained resources, bucket objects, ECR images, or secrets is intentionally not automated and requires separate confirmation.

## 9. Submission Checklist

- [x] Public repository URL exists.
- [x] Only `main` exists locally and remotely.
- [x] Git object size remains far below 10 MB.
- [x] Only `.env.example` files are tracked.
- [x] README documents vertical, architecture, setup, behavior, assumptions, security, accessibility, testing, and deployment.
- [x] Full Git-history secret scan repeated immediately before final submission preparation.
- [x] Live frontend and API URLs added to README.
- [x] Unauthenticated public repository/site/API checks passed.
- [x] Final deployment documentation commit pushed and local/remote SHA matched.
- [ ] Submission performed only after a complete review, preserving the three-attempt limit.

## 10. Remaining Human Checks

No technical deployment blocker remains. Before challenge submission, complete a manual keyboard/NVDA/200%-zoom walkthrough and review the live AWS bill. Remove the temporary `AdministratorAccess` policy from the deployment IAM user after final documentation is pushed.
