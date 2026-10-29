import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import {
  apiError,
  baseEvent,
  eventPath,
  makePlan,
  mockApi,
  renderAt,
  type Route,
} from './helpers';

const planPath = new RegExp(`^/api/events/${baseEvent.id}$`);

describe('dashboard shell', () => {
  it('shows the hero summary and every tab panel', async () => {
    mockApi();
    const { container } = renderAt(eventPath());

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Garden wedding' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Portland')).toBeInTheDocument();
    expect(screen.getByText('80 guests')).toBeInTheDocument();
    expect(screen.getByText('days to go')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← My events' })).toHaveAttribute(
      'href',
      '/events',
    );

    const panels: Array<[string, string]> = [
      ['Budget', 'Budget'],
      ['Timeline', 'Timeline'],
      ['Vendors', 'Vendors'],
      ['Ideas', 'Ideas'],
      ['Assistant', 'Planning assistant'],
      ['Overview', 'At a glance'],
    ];
    for (const [tab, heading] of panels) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      expect(
        await screen.findByRole('heading', { level: 2, name: heading }),
      ).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: tab })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    }
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it('supports arrow, Home, and End keys with wrap-around', async () => {
    mockApi();
    renderAt(eventPath('timeline'));
    const timeline = await screen.findByRole('tab', { name: 'Timeline' });

    fireEvent.keyDown(timeline, { key: 'ArrowLeft' });
    expect(
      await screen.findByRole('tab', { name: 'Budget', selected: true }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Budget' }), {
      key: 'End',
    });
    expect(
      await screen.findByRole('tab', { name: 'Assistant', selected: true }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Assistant' }), {
      key: 'ArrowRight',
    });
    expect(
      await screen.findByRole('tab', { name: 'Overview', selected: true }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), {
      key: 'ArrowLeft',
    });
    expect(
      await screen.findByRole('tab', { name: 'Assistant', selected: true }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Assistant' }), {
      key: 'Home',
    });
    expect(
      await screen.findByRole('tab', { name: 'Overview', selected: true }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), {
      key: 'a',
    });
    expect(
      screen.getByRole('tab', { name: 'Overview', selected: true }),
    ).toBeInTheDocument();
  });

  it('falls back to the overview for an unknown tab', async () => {
    mockApi();
    renderAt(eventPath('nonsense'));
    expect(
      await screen.findByRole('heading', { name: 'At a glance' }),
    ).toBeInTheDocument();
  });

  it('shows a load error with retry', async () => {
    let fail = true;
    const { state } = mockApi([
      [
        'GET',
        planPath,
        () =>
          fail ? apiError(404, 'NOT_FOUND', 'Event not found') : state.plan,
      ],
    ]);
    renderAt(eventPath());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Event not found',
    );
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Garden wedding' }),
    ).toBeInTheDocument();
  });

  it('keeps the plan visible when a refresh fails after a save', async () => {
    let loads = 0;
    const { state } = mockApi([
      [
        'GET',
        planPath,
        () => (++loads === 1 ? state.plan : apiError(503, 'DOWN', 'Offline')),
      ],
    ]);
    renderAt(eventPath('timeline'));

    fireEvent.click(
      await screen.findByRole('checkbox', { name: /Hire a photographer/ }),
    );
    const banner = await screen.findByText('Plan update notice');
    expect(banner.closest('[role="alert"]')).toHaveTextContent(
      /changes were saved/,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Garden wedding' }),
    ).toBeInTheDocument();

    loads = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }));
    await waitFor(() =>
      expect(screen.queryByText('Plan update notice')).not.toBeInTheDocument(),
    );
  });
});

describe('overview panel', () => {
  it('summarises progress, next tasks, and warnings', async () => {
    mockApi();
    renderAt(eventPath());

    expect(await screen.findByText(/1 of 2/)).toBeInTheDocument();
    expect(screen.getByText(/tasks complete \(50%\)/)).toBeInTheDocument();
    expect(screen.getByText('Hire a photographer')).toBeInTheDocument();
    expect(screen.getByText(/Urgent · Overdue/)).toBeInTheDocument();
    expect(
      screen.getByText('Venue spending is above its allocation.'),
    ).toBeInTheDocument();
  });

  it('celebrates a finished plan and an empty warning list', async () => {
    mockApi([], {
      tasks: makePlan().tasks.map((task) => ({
        ...task,
        status: 'completed' as const,
      })),
      warnings: [],
    });
    renderAt(eventPath());

    expect(
      await screen.findByText('All tasks are complete. Nicely done.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No warnings right now.')).toBeInTheDocument();
  });

  it('handles a plan with no tasks', async () => {
    mockApi([], { tasks: [], warnings: [] });
    renderAt(eventPath());

    expect(await screen.findByText(/0 of 0/)).toBeInTheDocument();
    expect(screen.getByText(/tasks complete \(0%\)/)).toBeInTheDocument();
  });
});

describe('budget panel', () => {
  const withOddRows = {
    budget: [
      ...makePlan().budget,
      { category: 'misc', label: 'Misc', allocated: 0, spent: 5, notes: [] },
      { category: 'extra', label: 'Extra', allocated: 0, spent: 0, notes: [] },
    ],
  };

  it('flags overspending and handles zero allocations', async () => {
    mockApi([], withOddRows);
    renderAt(eventPath('budget'));

    expect((await screen.findAllByText(/Overspent by/)).length).toBe(2);
    expect(screen.getByText(/\(100%\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/\(0%\)/).length).toBeGreaterThan(0);
  });

  it('validates the replacement total before saving', async () => {
    const { calls } = mockApi();
    renderAt(eventPath('budget'));

    const [venueInput] = await screen.findAllByLabelText(
      'Replacement total spent',
    );
    fireEvent.change(venueInput!, { target: { value: 'abc' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    expect(
      await screen.findByText(
        'Enter a non-negative total with up to 2 decimal places.',
      ),
    ).toBeInTheDocument();
    expect(venueInput).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });

  it('saves a valid total and surfaces API failures', async () => {
    let fail = false;
    const { calls } = mockApi([
      [
        'PATCH',
        /\/budget\//,
        ({ body }) =>
          fail
            ? apiError(409, 'CONFLICT', 'The event changed during this request')
            : {
                budget: { ...makePlan().budget[0], spent: body?.spent },
                warning: null,
              },
      ],
    ]);
    renderAt(eventPath('budget'));

    const [venueInput] = await screen.findAllByLabelText(
      'Replacement total spent',
    );
    fireEvent.change(venueInput!, { target: { value: '3500.50' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
        spent: 3500.5,
      }),
    );

    fail = true;
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    expect(
      await screen.findByText('The event changed during this request'),
    ).toBeInTheDocument();
  });
});

describe('timeline panel', () => {
  it('groups tasks by phase with status badges', async () => {
    mockApi();
    renderAt(eventPath('timeline'));

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Now' }),
    ).toBeInTheDocument();
    expect(screen.getByText('⚑ Urgent')).toBeInTheDocument();
    expect(screen.getByText('! Overdue')).toBeInTheDocument();
    expect(screen.getAllByText('No tasks in this phase.')).toHaveLength(2);
    expect(
      screen.getByRole('checkbox', { name: /Book the venue/ }),
    ).toBeChecked();
  });

  it('shows a save failure with a reload action', async () => {
    const { calls } = mockApi([
      [
        'PATCH',
        /\/tasks\//,
        () => apiError(500, 'INTERNAL_ERROR', 'Could not save the task'),
      ],
    ]);
    renderAt(eventPath('timeline'));

    fireEvent.click(
      await screen.findByRole('checkbox', { name: /Hire a photographer/ }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not save the task');
    const before = calls.filter((call) => call.method === 'GET').length;
    fireEvent.click(within(alert).getByRole('button', { name: 'Reload plan' }));
    await waitFor(() =>
      expect(
        calls.filter((call) => call.method === 'GET').length,
      ).toBeGreaterThan(before),
    );
  });
});

describe('vendors panel', () => {
  it('saves status and quote changes', async () => {
    const { calls } = mockApi();
    renderAt(eventPath('vendors'));

    fireEvent.change(await screen.findByLabelText('Status'), {
      target: { value: 'quoted' },
    });
    fireEvent.change(screen.getByLabelText('Quote (USD)'), {
      target: { value: '480.25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save vendor' }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
        status: 'quoted',
        quote: 480.25,
      }),
    );
    expect(screen.getByText('Can you label allergens?')).toBeInTheDocument();
  });

  it('saves a status change without a quote', async () => {
    const { calls } = mockApi();
    renderAt(eventPath('vendors'));

    fireEvent.change(await screen.findByLabelText('Status'), {
      target: { value: 'contacted' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save vendor' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
        status: 'contacted',
      }),
    );
  });

  it('rejects invalid quotes and shows API failures', async () => {
    const fail: Route = [
      'PATCH',
      /\/vendors\//,
      () => apiError(409, 'CONFLICT', 'The event changed during this request'),
    ];
    mockApi([fail]);
    renderAt(eventPath('vendors'));

    fireEvent.change(await screen.findByLabelText('Quote (USD)'), {
      target: { value: '12abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save vendor' }));
    expect(
      await screen.findByText(
        'Quote must be non-negative with up to 2 decimal places.',
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Quote (USD)'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save vendor' }));
    expect(
      await screen.findByText('The event changed during this request'),
    ).toBeInTheDocument();
  });

  it('explains when no vendors are needed', async () => {
    mockApi([], { vendors: [] });
    renderAt(eventPath('vendors'));
    expect(
      await screen.findByText(
        'No vendor suggestions are needed for this plan.',
      ),
    ).toBeInTheDocument();
  });
});

describe('ideas panel', () => {
  it('sends the chosen category and notes and labels AI results', async () => {
    const { calls } = mockApi();
    renderAt(eventPath('ideas'));

    expect(
      await screen.findByText(
        'Choose a category and generate ideas when you’re ready.',
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'menu' },
    });
    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: ' vegan ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate ideas' }));

    expect(await screen.findByText('Lantern walk')).toBeInTheDocument();
    expect(screen.getByText('AI-generated idea')).toBeInTheDocument();
    expect(screen.getByText('Why it fits:')).toBeInTheDocument();
    expect(calls.find((call) => call.path.endsWith('/ai/ideas'))?.body).toEqual(
      {
        category: 'menu',
        extraNotes: 'vegan',
      },
    );
  });

  it('labels fallback suggestions and handles empty results', async () => {
    let empty = false;
    mockApi([
      [
        'POST',
        /\/ai\/ideas$/,
        () => ({
          ideas: empty
            ? []
            : [
                {
                  title: 'Potluck',
                  description: 'Share dishes.',
                  estimatedCost: 0,
                  whyItFits: 'Low cost.',
                },
              ],
          aiAvailable: false,
        }),
      ],
    ]);
    renderAt(eventPath('ideas'));

    fireEvent.click(
      await screen.findByRole('button', { name: 'Generate ideas' }),
    );
    expect(await screen.findByText('Planning suggestion')).toBeInTheDocument();
    expect(
      screen.getByText(/AI suggestions are unavailable/),
    ).toBeInTheDocument();

    empty = true;
    fireEvent.click(screen.getByRole('button', { name: 'Generate ideas' }));
    expect(
      await screen.findByText(
        'No ideas were returned. Try another category or note.',
      ),
    ).toBeInTheDocument();
  });

  it('shows errors and retries', async () => {
    let fail = true;
    mockApi([
      [
        'POST',
        /\/ai\/ideas$/,
        () =>
          fail
            ? apiError(
                429,
                'RATE_LIMITED',
                'Too many AI requests; try again later',
              )
            : {
                ideas: [
                  {
                    title: 'Picnic',
                    description: 'Outdoors.',
                    estimatedCost: 10,
                    whyItFits: 'Easy.',
                  },
                ],
                aiAvailable: true,
              },
      ],
    ]);
    renderAt(eventPath('ideas'));

    fireEvent.click(
      await screen.findByRole('button', { name: 'Generate ideas' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many AI requests',
    );
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Picnic')).toBeInTheDocument();
  });
});

describe('assistant panel', () => {
  it('answers a suggested prompt and keeps conversation history', async () => {
    const { calls } = mockApi();
    renderAt(eventPath('assistant'));

    fireEvent.click(
      await screen.findByRole('button', { name: 'Where can I save money?' }),
    );
    expect(
      await screen.findByText('Book the photographer.'),
    ).toBeInTheDocument();
    const conversation = within(screen.getByLabelText('Conversation'));
    expect(conversation.getByText('You')).toBeInTheDocument();
    expect(conversation.getByText('Assistant')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'And the venue?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findAllByText('Book the photographer.');
    const chats = calls.filter((call) => call.path.endsWith('/ai/chat'));
    expect(chats).toHaveLength(2);
    expect((chats[1]?.body?.history as unknown[]).length).toBe(2);
  });

  it('restores the message when sending fails', async () => {
    mockApi([
      [
        'POST',
        /\/ai\/chat$/,
        () => apiError(500, 'INTERNAL_ERROR', 'Chat is down'),
      ],
    ]);
    renderAt(eventPath('assistant'));

    fireEvent.change(await screen.findByLabelText('Message'), {
      target: { value: 'Hello there' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your message is ready to retry.',
    );
    expect(screen.getByLabelText('Message')).toHaveValue('Hello there');
  });

  it('labels fallback replies and ignores blank messages', async () => {
    const { calls } = mockApi([
      [
        'POST',
        /\/ai\/chat$/,
        () => ({ reply: 'Check your vendors.', aiAvailable: false }),
      ],
    ]);
    renderAt(eventPath('assistant'));

    expect(await screen.findByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'What now?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Check your vendors.')).toBeInTheDocument();
    expect(screen.getByText('Planning fallback')).toBeInTheDocument();
    expect(
      screen.getByText(/AI suggestions are unavailable/),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.path.endsWith('/ai/chat'))).toHaveLength(
      1,
    );
  });
});

describe('refinement', () => {
  const proposal = (overrides: Record<string, unknown> = {}) => ({
    proposedChanges: {
      budgetShifts: [
        { category: 'food', delta: -100, reason: 'Use a buffet.' },
        { category: 'catering-extra', delta: 100, reason: 'Unknown category.' },
      ],
      newTasks: [
        {
          title: 'Confirm menu',
          category: 'food',
          dueDate: '2099-05-01',
          reason: 'Menu changed.',
        },
      ],
    },
    baseVersion: 1,
    aiAvailable: true,
    ...overrides,
  });

  async function openPreview() {
    fireEvent.change(await screen.findByLabelText('Refinement request'), {
      target: { value: 'Trim the food budget' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview refinement' }));
    return screen.findByRole('dialog', { name: 'Review proposed changes' });
  }

  it('shows a before/after table and traps keyboard focus', async () => {
    mockApi([['POST', /\/ai\/refine$/, () => proposal()]]);
    renderAt(eventPath());
    const dialog = await openPreview();

    expect(within(dialog).getByText('Use a buffet.')).toBeInTheDocument();
    expect(within(dialog).getByText('catering-extra')).toBeInTheDocument();
    expect(within(dialog).getByText('Confirm menu')).toBeInTheDocument();
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const apply = within(dialog).getByRole('button', { name: 'Apply changes' });
    expect(cancel).toHaveFocus();

    // The scrollable table is keyboard reachable and part of the focus loop.
    const region = within(dialog).getByRole('region', {
      name: 'Allocation changes table',
    });
    expect(region).toHaveAttribute('tabindex', '0');
    region.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(apply).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(region).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('applies changes with the preview base version', async () => {
    const { calls } = mockApi([['POST', /\/ai\/refine$/, () => proposal()]]);
    renderAt(eventPath());
    await openPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      calls.find((call) => call.path.endsWith('/refinements/apply'))?.body,
    ).toMatchObject({
      baseVersion: 1,
    });
  });

  it('asks for a new preview when the plan changed (409)', async () => {
    mockApi([
      ['POST', /\/ai\/refine$/, () => proposal()],
      [
        'POST',
        /\/refinements\/apply$/,
        () =>
          apiError(409, 'CONFLICT', 'The event changed during this request'),
      ],
    ]);
    renderAt(eventPath());
    await openPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your plan changed after this preview. Generate a new refinement before applying.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the dialog open and explains other apply failures', async () => {
    mockApi([
      ['POST', /\/ai\/refine$/, () => proposal()],
      [
        'POST',
        /\/refinements\/apply$/,
        () => apiError(400, 'VALIDATION_ERROR', 'Proposal is no longer valid'),
      ],
    ]);
    renderAt(eventPath());
    const dialog = await openPreview();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Apply changes' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Proposal is no longer valid',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reports unavailable AI, empty proposals, and request errors', async () => {
    let mode: 'down' | 'empty' | 'error' = 'down';
    mockApi([
      [
        'POST',
        /\/ai\/refine$/,
        () => {
          if (mode === 'error')
            return apiError(
              429,
              'RATE_LIMITED',
              'Too many AI requests; try again later',
            );
          return mode === 'down'
            ? proposal({ aiAvailable: false })
            : proposal({ proposedChanges: { budgetShifts: [], newTasks: [] } });
        },
      ],
    ]);
    renderAt(eventPath());

    await openPreview().catch(() => undefined);
    expect(
      await screen.findByText(/AI suggestions are unavailable/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    mode = 'empty';
    fireEvent.click(screen.getByRole('button', { name: 'Preview refinement' }));
    expect(
      await screen.findByText(/AI suggestions are unavailable/),
    ).toBeInTheDocument();

    mode = 'error';
    fireEvent.click(screen.getByRole('button', { name: 'Preview refinement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many AI requests',
    );
  });

  it('keeps the button disabled until an instruction is typed', async () => {
    mockApi();
    renderAt(eventPath());
    expect(
      await screen.findByRole('button', { name: 'Preview refinement' }),
    ).toBeDisabled();
  });
});
