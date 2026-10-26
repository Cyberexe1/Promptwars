import type {
  BudgetItem,
  EventContext,
  VendorItem,
} from '../../domain/models.js';
import {
  OUTDOOR_PERMIT_VENDOR_TEMPLATE,
  OUTDOOR_VENDOR_TEMPLATE,
  VENDOR_TEMPLATES,
  type VendorTemplateItem,
} from './templates.js';

function hasPreference(context: EventContext, preference: string): boolean {
  const wanted = preference.toLowerCase();
  return context.preferences.some(
    (value) => value.trim().toLowerCase() === wanted,
  );
}

function suggestedBudget(
  budget: readonly BudgetItem[],
  template: VendorTemplateItem,
): number {
  const allocation =
    budget.find((item) => item.category === template.budgetCategory)
      ?.allocated ?? 0;
  return Math.round(allocation * (template.budgetShare ?? 1) * 100) / 100;
}

function contextualizeVendor(
  template: VendorTemplateItem,
  context: EventContext,
): VendorTemplateItem {
  let name = template.name;
  let whyNeeded = `${template.whyNeeded} Search in ${context.city}.`;
  const questions = [...template.questions];
  const isMealVendor = ['food', 'catering'].includes(template.category);

  if (hasPreference(context, 'vegetarian') && isMealVendor) {
    name = `Vegetarian-friendly ${template.name.toLowerCase()}`;
    whyNeeded += ' The menu must support the vegetarian preference.';
    questions.push('How many substantial vegetarian choices are included?');
  }
  if (hasPreference(context, 'eco-friendly')) {
    whyNeeded += ' Sustainability practices should be evaluated.';
    questions.push('How do you reduce waste and single-use materials?');
  }
  if (context.audience === 'kids' && template.category === 'entertainment') {
    name = 'Kids party entertainment';
    whyNeeded += ' Activities must be age appropriate and supervised.';
  }

  return { ...template, name, whyNeeded, questions };
}

export function generateVendorChecklist(
  context: EventContext,
  budget: readonly BudgetItem[],
): VendorItem[] {
  const selected: VendorTemplateItem[] = VENDOR_TEMPLATES[context.type]
    .filter(
      (template) =>
        !(context.audience === 'kids' && template.key === 'bar-service'),
    )
    .map((template) => contextualizeVendor(template, context));

  if (
    context.audience === 'kids' &&
    !selected.some((template) => template.category === 'entertainment')
  ) {
    selected.push(
      contextualizeVendor(
        {
          key: 'kids-entertainment',
          category: 'entertainment',
          budgetCategory: 'entertainment',
          name: 'Kids party entertainment',
          whyNeeded: 'Provides age-appropriate, supervised activities.',
          leadTimeDays: 45,
          questions: [
            'Which ages does the activity suit?',
            'Are safeguarding and liability coverage documented?',
          ],
        },
        context,
      ),
    );
  }

  if (context.indoorOutdoor === 'outdoor') {
    selected.push(contextualizeVendor(OUTDOOR_VENDOR_TEMPLATE, context));
    if (
      context.type === 'community' &&
      !selected.some((template) => template.key === 'outdoor-permits')
    ) {
      selected.push(
        contextualizeVendor(OUTDOOR_PERMIT_VENDOR_TEMPLATE, context),
      );
    }
  }

  return selected.map((template) => ({
    id: `vendor-${context.type}-${template.key}`,
    category: template.category,
    name: template.name,
    whyNeeded: template.whyNeeded,
    leadTimeDays: template.leadTimeDays,
    suggestedBudget: suggestedBudget(budget, template),
    questions: [...template.questions],
    status: 'to-research',
  }));
}

export const generateVendors = generateVendorChecklist;
