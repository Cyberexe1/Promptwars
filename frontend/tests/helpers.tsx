import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { App } from '../src/App';
import type { EventPlan, EventRecord } from '../src/api/types';

export const user = {
  id: 'user-1',
  email: 'planner@example.com',
  createdAt: '2026-10-26T00:00:00.000Z',
};

export const baseEvent: EventRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: user.id,
  version: 1,
  type: 'wedding',
  title: 'Garden wedding',
  date: '2099-06-20',
  guestCount: 80,
  totalBudget: 10_000,
  currency: 'USD',
  city: 'Portland',
  indoorOutdoor: 'outdoor',
  preferences: [],
  audience: 'mixed',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
};

export function makePlan(overrides: Partial<EventPlan> = {}): EventPlan {
  return {
    event: baseEvent,
    budget: [
      {
        category: 'venue',
        label: 'Venue',
        allocated: 4000,
        spent: 4500,
        notes: [],
      },
      {
        category: 'food',
        label: 'Food',
        allocated: 6000,
        spent: 1000,
        notes: [],
      },
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Book the venue',
        category: 'venue',
        dueDate: '2099-01-10',
        status: 'completed',
        priority: 1,
        phase: 'Now',
        urgent: false,
        overdue: false,
      },
      {
        id: 'task-2',
        title: 'Hire a photographer',
        category: 'photo',
        dueDate: '2099-02-10',
        status: 'pending',
        priority: 2,
        phase: 'This month',
        urgent: true,
        overdue: true,
      },
    ],
    vendors: [
      {
        id: 'vendor-1',
        category: 'food',
        name: 'Caterer',
        whyNeeded: 'Provides the meal.',
        leadTimeDays: 60,
        suggestedBudget: 5000,
        questions: ['Can you label allergens?'],
        status: 'to-research',
      },
    ],
    warnings: ['Venue spending is above its allocation.'],
    ...overrides,
  };
}

export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const apiError = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
) =>
  json({ error: { code, message, ...(details ? { details } : {}) } }, status);

export function authenticated() {
  localStorage.setItem(
    'gatherly.auth',
    JSON.stringify({ user, token: 'test-token' }),
  );
}

export interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}
export type Responder = (call: Call) => unknown;
/** [method, path pattern, responder]. Earlier entries win over defaults. */
export type Route = [string, RegExp | string, Responder];

/**
 * Installs a fetch mock. Overrides are matched first; unmatched requests fall
 * back to realistic defaults backed by the mutable `state`.
 */
export function mockApi(overrides: Route[] = [], initial?: Partial<EventPlan>) {
  const state = { plan: makePlan(initial), events: [] as EventRecord[] };
  const calls: Call[] = [];
  const defaults: Route[] = [
    [
      'GET',
      '/api/health',
      () => ({ status: 'ok', time: new Date().toISOString() }),
    ],
    [
      'POST',
      /^\/api\/auth\/(login|signup)$/,
      () => ({ user, token: 'test-token' }),
    ],
    ['GET', '/api/events', () => ({ events: state.events })],
    ['POST', '/api/events', () => json(state.plan, 201)],
    ['GET', /^\/api\/events\/[^/]+$/, () => state.plan],
    [
      'DELETE',
      /^\/api\/events\/[^/]+$/,
      () => new Response(null, { status: 204 }),
    ],
    [
      'PATCH',
      /\/tasks\//,
      ({ body }) => ({
        task: { ...state.plan.tasks[1], status: body?.status },
      }),
    ],
    [
      'PATCH',
      /\/budget\//,
      ({ body }) => ({
        budget: { ...state.plan.budget[0], spent: body?.spent },
        warning: null,
      }),
    ],
    [
      'PATCH',
      /\/vendors\//,
      ({ body }) => ({
        vendor: { ...state.plan.vendors[0], ...body },
        warnings: [],
      }),
    ],
    [
      'POST',
      /\/ai\/ideas$/,
      () => ({
        ideas: [
          {
            title: 'Lantern walk',
            description: 'Guests carry paper lanterns.',
            estimatedCost: 120,
            whyItFits: 'Fits an outdoor evening.',
          },
        ],
        aiAvailable: true,
      }),
    ],
    [
      'POST',
      /\/ai\/chat$/,
      () => ({ reply: 'Book the photographer.', aiAvailable: true }),
    ],
    [
      'POST',
      /\/refinements\/apply$/,
      () => ({
        ...state.plan,
        event: { ...state.plan.event, version: state.plan.event.version + 1 },
      }),
    ],
  ];
  const matches = (route: Route, call: Call) =>
    route[0] === call.method &&
    (typeof route[1] === 'string'
      ? route[1] === call.path
      : route[1].test(call.path));

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined,
    };
    calls.push(call);
    const route = [...overrides, ...defaults].find((entry) =>
      matches(entry, call),
    );
    if (!route) return apiError(404, 'NOT_FOUND', 'Unexpected mock request');
    const result = route[2](call);
    return result instanceof Response ? result : json(result);
  });
  return { state, calls };
}

export function renderAt(path: string, options: { signedIn?: boolean } = {}) {
  if (options.signedIn ?? true) authenticated();
  window.history.replaceState({}, '', path);
  return render(<App />);
}

export const eventPath = (tab?: string) =>
  `/events/${baseEvent.id}${tab ? `?tab=${tab}` : ''}`;
