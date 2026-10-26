import { describe, expect, it } from 'vitest';
import type { EventContext } from '../../src/domain/models.js';
import { allocateBudget } from '../../src/services/planning/budget.js';
import { generateVendorChecklist } from '../../src/services/planning/vendors.js';

const birthday: EventContext = {
  type: 'birthday',
  title: 'Outdoor kids party',
  date: '2027-08-15',
  guestCount: 35,
  totalBudget: 4_000,
  currency: 'USD',
  city: 'Denver',
  indoorOutdoor: 'outdoor',
  preferences: ['vegetarian', 'eco-friendly'],
  audience: 'kids',
};

describe('vendor checklist', () => {
  it('selects contextual vendors, excludes bar service, and links budgets', () => {
    const budget = allocateBudget(birthday);
    const vendors = generateVendorChecklist(birthday, budget);

    expect(vendors.some((vendor) => /bar/i.test(vendor.name))).toBe(false);
    expect(vendors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'tent-rentals',
          suggestedBudget: budget.find(
            (item) => item.category === 'tent-rentals',
          )?.allocated,
        }),
        expect.objectContaining({
          category: 'food',
          name: expect.stringContaining('Vegetarian-friendly'),
        }),
      ]),
    );
    expect(vendors.every((vendor) => vendor.status === 'to-research')).toBe(
      true,
    );
    expect(new Set(vendors.map((vendor) => vendor.id)).size).toBe(
      vendors.length,
    );
    expect(vendors.every((vendor) => vendor.whyNeeded.includes('Denver'))).toBe(
      true,
    );
  });

  it('includes permits and outdoor logistics for a community event', () => {
    const context: EventContext = {
      ...birthday,
      type: 'community',
      audience: 'mixed',
    };
    const vendors = generateVendorChecklist(context, allocateBudget(context));

    expect(vendors.map((vendor) => vendor.category)).toEqual(
      expect.arrayContaining(['permits-insurance', 'tent-rentals']),
    );
  });
});
