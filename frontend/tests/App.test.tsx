import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type { EventPlan } from '../src/api/types';

const user = {
  id: 'user-1',
  email: 'planner@example.com',
  createdAt: '2026-10-26T00:00:00.000Z',
};

const plan: EventPlan = {
  event: {
    id: '11111111-1111-4111-8111-111111111111',
    userId: user.id,
    version: 1,
    type: 'birthday',
    title: 'Garden birthday',
    date: '2099-06-20',
    guestCount: 20,
    totalBudget: 1_000,
    currency: 'USD',
    city: 'Portland',
    indoorOutdoor: 'outdoor',
    preferences: ['low waste'],
    audience: 'mixed',
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
  budget: [
    {
      category: 'venue',
      label: 'Venue',
      allocated: 100,
      spent: 120,
      notes: [],
    },
    {
      category: 'food',
      label: 'Food',
      allocated: 900,
      spent: 100,
      notes: [],
    },
  ],
  tasks: [
    {
      id: 'task-birthday-confirm',
      title: 'Confirm guest count',
      category: 'food',
      dueDate: '2099-06-01',
      status: 'pending',
      priority: 1,
      phase: 'Final weeks',
      urgent: true,
      overdue: false,
    },
  ],
  vendors: [
    {
      id: 'vendor-birthday-food',
      category: 'food',
      name: 'Local caterer',
      whyNeeded: 'Provides the party food.',
      leadTimeDays: 30,
      suggestedBudget: 500,
      questions: ['Can you label allergens?'],
      status: 'to-research',
    },
  ],
  warnings: ['Venue spending is above its allocation.'],
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authenticated() {
  localStorage.setItem(
    'gatherly.auth',
    JSON.stringify({ user, token: 'test-token' }),
  );
}

function installApiMock() {
  const calls: Array<{
    path: string;
    method: string;
    body?: unknown;
    authorization: string | null;
  }> = [];
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({
        path: url.pathname,
        method,
        body,
        authorization: new Headers(init?.headers).get('Authorization'),
      });

      if (url.pathname === '/api/health') {
        return json({ status: 'ok', time: new Date().toISOString() });
      }
      if (url.pathname === '/api/auth/login') {
        return json({ user, token: 'test-token' });
      }
      if (url.pathname === '/api/events' && method === 'GET') {
        return json({ events: [] });
      }
      if (url.pathname === '/api/events' && method === 'POST') {
        return json(plan, 201);
      }
      if (url.pathname === `/api/events/${plan.event.id}` && method === 'GET') {
        return json(plan);
      }
      if (url.pathname.includes('/tasks/') && method === 'PATCH') {
        return json({ task: { ...plan.tasks[0], status: body.status } });
      }
      if (url.pathname.includes('/budget/') && method === 'PATCH') {
        return json({
          budget: { ...plan.budget[0], spent: body.spent },
          warning: null,
        });
      }
      if (url.pathname.endsWith('/ai/ideas')) {
        return json({
          ideas: [
            {
              title: 'Reuse table decorations',
              description: 'Borrow jars and greenery.',
              estimatedCost: 0,
              whyItFits: 'It supports the low-waste preference.',
            },
          ],
          aiAvailable: false,
        });
      }
      if (url.pathname.endsWith('/ai/chat')) {
        return json({
          reply: 'Confirm the caterer this week.',
          aiAvailable: false,
        });
      }
      if (url.pathname.endsWith('/ai/refine')) {
        return json({
          proposedChanges: {
            budgetShifts: [
              { category: 'food', delta: -10, reason: 'Use a buffet.' },
              { category: 'venue', delta: 10, reason: 'Cover equipment.' },
            ],
            newTasks: [
              {
                title: 'Confirm buffet menu',
                category: 'food',
                dueDate: '2099-05-20',
                reason: 'The menu changed.',
              },
            ],
          },
          baseVersion: 1,
          aiAvailable: true,
        });
      }
      if (url.pathname.endsWith('/refinements/apply')) {
        return json({
          ...plan,
          event: { ...plan.event, version: 2 },
        });
      }
      return json(
        { error: { code: 'NOT_FOUND', message: 'Unexpected mock request' } },
        404,
      );
    });
  return { fetchMock, calls };
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Phase 4 application', () => {
  it('renders an accessible landing page and reports backend health', async () => {
    installApiMock();
    const { container } = render(<App />);

    expect(
      await screen.findByRole('heading', {
        name: 'Turn your event idea into a plan you can use.',
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Backend connected')).toBeInTheDocument();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it('redirects protected routes to login and restores the intended route', async () => {
    installApiMock();
    window.history.replaceState({}, '', '/events');
    const { container } = render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Log in' }),
    ).toBeInTheDocument();
    expect((await axe(container)).violations).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'planner@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(
      await screen.findByRole('heading', { name: 'My events' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('No events yet')).toBeInTheDocument();
    expect(localStorage.getItem('gatherly.auth')).toContain('test-token');
  });

  it('validates and completes the five-step event wizard', async () => {
    const { calls } = installApiMock();
    authenticated();
    window.history.replaceState({}, '', '/events/new');
    const { container } = render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Type' }),
    ).toBeInTheDocument();
    expect((await axe(container)).violations).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Choose an event type.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Birthday'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByLabelText('Event title'), {
      target: { value: 'Garden birthday' },
    });
    fireEvent.change(screen.getByLabelText('Event date'), {
      target: { value: '2099-06-20' },
    });
    fireEvent.change(screen.getByLabelText('City'), {
      target: { value: 'Portland' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByLabelText('Number of guests'), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText('Total budget'), {
      target: { value: '1000' },
    });
    expect(screen.getByText(/50\.00 per guest/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Preferences'), {
      target: { value: 'low waste, vegetarian' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build my plan' }));

    expect(
      await screen.findByRole('heading', { name: 'Garden birthday' }),
    ).toBeInTheDocument();
    expect(
      calls.some(
        (call) =>
          call.path === '/api/events' &&
          call.method === 'POST' &&
          (call.body as { preferences?: string[] }).preferences?.length === 2,
      ),
    ).toBe(true);
  });

  it('shows budget text, supports keyboard tabs, and refetches after task updates', async () => {
    const { calls } = installApiMock();
    authenticated();
    window.history.replaceState({}, '', `/events/${plan.event.id}?tab=budget`);
    const { container } = render(<App />);

    expect(await screen.findByText(/Overspent by/)).toBeInTheDocument();
    expect(
      calls.find((call) => call.path === `/api/events/${plan.event.id}`)
        ?.authorization,
    ).toBe('Bearer test-token');
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    const budgetTab = screen.getByRole('tab', { name: 'Budget' });
    fireEvent.keyDown(budgetTab, { key: 'ArrowRight' });
    expect(
      await screen.findByRole('tab', { name: 'Timeline', selected: true }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Confirm guest count/ }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          (call) => call.path.includes('/tasks/') && call.method === 'PATCH',
        ),
      ).toBe(true),
    );
    expect(
      calls.filter(
        (call) =>
          call.path === `/api/events/${plan.event.id}` && call.method === 'GET',
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it('renders safe AI fallbacks, chat replies, and refinement Cancel/Apply', async () => {
    const { calls } = installApiMock();
    authenticated();
    window.history.replaceState({}, '', `/events/${plan.event.id}`);
    const { container } = render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'At a glance' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Refinement request'), {
      target: { value: 'Move money to the venue' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview refinement' }));
    expect(
      await screen.findByRole('dialog', { name: 'Review proposed changes' }),
    ).toBeInTheDocument();
    expect((await axe(container)).violations).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.some((call) => call.path.endsWith('/refinements/apply'))).toBe(
      false,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview refinement' }));
    await screen.findByRole('dialog', { name: 'Review proposed changes' });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() =>
      expect(
        calls.some((call) => call.path.endsWith('/refinements/apply')),
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Ideas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate ideas' }));
    expect(
      await screen.findByText(
        'AI suggestions are unavailable right now. Your plan is still shown.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Reuse table decorations')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Assistant' }));
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'What is next?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(
      await screen.findByText('Confirm the caterer this week.'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'AI suggestions are unavailable right now. Your plan is still shown.',
      ).length,
    ).toBeGreaterThan(0);
  });
});
