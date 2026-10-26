import type { EventPlan } from '../../../domain/models.js';
import { escapePromptData } from '../sanitize.js';

const field = (name: string, value: string | number | boolean | undefined) =>
  value === undefined
    ? ''
    : `<${name}>${escapePromptData(String(value))}</${name}>`;

export function serializeEventContext(plan: EventPlan): string {
  const { event } = plan;
  const eventContext = [
    field('type', event.type),
    field('title', event.title),
    field('date', event.date),
    field('guest_count', event.guestCount),
    field('total_budget', event.totalBudget),
    field('currency', event.currency),
    field('city', event.city),
    field('setting', event.indoorOutdoor),
    field('audience', event.audience),
    `<preferences>${event.preferences.map((item) => field('preference', item)).join('')}</preferences>`,
  ].join('');

  const budgets = plan.budget
    .map(
      (item) =>
        `<category_budget>${field('category', item.category)}${field('label', item.label)}${field('remaining', Math.max(0, item.allocated - item.spent))}${field('allocated', item.allocated)}${field('spent', item.spent)}</category_budget>`,
    )
    .join('');

  const upcomingTasks = plan.tasks
    .filter((task) => task.status === 'pending')
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .slice(0, 10)
    .map(
      (task) =>
        `<task>${field('title', task.title)}${field('category', task.category)}${field('due_date', task.dueDate)}${field('urgent', task.urgent)}${field('overdue', task.overdue)}</task>`,
    )
    .join('');

  const vendors = plan.vendors
    .slice(0, 10)
    .map(
      (vendor) =>
        `<vendor>${field('category', vendor.category)}${field('name', vendor.name)}${field('need', vendor.whyNeeded)}${field('suggested_budget', vendor.suggestedBudget)}${field('status', vendor.status)}${field('quote', vendor.quote)}</vendor>`,
    )
    .join('');

  const warnings = plan.warnings
    .slice(0, 10)
    .map((warning) => field('warning', warning))
    .join('');

  return `<event_plan><event>${eventContext}</event><remaining_budgets>${budgets}</remaining_budgets><upcoming_tasks>${upcomingTasks}</upcoming_tasks><vendors>${vendors}</vendors><warnings>${warnings}</warnings></event_plan>`;
}
