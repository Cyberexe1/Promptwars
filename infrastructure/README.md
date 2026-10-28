# AWS deployment

The production deployment is split into two CloudFormation stacks so durable data and replaceable application compute have different lifecycles.

- `foundation.yml`: retained DynamoDB table and JWT secret, private/versioned S3 bucket, CloudFront OAC/distribution/security headers, immutable ECR repository, least-privilege roles, and an optional cost budget.
- `application.yml`: single-instance App Runner service using an immutable Git-SHA image.
- `../scripts/deploy.ps1`: validates the account/templates first and changes resources only with `-Execute`.
- `../scripts/validate-deployment.ps1`: checks health, CORS, frontend security headers, SPA fallback, and private S3 access.

## Important App Runner availability note

AWS documentation states that App Runner is no longer open to new customers after April 30, 2026. Existing customers can continue using it. The deployment preflight calls App Runner before provisioning, but account eligibility must still be confirmed. If the account is not eligible, use ECS Fargate or Lambda Web Adapter as a backend-hosting alternative; that requires a deliberate architecture change because this challenge plan requested App Runner.

## Prerequisites

1. Configure an AWS CLI profile or session credentials. The script intentionally does **not** load `backend/.env`.
2. Start Docker Desktop and verify `docker info` succeeds.
3. Enable/access the selected Bedrock model in the deployment region.
4. Obtain:
   - `BEDROCK_MODEL_ID`: model or inference-profile ID used by Converse.
   - Exact IAM resource ARN(s). The current template accepts one `BedrockModelArn`; inference profiles may require permissions for both the profile and destination foundation models, so extend the parameter to a list when using one.
5. Review expected App Runner, CloudFront, ECR, S3, DynamoDB, Secrets Manager, Bedrock, logging, and optional AWS Budgets charges.

## Validate without changing resources

```powershell
./scripts/deploy.ps1 `
  -Region us-east-1 `
  -BedrockModelId '<model-id>' `
  -BedrockModelArn '<exact-model-arn>'
```

This checks AWS identity, CloudFormation syntax, App Runner API access, Git cleanliness, and required local tools. It does not create or update resources.

## Deploy after explicit approval

```powershell
./scripts/deploy.ps1 `
  -Region us-east-1 `
  -BedrockModelId '<model-id>' `
  -BedrockModelArn '<exact-model-arn>' `
  -BudgetEmail '<notification-email>' `
  -MonthlyBudgetUsd 25 `
  -Execute
```

Guardrails are optional. If enabled, provide all three values:

```powershell
-BedrockGuardrailId '<id>' `
-BedrockGuardrailVersion '<version>' `
-BedrockGuardrailArn '<arn>'
```

The script performs these ordered operations:

1. Validates identity, templates, App Runner access, and a clean Git tree.
2. Deploys the foundation stack.
3. Builds the workspace-aware non-root backend image from the repository root.
4. Pushes an immutable Git-SHA tag to ECR.
5. Deploys App Runner with the generated JWT secret and runtime IAM role.
6. Builds React with the final App Runner URL.
7. Previews and then performs the S3 synchronization, uploads `index.html` without caching, and invalidates CloudFront.
8. Runs unauthenticated deployment smoke checks.

## Security and operating decisions

- No AWS key or `.env` file enters the image. The SDK uses the App Runner instance role.
- App Runner's ECR pull role and runtime role are separate.
- Runtime DynamoDB permissions match the item actions used inside transactions: `GetItem`, `Query`, `PutItem`, `UpdateItem`, and `DeleteItem` on one table.
- Bedrock is limited to the supplied exact ARN; optional Guardrail access is separately scoped.
- The frontend bucket blocks all public access and is readable only through the distribution's OAC.
- The table, secret, and bucket use retention policies. Deleting their CloudFormation stack will not delete those retained resources.
- App Runner is capped at one instance because AI cache and request quotas are process-local MVP controls. Move them to a shared store before increasing `MaxSize`.
- ECR tags are immutable and old images are capped at ten for rollback.
- The script previews `s3 sync --delete` before executing it, but the execute run still changes the target bucket.

## Rollback

- Backend: redeploy `application.yml` with the previous ECR Git-SHA image identifier.
- Frontend: restore the previous S3 object versions, then invalidate CloudFront.
- Data: do not roll back by deleting the DynamoDB table. Use point-in-time recovery for an actual data incident.
- JWT secret: rotating it logs out all users; do this only as a deliberate security action.

## Cleanup warning

Stack deletion, retained-resource deletion, bucket emptying, ECR removal, and secret force-deletion are destructive and are intentionally not automated. Confirm resource identifiers and backups before manual cleanup.
