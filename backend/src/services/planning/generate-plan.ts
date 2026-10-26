import type { EventPlan, EventRecord } from '../../domain/models.js';
import { crossCheckVendorQuotes } from './cross-checks.js';
import { generateBudget } from './budget.js';
import { generateTimeline } from './timeline.js';
import { generateVendorChecklist } from './vendors.js';

function uniqueWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings)];
}

export function generatePlan(event: EventRecord, today: Date): EventPlan {
  const budgetResult = generateBudget(event);
  const timelineResult = generateTimeline(event, today);
  const vendors = generateVendorChecklist(event, budgetResult.budget);
  const quoteWarnings = crossCheckVendorQuotes(budgetResult.budget, vendors);

  return {
    event,
    budget: budgetResult.budget,
    tasks: timelineResult.tasks,
    vendors,
    warnings: uniqueWarnings([
      ...budgetResult.warnings,
      ...timelineResult.warnings,
      ...quoteWarnings,
    ]),
  };
}
