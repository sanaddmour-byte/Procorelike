import { z } from "zod";

const money = z.number().finite();
const currencyCode = z.string().length(3).default("USD");

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export const createBudgetLineItemSchema = z
  .object({
    projectId: z.string().uuid(),
    costCodeId: z.string().uuid(),
    originalAmount: money.default(0),
    forecastToComplete: money.default(0),
    currency: currencyCode,
  })
  .strict();
export type CreateBudgetLineItemInput = z.infer<typeof createBudgetLineItemSchema>;

/** approvedChangesAmount is deliberately not editable here -- it's system-managed, bumped only by an approved 'prime' change order (see change-management.service.ts). */
export const updateBudgetLineItemSchema = z
  .object({
    originalAmount: money.optional(),
    forecastToComplete: money.optional(),
  })
  .strict();
export type UpdateBudgetLineItemInput = z.infer<typeof updateBudgetLineItemSchema>;

// ---------------------------------------------------------------------------
// Commitments
// ---------------------------------------------------------------------------

export const commitmentTypeSchema = z.enum(["subcontract", "po"]);
export type CommitmentType = z.infer<typeof commitmentTypeSchema>;

export const createCommitmentSchema = z
  .object({
    projectId: z.string().uuid(),
    companyId: z.string().uuid(),
    type: commitmentTypeSchema,
    costCodeId: z.string().uuid().optional(),
    retentionPct: z.number().min(0).max(100).default(0),
    currency: currencyCode,
    title: z.string().min(1).max(300),
  })
  .strict();
export type CreateCommitmentInput = z.infer<typeof createCommitmentSchema>;

export const createCommitmentLineItemSchema = z
  .object({
    costCodeId: z.string().uuid(),
    scheduleOfValuesAmount: money,
    description: z.string().min(1).max(300),
  })
  .strict();
export type CreateCommitmentLineItemInput = z.infer<typeof createCommitmentLineItemSchema>;

// ---------------------------------------------------------------------------
// Change management: change events -> potential change orders -> change orders
// ---------------------------------------------------------------------------

/** Procore's standard Change Event/Order Reason categories. */
export const changeReasonSchema = z.enum([
  "owner_change",
  "design_development",
  "allowance",
  "value_engineering",
  "unforeseen_condition",
  "errors_omissions",
  "rfi",
  "other",
]);
export type ChangeReason = z.infer<typeof changeReasonSchema>;

/** Procore's Change Event workflow status: separate from a change order's own approval status. */
export const changeEventStatusSchema = z.enum(["open", "incorporated", "void"]);
export type ChangeEventStatus = z.infer<typeof changeEventStatusSchema>;

export const CHANGE_EVENT_STATUS_TRANSITIONS: Record<ChangeEventStatus, readonly ChangeEventStatus[]> = {
  open: ["incorporated", "void"],
  incorporated: [],
  void: [],
};

export const createChangeEventSchema = z
  .object({
    projectId: z.string().uuid(),
    title: z.string().min(1).max(300),
    description: z.string().max(5000).optional(),
    potentialCostImpact: money.optional(),
    reason: changeReasonSchema.default("other"),
  })
  .strict();
export type CreateChangeEventInput = z.infer<typeof createChangeEventSchema>;

export const transitionChangeEventStatusSchema = z
  .object({
    toStatus: changeEventStatusSchema,
  })
  .strict();
export type TransitionChangeEventStatusInput = z.infer<typeof transitionChangeEventStatusSchema>;

export const changeStatusSchema = z.enum(["draft", "pending_approval", "approved", "rejected", "void"]);
export type ChangeStatus = z.infer<typeof changeStatusSchema>;

export const createPotentialChangeOrderSchema = z
  .object({
    costImpact: money.optional(),
    timeImpactDays: z.number().int().optional(),
  })
  .strict();
export type CreatePotentialChangeOrderInput = z.infer<typeof createPotentialChangeOrderSchema>;

export const updatePotentialChangeOrderStatusSchema = z
  .object({
    status: changeStatusSchema,
  })
  .strict();
export type UpdatePotentialChangeOrderStatusInput = z.infer<typeof updatePotentialChangeOrderStatusSchema>;

export const changeOrderTargetTypeSchema = z.enum(["prime", "commitment"]);
export type ChangeOrderTargetType = z.infer<typeof changeOrderTargetTypeSchema>;

/**
 * `targetId` is polymorphic on `targetType` (docs/DATA_MODEL.md §9): for
 * `prime` it's a `budget_line_items.id` (this change flows straight into
 * that cost code's approved-changes total on approval); for `commitment`
 * it's a `commitments.id` (a change to that subcontract/PO's value). This
 * mapping isn't spelled out in the original brief -- documented here and in
 * change-management.service.ts as the interpretation used.
 */
export const createChangeOrderSchema = z
  .object({
    projectId: z.string().uuid(),
    title: z.string().max(300).optional(),
    pcoId: z.string().uuid().optional(),
    targetType: changeOrderTargetTypeSchema,
    targetId: z.string().uuid(),
    reason: changeReasonSchema.default("other"),
    costImpact: money,
    timeImpactDays: z.number().int().default(0),
  })
  .strict();
export type CreateChangeOrderInput = z.infer<typeof createChangeOrderSchema>;

export interface ChangeOrderApprovalEntry {
  userId: string;
  companyId: string;
  role: string;
  approvedAt: string;
}

// ---------------------------------------------------------------------------
// Progress billing
// ---------------------------------------------------------------------------

export const paymentApplicationStatusSchema = z.enum(["draft", "submitted", "certified", "paid"]);
export type PaymentApplicationStatus = z.infer<typeof paymentApplicationStatusSchema>;

export const createPaymentApplicationSchema = z
  .object({
    projectId: z.string().uuid(),
    /** null/omitted = a prime-contract (owner) application rather than a subcontractor/PO one. */
    commitmentId: z.string().uuid().optional(),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    retentionPct: z.number().min(0).max(100).default(0),
  })
  .strict();
export type CreatePaymentApplicationInput = z.infer<typeof createPaymentApplicationSchema>;

/**
 * Replace-all pattern (same shape as Daily Log manpower / inspection
 * responses): the caller submits this period's cumulative % complete per
 * SOV line; `pctCompletePrevious` is never sent by the client -- the
 * service derives it from the most recent earlier application against the
 * same commitment, so "previous" can't drift from actual history.
 */
export const setPaymentApplicationLinesSchema = z
  .object({
    lines: z
      .array(
        z.object({
          sovLineId: z.string().uuid(),
          pctCompleteThisPeriod: z.number().min(0).max(100),
        }),
      )
      .max(500),
  })
  .strict();
export type SetPaymentApplicationLinesInput = z.infer<typeof setPaymentApplicationLinesSchema>;

export const transitionPaymentApplicationStatusSchema = z
  .object({
    toStatus: paymentApplicationStatusSchema,
  })
  .strict();
export type TransitionPaymentApplicationStatusInput = z.infer<typeof transitionPaymentApplicationStatusSchema>;

export const PAYMENT_APPLICATION_STATUS_TRANSITIONS: Record<PaymentApplicationStatus, readonly PaymentApplicationStatus[]> = {
  draft: ["submitted"],
  submitted: ["certified", "draft"],
  certified: ["paid"],
  paid: [],
};
