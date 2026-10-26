# Phase 2: Backend Core and Planning Engine

**Goal:** Build the data layer, auth, and a **rule-based planning engine** that generates budgets, timelines, and vendor checklists from user context. This is the logical decision-making core and it works without any AI.

**Estimated effort:** 25 to 30% of total time.

---

## 1. Outcomes

- User signup and login with secure password handling.
- CRUD for events, stored in DynamoDB.
- Planning engine that adapts to event type, guest count, budget, date, and location.
- Fully unit-tested pure functions for budget, timeline, and vendor logic.

## 2. Data Model (DynamoDB single table)

Table: `eventplanner-<env>`, PK/SK strings, one GSI.

| Entity      | PK                | SK                        | Notes                                                |
| ----------- | ----------------- | ------------------------- | ---------------------------------------------------- |
| User        | `USER#<userId>`   | `PROFILE`                 | email, passwordHash, createdAt                       |
| User lookup | `EMAIL#<email>`   | `USER`                    | for login                                            |
| Event       | `USER#<userId>`   | `EVENT#<eventId>`         | type, title, date, guests, budget, city, preferences |
| Budget item | `EVENT#<eventId>` | `BUDGET#<category>`       | allocated, spent                                     |
| Task        | `EVENT#<eventId>` | `TASK#<dueDate>#<taskId>` | title, status, category, dueDate                     |
| Vendor      | `EVENT#<eventId>` | `VENDOR#<vendorId>`       | category, name, status, quote                        |

Zod schemas live in `backend/src/schemas/` and are the single source of truth for request validation and TypeScript types.

### Event input (core context)

```ts
{
  type: "wedding" | "birthday" | "community",
  title: string,
  date: ISODate,           // must be in the future
  guestCount: number,      // 1..2000
  totalBudget: number,     // > 0, in a single currency
  currency: string,        // ISO 4217
  city: string,
  indoorOutdoor: "indoor" | "outdoor" | "either",
  preferences: string[],   // e.g. "vegetarian", "eco-friendly", "kid-friendly"
  audience?: "adults" | "mixed" | "kids"
}
```

## 3. API Endpoints

| Method | Path                                | Purpose                               |
| ------ | ----------------------------------- | ------------------------------------- |
| POST   | `/api/auth/signup`                  | Create account                        |
| POST   | `/api/auth/login`                   | Returns JWT                           |
| GET    | `/api/events`                       | List my events                        |
| POST   | `/api/events`                       | Create event and generate base plan   |
| GET    | `/api/events/:id`                   | Full plan                             |
| PATCH  | `/api/events/:id`                   | Update context, optionally regenerate |
| DELETE | `/api/events/:id`                   | Delete event                          |
| PATCH  | `/api/events/:id/tasks/:taskId`     | Toggle/update task                    |
| PATCH  | `/api/events/:id/budget/:category`  | Record spending                       |
| PATCH  | `/api/events/:id/vendors/:vendorId` | Update vendor status/quote            |

## 4. Planning Engine (the "smart" logic)

All in `backend/src/services/planning/` as **pure functions** (input in, output out, no I/O) so they are trivial to test.

### 4.1 Budget allocator

- Per-type percentage templates, for example:
  - Wedding: venue 35, catering 30, photography 10, attire 8, decor 8, music 5, misc 4
  - Birthday: venue 25, food 35, entertainment 15, decor 10, cake 8, misc 7
  - Community: venue 25, food 30, AV/equipment 15, marketing 10, permits/insurance 10, volunteers 5, contingency 5
- Adjustments based on context:
  - `guestCount` high: shift weight toward catering and venue.
  - `outdoor`: add weather contingency and tent/rental line.
  - `audience = kids`: add entertainment, reduce alcohol/bar.
  - Preferences like `eco-friendly` or `vegetarian` add notes or reweight categories.
- Always reserve a **contingency of 5 to 10%**.
- Rounding must sum exactly to `totalBudget` (assign remainder to contingency).
- **Feasibility check:** compute cost per guest; if below a per-type minimum, return warnings such as "Budget per guest is low for a sit-down dinner. Consider a smaller guest list or buffet."

### 4.2 Timeline generator

- Templates are lists of `{ title, category, offsetDays }` where offset is days before the event.
- Wedding example: venue booked at T-270, photographer T-240, invites T-60, final headcount T-14.
- Compress or drop tasks when time is short:
  - Compute `daysUntilEvent`.
  - If less than a template's lead time, mark tasks `urgent` and reorder by priority rather than failing.
  - Warn when the date is unrealistically close (for example, a wedding in 3 weeks).
- Output tasks sorted by due date, grouped into phases ("Now", "This month", "Final weeks", "Event week").

### 4.3 Vendor checklist

- Category list chosen by event type, then filtered by context (no bar vendor for kids' parties, add permits for public community events).
- Each item: category, why it is needed, lead-time recommendation, suggested budget slice (links back to the budget allocator), and questions to ask the vendor.
- Status flow: `to-research` → `contacted` → `quoted` → `booked`.

### 4.4 Cross-checks

- Sum of vendor quotes versus category allocation, flag overspend.
- Task due dates before today are flagged `overdue`.

## 5. Security Requirements

- Passwords hashed with `argon2` (or `bcrypt` cost 12+).
- JWT access tokens, short expiry (for example 1 hour), secret from env.
- Ownership check on **every** event route: `event.userId === req.user.id`.
- Zod validation on all bodies, params, and query strings; reject unknown keys.
- `helmet`, strict CORS limited to `FRONTEND_ORIGIN`, body size limit (for example 100 kb).
- `express-rate-limit` on auth routes.
- Generic error messages on login failure (no user enumeration).
- Structured logs with `pino`; never log passwords, tokens, or AWS keys.

## 6. Testing

- Unit tests for budget allocator: sums equal total, contingency present, edge cases (tiny budget, 2000 guests).
- Unit tests for timeline: short-notice events, past dates rejected.
- Unit tests for vendor selection by type and preference.
- API tests with Supertest: auth flow, ownership enforcement (user A cannot read user B's event), validation errors return `400`.
- Use DynamoDB Local or a mocked repository interface so tests do not need AWS.

## 7. Definition of Done

- [ ] All endpoints above work against DynamoDB.
- [ ] Creating an event returns a complete plan (budget, tasks, vendors) with no AI involved.
- [ ] Engine functions have meaningful test coverage.
- [ ] Ownership and validation tests pass.
- [ ] Pushed to `main`.

## 8. Hand-off to Phase 3

The engine produces a solid baseline. Phase 3 layers Bedrock on top to add personalization, creative ideas, and a conversational assistant.
