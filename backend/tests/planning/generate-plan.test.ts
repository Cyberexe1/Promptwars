import { describe, expect, it } from 'vitest';
import type {
  BudgetItem,
  EventRecord,
  VendorItem,
} from '../../src/domain/models.js';
import { crossCheckVendorQuotes } from '../../src/services/planning/cross-checks.js';
import { generatePlan } from '../../src/services/planning/generate-plan.js';

const event: EventRecord = {
  id: 'event-123',
  userId: 'user-456',
  version: 1,
  type: 'community',
  title: 'Neighborhood day',
  date: '2027-09-20',
  guestCount: 200,
  totalBudget: 10_000,
  currency: 'USD',
  city: 'Madison',
  indoorOutdoor: 'outdoor',
  preferences: ['eco-friendly'],
  audience: 'mixed',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('plan generation and cross-checks', () => {
  it('returns a deterministic EventPlan with stable IDs', () => {
    const today = new Date('2026-09-20T12:00:00Z');
    const first = generatePlan(event, today);
    const second = generatePlan(event, today);

    expect(first).toEqual(second);
    expect(first.event).toBe(event);
    expect(first.budget.length).toBeGreaterThan(0);
    expect(
      first.tasks.every((task) => task.id.startsWith('task-community-')),
    ).toBe(true);
    expect(
      first.vendors.every((vendor) =>
        vendor.id.startsWith('vendor-community-'),
      ),
    ).toBe(true);
  });

  it('flags aggregate quote overspend by category', () => {
    const budget: BudgetItem[] = [
      {
        category: 'food',
        label: 'Food',
        allocated: 500,
        spent: 0,
        notes: [],
      },
    ];
    const vendor = (id: string, quote: number): VendorItem => ({
      id,
      category: 'food',
      name: id,
      whyNeeded: 'Food service',
      leadTimeDays: 30,
      suggestedBudget: 250,
      questions: [],
      status: 'quoted',
      quote,
    });

    expect(
      crossCheckVendorQuotes(budget, [vendor('one', 300), vendor('two', 250)]),
    ).toEqual([
      'Vendor quotes for food exceed its budget by 50.00 (550.00 quoted versus 500.00 allocated).',
    ]);
  });
});
