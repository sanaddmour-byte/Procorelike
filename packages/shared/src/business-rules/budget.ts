/**
 * Budget line item math. `originalAmount` and `forecastToComplete` are
 * entered by the PM; `approvedChangesAmount` is system-managed (bumped only
 * when a 'prime'-targeted change order targeting this line item is
 * approved — see change-management.service.ts). `projectedAmount` is a
 * stored, auto-recomputed cache of the formula below (not left for clients
 * to compute) so every reader — web, mobile, a future export — agrees on
 * the number without re-deriving it.
 *
 * Formula (a documented assumption, not specified in the brief): revised
 * budget = original + approved changes; projected cost = revised budget +
 * forecast-to-complete, where forecast-to-complete is the PM's estimate of
 * additional cost beyond the revised budget that hasn't yet gone through a
 * change order. Revisit if "forecast to complete" was meant as the total
 * remaining cost-to-complete rather than an addition on top of the revised
 * budget.
 */

/**
 * `modificationsAmount` is Procore's "Budget Modifications": net internal
 * transfers between line items (see budgetModifications table) that don't
 * change the project's overall contract value, unlike an approved change
 * order.
 */
export function computeRevisedBudget(originalAmount: number, modificationsAmount: number, approvedChangesAmount: number): number {
  return round2(originalAmount + modificationsAmount + approvedChangesAmount);
}

export function computeProjectedAmount(
  originalAmount: number,
  modificationsAmount: number,
  approvedChangesAmount: number,
  forecastToComplete: number,
): number {
  return round2(computeRevisedBudget(originalAmount, modificationsAmount, approvedChangesAmount) + forecastToComplete);
}

export function computeVariance(revisedBudget: number, projectedAmount: number): number {
  return round2(revisedBudget - projectedAmount);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
