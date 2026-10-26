import { describe, expect, it } from 'vitest';
import type { EventContext, TaskPhase } from '../../src/domain/models.js';
import { generateTimeline } from '../../src/services/planning/timeline.js';

const event: EventContext = {
  type: 'wedding',
  title: 'Short-notice wedding',
  date: '2026-05-22',
  guestCount: 80,
  totalBudget: 15_000,
  currency: 'USD',
  city: 'Austin',
  indoorOutdoor: 'indoor',
  preferences: [],
};

const PHASE_ORDER: Record<TaskPhase, number> = {
  Now: 0,
  'This month': 1,
  'Final weeks': 2,
  'Event week': 3,
};

describe('timeline generator', () => {
  it('keeps missed short-notice tasks and marks them urgent and overdue', () => {
    const result = generateTimeline(event, new Date('2026-05-01T18:00:00Z'));
    const venueTask = result.tasks.find((task) => task.category === 'venue');

    expect(result.tasks).toHaveLength(8);
    expect(venueTask).toMatchObject({
      dueDate: '2025-08-25',
      urgent: true,
      overdue: true,
      phase: 'Now',
      priority: 1,
    });
    const urgentTasks = result.tasks.filter((task) => task.urgent);
    expect(urgentTasks.map((task) => task.priority)).toEqual(
      [...urgentTasks]
        .map((task) => task.priority)
        .sort((left, right) => left - right),
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('only 21 days away'),
        expect.stringContaining('past the recommended due date'),
      ]),
    );
    expect(result.tasks.map((task) => task.id)).toEqual(
      generateTimeline(event, new Date('2026-05-01T00:00:00Z')).tasks.map(
        (task) => task.id,
      ),
    );
  });

  it('groups phases in deterministic order and due dates within each phase', () => {
    const tasks = generateTimeline(
      { ...event, date: '2027-05-22' },
      new Date('2026-05-01T00:00:00Z'),
    ).tasks;

    for (let index = 1; index < tasks.length; index += 1) {
      const previous = tasks[index - 1]!;
      const current = tasks[index]!;
      expect(PHASE_ORDER[current.phase]).toBeGreaterThanOrEqual(
        PHASE_ORDER[previous.phase],
      );
      if (current.phase === previous.phase) {
        expect(current.dueDate >= previous.dueDate).toBe(true);
      }
    }
  });

  it('rejects an event date before explicit today', () => {
    expect(() =>
      generateTimeline(event, new Date('2026-05-23T00:00:00Z')),
    ).toThrow('Event date cannot be in the past.');
  });
});
