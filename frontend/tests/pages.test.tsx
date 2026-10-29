import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { apiError, baseEvent, mockApi, renderAt, user } from './helpers';

describe('landing page', () => {
  it('shows every product section and recovers when the backend returns', async () => {
    let healthy = false;
    mockApi([
      [
        'GET',
        '/api/health',
        () =>
          healthy
            ? { status: 'ok', time: new Date().toISOString() }
            : apiError(503, 'DOWN', 'Service down'),
      ],
    ]);
    const { container } = renderAt('/', { signedIn: false });

    expect(await screen.findByText('Backend unavailable')).toBeInTheDocument();
    for (const name of [
      'Less spreadsheet, more celebration',
      'From idea to plan in three steps',
      'Whatever you are celebrating',
      'Ready to plan something good?',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    for (const name of [
      'Budget that adds up',
      'Timeline that keeps pace',
      'Vendor checklist',
      'AI ideas and assistant',
      'Describe your event',
      'Get your starting plan',
      'Refine with AI',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('link', { name: /Create your free account/ }),
    ).toHaveAttribute('href', '/signup');
    expect((await axe(container)).violations).toHaveLength(0);

    healthy = true;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Backend connected')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
  });

  it('offers account links to visitors and navigation to signed-in users', async () => {
    mockApi();
    const visitor = renderAt('/', { signedIn: false });
    expect(
      await screen.findByRole('link', { name: 'Get started' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gatherly home' })).toHaveAttribute(
      'href',
      '/',
    );
    visitor.unmount();

    renderAt('/');
    expect(
      await screen.findByRole('link', { name: 'My events' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    const nav = within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    );
    expect(
      await nav.findByRole('link', { name: 'Log in' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('gatherly.auth')).toBeNull();
  });
});

describe('not found page', () => {
  it('explains the problem and links home', async () => {
    mockApi();
    const { container } = renderAt('/missing-page', { signedIn: false });

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });
});

describe('authentication', () => {
  it('validates both fields before calling the API', async () => {
    const { calls } = mockApi();
    renderAt('/login', { signedIn: false });

    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(
      screen.getByText('Enter a valid email address.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(calls.some((call) => call.path.startsWith('/api/auth'))).toBe(false);
  });

  it('enforces password strength on sign-up and shows server field errors', async () => {
    mockApi([
      [
        'POST',
        '/api/auth/signup',
        () =>
          apiError(400, 'VALIDATION_ERROR', 'Request validation failed', [
            { field: 'email', message: 'Email is already registered.' },
          ]),
      ],
    ]);
    const { container } = renderAt('/signup', { signedIn: false });

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'planner@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'weak' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      screen.getByText(
        'Use 8 or more characters with uppercase, lowercase, and a number.',
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Request validation failed',
    );
    expect(
      screen.getByText('Email is already registered.'),
    ).toBeInTheDocument();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it('creates an account and lands on the events list', async () => {
    mockApi();
    renderAt('/signup', { signedIn: false });

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByRole('heading', { name: 'My events' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('gatherly.auth')).toContain('test-token');
  });

  it('shows a readable message when sign-in fails', async () => {
    mockApi([
      [
        'POST',
        '/api/auth/login',
        () => apiError(401, 'UNAUTHORIZED', 'Invalid email or password'),
      ],
    ]);
    renderAt('/login', { signedIn: false });

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'WrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password',
    );
  });

  it('lets users retry after a wrong password and then reach their events', async () => {
    let attempts = 0;
    mockApi([
      [
        'POST',
        '/api/auth/login',
        () =>
          ++attempts === 1
            ? apiError(401, 'UNAUTHORIZED', 'Invalid email or password')
            : { user, token: 'test-token' },
      ],
    ]);
    renderAt('/login', { signedIn: false });

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'WrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password',
    );
    expect(window.location.pathname).toBe('/login');

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'RightPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(
      await screen.findByRole('heading', { name: 'My events' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/events');
  });

  it('sends users with an expired session back to login', async () => {
    mockApi([
      ['GET', '/api/events', () => apiError(401, 'UNAUTHORIZED', 'Expired')],
    ]);
    renderAt('/events');

    expect(
      await screen.findByRole('heading', { name: 'Log in' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('gatherly.auth')).toBeNull();
  });

  it('survives corrupted stored credentials', async () => {
    mockApi();
    localStorage.setItem('gatherly.auth', '{not json');
    window.history.replaceState({}, '', '/login');
    renderAt('/login', { signedIn: false });

    expect(
      await screen.findByRole('heading', { name: 'Log in' }),
    ).toBeInTheDocument();
  });
});

describe('events list', () => {
  const events = () => [
    baseEvent,
    {
      ...baseEvent,
      id: 'event-2',
      type: 'birthday' as const,
      title: 'Garden birthday',
    },
    {
      ...baseEvent,
      id: 'event-3',
      type: 'community' as const,
      title: 'Street fair',
    },
  ];

  it('lists events with type-specific cards and an accessible layout', async () => {
    const { state } = mockApi();
    state.events = events();
    const { container } = renderAt('/events');

    expect(
      await screen.findByRole('link', { name: 'Garden wedding' }),
    ).toHaveAttribute('href', `/events/${baseEvent.id}`);
    expect(
      screen.getByRole('link', { name: 'Street fair' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open plan' })).toHaveLength(3);
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it('keeps an event when deletion is not confirmed and removes it when it is', async () => {
    const { state, calls } = mockApi();
    state.events = events();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAt('/events');

    await screen.findByRole('link', { name: 'Street fair' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[2]!);
    expect(confirm).toHaveBeenCalledWith(
      'Delete Street fair? This cannot be undone.',
    );
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[2]!);
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Street fair' }),
      ).not.toBeInTheDocument(),
    );
    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  });

  it('reports a failed deletion', async () => {
    const { state } = mockApi([
      [
        'DELETE',
        /^\/api\/events\//,
        () =>
          apiError(409, 'CONFLICT', 'The event changed during this request'),
      ],
    ]);
    state.events = events();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt('/events');

    await screen.findByRole('link', { name: 'Street fair' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The event changed during this request',
    );
  });

  it('shows an error with retry when loading fails', async () => {
    let fail = true;
    const { state } = mockApi([
      [
        'GET',
        '/api/events',
        () =>
          fail
            ? apiError(500, 'INTERNAL_ERROR', 'Server exploded')
            : { events: state.events },
      ],
    ]);
    state.events = events();
    renderAt('/events');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Server exploded',
    );
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('link', { name: 'Garden wedding' }),
    ).toBeInTheDocument();
  });

  it('invites first-time users to create an event', async () => {
    mockApi();
    const { container } = renderAt('/events');

    expect(await screen.findByText('No events yet')).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Create an event' }),
    ).toHaveLength(2);
    expect((await axe(container)).violations).toHaveLength(0);
  });
});

describe('new event wizard', () => {
  async function reachReview() {
    fireEvent.click(await screen.findByLabelText('Wedding'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Event title'), {
      target: { value: 'Garden wedding' },
    });
    fireEvent.change(screen.getByLabelText('Event date'), {
      target: { value: '2099-06-20' },
    });
    fireEvent.change(screen.getByLabelText('City'), {
      target: { value: 'Portland' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Number of guests'), {
      target: { value: '80' },
    });
    fireEvent.change(screen.getByLabelText('Total budget'), {
      target: { value: '10000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  }

  it('can step back, and keeps the review step accessible', async () => {
    mockApi();
    const { container } = renderAt('/events/new');
    await reachReview();

    expect(
      await screen.findByRole('heading', { name: 'Review your event' }),
    ).toBeInTheDocument();
    expect((await axe(container)).violations).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(
      screen.queryByRole('heading', { name: 'Review your event' }),
    ).not.toBeInTheDocument();
  });

  it('blocks incomplete steps and shows API failures without losing input', async () => {
    mockApi([
      [
        'POST',
        '/api/events',
        () => apiError(500, 'INTERNAL_ERROR', 'The planner is busy'),
      ],
    ]);
    renderAt('/events/new');

    fireEvent.click(await screen.findByLabelText('Wedding'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Event title')).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    fireEvent.change(screen.getByLabelText('Event title'), {
      target: { value: 'Garden wedding' },
    });
    fireEvent.change(screen.getByLabelText('Event date'), {
      target: { value: '2099-06-20' },
    });
    fireEvent.change(screen.getByLabelText('City'), {
      target: { value: 'Portland' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Number of guests')).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    fireEvent.change(screen.getByLabelText('Number of guests'), {
      target: { value: '80' },
    });
    fireEvent.change(screen.getByLabelText('Total budget'), {
      target: { value: '10000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build my plan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The planner is busy',
    );
    expect(screen.getByRole('button', { name: 'Build my plan' })).toBeEnabled();
  });
});
