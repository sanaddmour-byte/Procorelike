/**
 * `role` is plain `string`, not `ProjectRole`, on purpose: an Approver can
 * be reconstructed from a change order's jsonb `approval_chain` (round-
 * tripped JSON, no union-type guarantee) as easily as from a fresh
 * `project_users` row, and role plays no part in the validation below
 * anyway -- it's carried along only as audit-trail context.
 */
export interface Approver {
  userId: string;
  companyId: string;
  role: string;
}

/**
 * A change order at or above the project's configured threshold requires a
 * second approver. Threshold is configurable per project (docs/DATA_MODEL.md
 * §9 change_orders.approval_chain).
 */
export function requiresSecondApprover(changeOrderAmount: number, thresholdAmount: number): boolean {
  return Math.abs(changeOrderAmount) >= thresholdAmount;
}

/**
 * The brief requires the second approver to be "from a different company" —
 * interpreted here as segregation-of-duties across organizations: the same
 * person cannot approve twice, and the second approver must belong to a
 * different company than the first. (Two different employees of the same
 * GC both approving would not satisfy an external check-and-balance.)
 * Revisit if the intent was "different role" within the same company instead.
 */
export function isValidSecondApprover(first: Approver, second: Approver): boolean {
  if (first.userId === second.userId) return false;
  return first.companyId !== second.companyId;
}
