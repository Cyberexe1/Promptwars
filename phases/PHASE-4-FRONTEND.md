# Phase 4: Frontend (React) and Accessibility

**Goal:** A clear, responsive, accessible interface where a user can describe their event, see their plan, track progress, and talk to the AI assistant.

**Estimated effort:** 25% of total time.

---

## 1. Outcomes

- Signup/login flow with protected routes.
- Event creation wizard that captures context.
- Dashboard with budget, timeline, vendor checklist, and ideas.
- AI chat panel and refine-with-confirmation flow.
- WCAG-minded, keyboard-friendly, mobile-first design.

## 2. Pages and Routes

| Route               | Page            | Purpose                                                     |
| ------------------- | --------------- | ----------------------------------------------------------- |
| `/`                 | Landing         | What the app does, call to action                           |
| `/signup`, `/login` | Auth            | Forms with inline validation                                |
| `/events`           | My Events       | List, create, delete                                        |
| `/events/new`       | Wizard          | Step-by-step event creation                                 |
| `/events/:id`       | Event Dashboard | Tabs: Overview, Budget, Timeline, Vendors, Ideas, Assistant |

## 3. Component Structure

```
frontend/src/
├── api/                 # typed fetch client, one file per resource
├── auth/                # AuthContext, ProtectedRoute, token storage
├── components/
│   ├── layout/          # Header, Footer, SkipLink, PageShell
│   ├── forms/           # TextField, SelectField, NumberField, ErrorMessage
│   ├── budget/          # BudgetTable, BudgetBar, SpendForm
│   ├── timeline/        # TaskList, TaskItem, PhaseGroup
│   ├── vendors/         # VendorChecklist, VendorCard
│   ├── ideas/           # IdeaCard, IdeaFilters
│   └── chat/            # ChatPanel, MessageList, MessageInput
├── hooks/               # useEvent, useAsync, useDebounce
├── pages/
├── styles/              # tokens (colors, spacing), global CSS
└── main.tsx
```

## 4. Key Screens

### 4.1 Event Wizard

Steps: **Type → Basics (title, date, city) → Guests and Budget → Preferences → Review**.

- Validate each step before moving on.
- Show a live hint, for example "That's about X per guest".
- On submit, show a loading state ("Building your plan…") and then redirect to the dashboard.

### 4.2 Dashboard Tabs

- **Overview:** countdown, progress ring (tasks done), budget used, top 3 upcoming tasks, warnings from the engine.
- **Budget:** table of categories with allocated, spent, remaining; bar visuals plus text values (never color alone); form to log spend.
- **Timeline:** tasks grouped by phase; checkbox to complete; overdue and urgent labelled with text and icon.
- **Vendors:** checklist cards with status dropdown, quote input, and "questions to ask" expandable.
- **Ideas:** category filter, "Generate ideas" button, idea cards, loading and error states, label showing content is AI-generated.
- **Assistant:** chat with suggested prompts ("What should I do this week?").

### 4.3 Refine Flow

User types a request → backend returns proposed changes → UI shows a **before/after diff** → user clicks Apply or Cancel.

## 5. UX States (must exist for every data view)

- Loading (skeletons or a status message)
- Empty (helpful explanation and action)
- Error (plain-language message and Retry)
- AI unavailable (banner: "AI suggestions are unavailable right now. Your plan is still shown.")

## 6. Accessibility Checklist

- [ ] Semantic HTML: `header`, `nav`, `main`, `section`, headings in order.
- [ ] Skip-to-content link.
- [ ] Every input has a visible `<label>`; errors linked using `aria-describedby`; invalid fields use `aria-invalid`.
- [ ] Full keyboard navigation; visible focus outline; logical tab order.
- [ ] Tabs follow the WAI-ARIA tabs pattern (`role="tablist"`, arrow keys).
- [ ] Chat messages area uses `aria-live="polite"` so new replies are announced.
- [ ] Loading states announced via `role="status"`.
- [ ] Color contrast at least 4.5:1 for text; do not rely on color alone for status.
- [ ] Touch targets at least 44×44 px.
- [ ] Respect `prefers-reduced-motion`.
- [ ] Support up to 200% zoom without breaking layout.
- [ ] `lang` attribute set; meaningful page titles per route.
- [ ] Charts/bars have text equivalents.
- [ ] Run **axe** (browser extension or `vitest-axe`) and fix issues.

Note: automated tools catch only a portion of problems. Do a manual pass with keyboard only and a screen reader (NVDA on Windows).

## 7. Security on the Client

- Never place AWS keys or any secret in frontend code or `VITE_` variables.
- Store the JWT in memory plus a refresh strategy, or an `httpOnly` cookie if the backend is changed to set one. If using `localStorage` for simplicity, document the tradeoff in the README.
- Render AI output as **text**, never with `dangerouslySetInnerHTML`.
- Handle `401` globally by redirecting to login.

## 8. Performance

- Route-level code splitting with `React.lazy`.
- Debounce inputs that trigger calls.
- Avoid refetching; cache event data with a small hook or React Query.
- Keep the production bundle small; no heavy UI kits unless needed.

## 9. Testing

- Component tests with Vitest + React Testing Library: wizard validation, task toggle, budget display.
- Accessibility tests with `vitest-axe` on main pages.
- Mock the API layer; do not call the real backend in tests.
- One happy-path end-to-end check (manual or Playwright, optional).

## 10. Definition of Done

- [ ] A new user can sign up, create an event, see the plan, tick tasks, log spend, generate ideas, and chat, from the UI.
- [ ] All loading, empty, error, and AI-unavailable states are handled.
- [ ] Keyboard-only walkthrough succeeds; axe shows no critical issues.
- [ ] Works on mobile width (360 px) and desktop.
- [ ] Pushed to `main`.

## 11. Hand-off to Phase 5

Everything works locally. Phase 5 puts it on AWS, locks down security, and finalizes documentation for submission.
