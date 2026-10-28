# Security policy

## Reporting a vulnerability

Do not open a public issue containing credentials, private event data, or an exploitable vulnerability. Contact the repository owner privately through their GitHub profile and include the affected component, reproduction steps using synthetic data, impact, and a suggested mitigation if available.

## Secret handling

- Never commit `.env`, AWS access keys, JWT secrets, tokens, certificates, or real attendee/vendor data.
- Local AWS credentials belong only in `backend/.env` or the standard AWS credential chain.
- Production uses an App Runner IAM instance role and a Secrets Manager JWT secret.
- If a credential is exposed, revoke or rotate it immediately before cleaning Git history.

## Application controls

The API uses strict Zod validation, owner-scoped resources, bcrypt password hashing, expiring JWTs, rate limits, exact-origin CORS, Helmet, bounded request bodies, optimistic concurrency, safe errors, and redacted logs. Bedrock input is delimited and sanitized; model output is schema/domain validated with optional Guardrails and deterministic fallback.

The frontend currently persists its one-hour bearer token in `localStorage`. This MVP trade-off enables reload persistence but increases XSS impact. AI output is rendered as text and no `dangerouslySetInnerHTML` path is used. A hardened production evolution should use short-lived memory-only access tokens and rotating secure, SameSite, `httpOnly` refresh cookies.
