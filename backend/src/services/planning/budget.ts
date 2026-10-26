import type { BudgetItem, EventContext } from '../../domain/models.js';
import {
  BASE_CONTINGENCY_PERCENT,
  BUDGET_TEMPLATES,
  HIGH_GUEST_COUNT,
  MINIMUM_BUDGET_PER_GUEST,
  type BudgetTemplateItem,
} from './templates.js';

export interface BudgetAllocationResult {
  budget: BudgetItem[];
  warnings: string[];
}

interface WeightedItem extends BudgetTemplateItem {
  notes: string[];
}

const MONEY_EPSILON = 0.000_001;

function toCents(amount: number): number {
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError('Total budget must be a positive finite amount.');
  }
  if (Math.abs(amount * 100 - cents) > MONEY_EPSILON) {
    throw new RangeError('Total budget must be specified to whole cents.');
  }
  return cents;
}

function hasPreference(context: EventContext, preference: string): boolean {
  const wanted = preference.toLowerCase();
  return context.preferences.some(
    (value) => value.trim().toLowerCase() === wanted,
  );
}

function addNote(item: WeightedItem, note: string): void {
  if (!item.notes.includes(note)) item.notes.push(note);
}

function adjustItems(context: EventContext): WeightedItem[] {
  const items = BUDGET_TEMPLATES[context.type].map((item) => ({
    ...item,
    notes: [] as string[],
  }));
  const mealCategory = context.type === 'wedding' ? 'catering' : 'food';
  const byCategory = (category: string): WeightedItem | undefined =>
    items.find((item) => item.category === category);

  if (context.guestCount >= HIGH_GUEST_COUNT) {
    const venue = byCategory('venue');
    const meals = byCategory(mealCategory);
    if (venue) {
      venue.weight += 3;
      addNote(venue, 'Increased for a high guest count.');
    }
    if (meals) {
      meals.weight += 5;
      addNote(meals, 'Increased for a high guest count.');
    }
  }

  if (context.audience === 'kids') {
    let entertainment = byCategory('entertainment');
    if (!entertainment) {
      entertainment = {
        category: 'entertainment',
        label: 'Entertainment',
        weight: 5,
        notes: [],
      };
      items.push(entertainment);
    } else {
      entertainment.weight += 5;
    }
    addNote(entertainment, 'Prioritized for a kids audience.');
    const meals = byCategory(mealCategory);
    if (meals) {
      meals.weight = Math.max(1, meals.weight - 2);
      addNote(meals, 'Assumes child-friendly food and no alcohol service.');
    }
  }

  if (context.indoorOutdoor === 'outdoor') {
    items.push({
      category: 'tent-rentals',
      label: 'Tent and outdoor rentals',
      weight: 6,
      notes: ['Added for weather cover and outdoor logistics.'],
    });
  }

  if (hasPreference(context, 'vegetarian')) {
    const meals = byCategory(mealCategory);
    if (meals) {
      meals.weight += 2;
      addNote(meals, 'Allows for a varied vegetarian menu.');
    }
  }

  if (hasPreference(context, 'eco-friendly')) {
    const decor = byCategory('decor');
    const venue = byCategory('venue');
    if (decor) {
      decor.weight += 2;
      addNote(decor, 'Favors reusable, rented, or compostable materials.');
    }
    if (venue) {
      addNote(venue, 'Prefer a venue with waste-reduction practices.');
    }
    const marketing = byCategory('marketing');
    if (marketing) {
      addNote(
        marketing,
        'Prioritize digital promotion and recycled print stock.',
      );
    }
  }

  return items;
}

function contingencyPercent(context: EventContext): number {
  const weatherReserve = context.indoorOutdoor === 'outdoor' ? 2 : 0;
  const sustainabilityReserve = hasPreference(context, 'eco-friendly') ? 1 : 0;
  return Math.min(
    10,
    BASE_CONTINGENCY_PERCENT[context.type] +
      weatherReserve +
      sustainabilityReserve,
  );
}

function allocateWeightedCents(
  items: readonly WeightedItem[],
  availableCents: number,
): number[] {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const allocations = items.map((item, index) => {
    const exact = (availableCents * item.weight) / totalWeight;
    return {
      index,
      cents: Math.floor(exact),
      fraction: exact - Math.floor(exact),
    };
  });
  const centsLeft =
    availableCents - allocations.reduce((sum, item) => sum + item.cents, 0);

  const remainderOrder = [...allocations].sort(
    (left, right) => right.fraction - left.fraction || left.index - right.index,
  );
  for (let index = 0; index < centsLeft; index += 1) {
    const allocation = remainderOrder[index % remainderOrder.length];
    if (allocation) allocation.cents += 1;
  }

  return allocations
    .sort((left, right) => left.index - right.index)
    .map((item) => item.cents);
}

export function allocateBudget(context: EventContext): BudgetItem[] {
  const totalCents = toCents(context.totalBudget);
  const percent = contingencyPercent(context);
  const contingencyCents = Math.max(
    1,
    Math.round((totalCents * percent) / 100),
  );
  const availableCents = Math.max(0, totalCents - contingencyCents);
  const items = adjustItems(context);
  const allocations = allocateWeightedCents(items, availableCents);

  const budget = items.map((item, index) => ({
    category: item.category,
    label: item.label,
    allocated: (allocations[index] ?? 0) / 100,
    spent: 0,
    notes: [...item.notes],
  }));
  const allocatedNonContingency = allocations.reduce(
    (sum, amount) => sum + amount,
    0,
  );

  budget.push({
    category: 'contingency',
    label: 'Contingency',
    allocated: (totalCents - allocatedNonContingency) / 100,
    spent: 0,
    notes:
      context.indoorOutdoor === 'outdoor'
        ? ['Includes an additional reserve for weather-related changes.']
        : ['Reserved for unexpected costs.'],
  });

  return budget;
}

export function getBudgetWarnings(context: EventContext): string[] {
  const warnings: string[] = [];
  const totalCents = toCents(context.totalBudget);
  const costPerGuest = context.totalBudget / context.guestCount;
  const minimum = MINIMUM_BUDGET_PER_GUEST[context.type];

  if (costPerGuest < minimum) {
    warnings.push(
      `Budget per guest (${context.currency} ${costPerGuest.toFixed(2)}) is below the recommended ${context.currency} ${minimum.toFixed(2)} for a ${context.type} event. Consider reducing the guest list or simplifying food and venue choices.`,
    );
  }
  if (totalCents < 10) {
    warnings.push(
      'The budget is too small to represent a 5% to 10% contingency at whole-cent precision.',
    );
  }
  if (context.guestCount >= HIGH_GUEST_COUNT) {
    warnings.push(
      `A guest count of ${context.guestCount} requires early capacity and catering checks.`,
    );
  }

  return warnings;
}

export function generateBudget(context: EventContext): BudgetAllocationResult {
  return {
    budget: allocateBudget(context),
    warnings: getBudgetWarnings(context),
  };
}
