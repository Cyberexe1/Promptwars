import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import {
  AI_UNAVAILABLE,
  AiUnavailable,
  ErrorState,
  Loading,
} from '../src/components/Feedback';
import { Icon, eventTypeIcon } from '../src/components/Icons';
import { ProgressRing } from '../src/components/ProgressRing';
import { currency, date, daysUntil, errorMessage } from '../src/utils/format';

describe('format helpers', () => {
  it('formats currency and falls back for invalid currency codes', () => {
    expect(currency(1234.5, 'USD')).toMatch(/1,?234\.50/);
    expect(currency(5, 'NOT-A-CODE')).toBe('NOT-A-CODE 5.00');
  });

  it('formats calendar dates without timezone drift', () => {
    expect(date('2099-06-20')).toMatch(/20/);
    expect(date('2099-06-20')).toMatch(/2099/);
  });

  it('extracts safe error messages', () => {
    expect(errorMessage(new Error('Boom'))).toBe('Boom');
    expect(errorMessage('not an error')).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('counts whole days until an event and never goes negative', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
    expect(daysUntil('2026-01-11')).toBe(10);
    expect(daysUntil('2026-01-01')).toBe(0);
    expect(daysUntil('2025-12-01')).toBe(0);
  });
});

describe('Icon', () => {
  it('is decorative, never focusable, and accepts extra classes', () => {
    const { container } = render(<Icon name="sparkle" className="extra" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveClass('icon', 'extra');
  });

  it('maps event types to icons with a safe fallback', () => {
    expect(eventTypeIcon('wedding')).toBe('heart');
    expect(eventTypeIcon('birthday')).toBe('cake');
    expect(eventTypeIcon('community')).toBe('community');
    expect(eventTypeIcon('anything-else')).toBe('sparkle');
  });
});

describe('ProgressRing', () => {
  it('shows the rounded percentage and clamps out-of-range values', () => {
    const { rerender } = render(<ProgressRing percent={33.4} />);
    expect(screen.getByText('33%')).toBeInTheDocument();
    rerender(<ProgressRing percent={140} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    rerender(<ProgressRing percent={-8} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('is hidden from assistive technology', () => {
    const { container } = render(<ProgressRing percent={50} />);
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});

describe('Feedback components', () => {
  it('announces loading, errors with retry, and the AI fallback notice', async () => {
    const retry = vi.fn();
    const { container } = render(
      <>
        <Loading />
        <Loading>Fetching plan…</Loading>
        <ErrorState message="Something failed" retry={retry} />
        <ErrorState message="No retry here" />
        <AiUnavailable />
      </>,
    );

    expect(screen.getByText('Loading…')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Fetching plan…')).toBeInTheDocument();
    expect(screen.getByText('Something failed')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(
      1,
    );
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText(AI_UNAVAILABLE)).toBeInTheDocument();
    expect((await axe(container)).violations).toHaveLength(0);
  });
});
