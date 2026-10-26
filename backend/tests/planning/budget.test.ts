import { describe, expect, it } from 'vitest';
import type { EventContext } from '../../src/domain/models.js';
import {
  allocateBudget,
  generateBudget,
} from '../../src/services/planning/budget.js';

const wedding: EventContext = {
  type: 'wedding',
  title: 'Alex and Sam',
  date: '2027-06-12',
  guestCount: 120,
  totalBudget: 25_000.03,
  currency: 'USD',
  city: 'Portland',
  indoorOutdoor: 'indoor',
  preferences: [],
  audience: 'mixed',
};

function centsTotal(items: ReturnType<typeof allocateBudget>): number {
  return items.reduce((sum, item) => sum + Math.round(item.allocated * 100), 0);
}

describe('budget allocator', () => {
  it('allocates every cent and reserves a 5% to 10% contingency', () => {
    const budget = allocateBudget(wedding);
    const contingency = budget.find((item) => item.category === 'contingency');

    expect(centsTotal(budget)).toBe(Math.round(wedding.totalBudget * 100));
    expect(contingency).toBeDefined();
    expect(contingency!.allocated / wedding.totalBudget).toBeGreaterThanOrEqual(
      0.05,
    );
    expect(contingency!.allocated / wedding.totalBudget).toBeLessThanOrEqual(
      0.1,
    );
    expect(budget.every((item) => item.spent === 0)).toBe(true);
  });

  it('handles a tiny cent-denominated budget without losing money', () => {
    const budget = allocateBudget({
      ...wedding,
      totalBudget: 0.1,
      guestCount: 1,
    });

    expect(centsTotal(budget)).toBe(10);
    expect(
      budget.find((item) => item.category === 'contingency')?.allocated,
    ).toBe(0.01);
    expect(budget.every((item) => Number.isFinite(item.allocated))).toBe(true);
  });

  it('adjusts a 2,000-person outdoor eco-friendly vegetarian plan', () => {
    const result = generateBudget({
      ...wedding,
      guestCount: 2_000,
      totalBudget: 20_000,
      indoorOutdoor: 'outdoor',
      preferences: ['eco-friendly', 'vegetarian'],
      audience: 'kids',
    });

    expect(centsTotal(result.budget)).toBe(2_000_000);
    expect(result.budget.map((item) => item.category)).toEqual(
      expect.arrayContaining(['tent-rentals', 'entertainment', 'contingency']),
    );
    expect(
      result.budget.find((item) => item.category === 'catering')?.notes,
    ).toEqual(expect.arrayContaining([expect.stringContaining('vegetarian')]));
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Budget per guest'),
        expect.stringContaining('2000'),
      ]),
    );
  });
});
