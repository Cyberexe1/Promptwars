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

## HTTP security headers

| Header                                            | Frontend (CloudFront)                                                                                                  | API (Express + Helmet)                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `Content-Security-Policy`                         | `default-src 'self'`; scripts and styles from self only; `connect-src` limited to App Runner; `frame-ancestors 'none'` | `default-src 'none'; frame-ancestors 'none'` (a JSON API loads nothing) |
| `Strict-Transport-Security`                       | 1 year, includeSubDomains                                                                                              | 1 year, includeSubDomains                                               |
| `X-Content-Type-Options`                          | `nosniff`                                                                                                              | `nosniff`                                                               |
| `X-Frame-Options`                                 | `DENY`                                                                                                                 | `DENY`                                                                  |
| `Referrer-Policy`                                 | `strict-origin-when-cross-origin`                                                                                      | `no-referrer`                                                           |
| `Permissions-Policy`                              | camera, microphone, geolocation, payment, usb disabled                                                                 | n/a                                                                     |
| `Cross-Origin-Opener-Policy` / `-Resource-Policy` | `same-origin`                                                                                                          | `same-origin`                                                           |
| `X-XSS-Protection`                                | `0` (the legacy auditor is disabled because it can introduce vulnerabilities)                                          | `0`                                                                     |
| `Cache-Control`                                   | assets immutable; `index.html` revalidated                                                                             | `private, no-cache`; auth routes `no-store`                             |

`scripts/validate-deployment.ps1` fails a deployment if any required frontend header is missing, and `backend/tests/health.test.ts` asserts the API headers.

## Automated checks

- **Lint:** ESLint with `typescript-eslint`, `eslint-plugin-security` (backend), `eslint-plugin-jsx-a11y` strict (frontend), and `react-hooks`. Every suppression carries a written reason.
- **Dependencies:** `npm audit --audit-level=high` runs in CI and before each release; the container image is scanned by ECR on push.
- **CI:** `.github/workflows/ci.yml` runs lint, formatting, audit, tests with coverage thresholds, the build, a real-browser accessibility audit, and a browser end-to-end test on every push.
