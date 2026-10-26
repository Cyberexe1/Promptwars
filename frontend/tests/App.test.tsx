import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it('shows a successful backend connection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'ok', time: new Date().toISOString() }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(<App />);

    expect(await screen.findByText('Backend connected')).toBeInTheDocument();
  });
});
