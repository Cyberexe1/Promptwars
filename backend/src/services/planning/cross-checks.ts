import type { BudgetItem, VendorItem } from '../../domain/models.js';

function money(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function crossCheckVendorQuotes(
  budget: readonly BudgetItem[],
  vendors: readonly VendorItem[],
): string[] {
  const allocations = new Map(
    budget.map((item) => [item.category, money(item.allocated)]),
  );
  const quotes = new Map<string, number>();

  for (const vendor of vendors) {
    if (vendor.quote === undefined) continue;
    quotes.set(
      vendor.category,
      money((quotes.get(vendor.category) ?? 0) + vendor.quote),
    );
  }

  const warnings: string[] = [];
  for (const category of [...quotes.keys()].sort()) {
    const quoted = quotes.get(category) ?? 0;
    const allocated = allocations.get(category);
    if (allocated === undefined) {
      warnings.push(
        `Vendor quotes for ${category} total ${quoted.toFixed(2)}, but no matching budget allocation exists.`,
      );
    } else if (quoted > allocated) {
      warnings.push(
        `Vendor quotes for ${category} exceed its budget by ${(quoted - allocated).toFixed(2)} (${quoted.toFixed(2)} quoted versus ${allocated.toFixed(2)} allocated).`,
      );
    }
  }

  return warnings;
}
