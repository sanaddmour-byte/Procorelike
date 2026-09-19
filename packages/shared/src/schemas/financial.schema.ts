import { z } from "zod";
import { paginationQuerySchema } from "./list-query.schema";

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

/** approvedChangesAmount is deliberately not editable here -- it's system-managed, bumped only by an approved 'prime' change order (see change-management.service.ts). modificationsAmount is likewise not editable directly -- only via createBudgetModificationSchema below. */
export const updateBudgetLineItemSchema = z
  .object({
    originalAmount: money.optional(),
    forecastToComplete: money.optional(),
  })
  .strict();
export type UpdateBudgetLineItemInput = z.infer<typeof updateBudgetLineItemSchema>;

/** Procore's Budget Modification: transfers `amount` from one line item to another on the same project, netting to zero on the total budget -- unlike a change order, which changes the overall contract value. */
export const createBudgetModificationSchema = z
  .object({
    projectId: z.string().uuid(),
    fromLineItemId: z.string().uuid(),
    toLineItemId: z.string().uuid(),
    amount: z.number().positive(),
    reason: z.string().max(2000).optional(),
  })
  .strict()
  .refine((data) => data.fromLineItemId !== data.toLineItemId, {
    message: "fromLineItemId and toLineItemId must differ",
    path: ["toLineItemId"],
  });
export type CreateBudgetModificationInput = z.infer<typeof createBudgetModificationSchema>;

// ---------------------------------------------------------------------------
// Commitments
// ---------------------------------------------------------------------------

export const commitmentTypeSchema = z.enum(["subcontract", "po"]);
export type CommitmentType = z.infer<typeof commitmentTypeSchema>;

export const COMMITMENT_SORT_KEYS = ["number", "title", "type"] as const;
export type CommitmentSortKey = (typeof COMMITMENT_SORT_KEYS)[number];

/** GET /commitments's query contract (Phase 22, same shape as rfi.schema.ts's listRfisQuerySchema from Phase 21). Commitments have no status field, so `type` (subcontract/po) is the closest analog filter; search matches number/title only -- unlike the page's prior client-side search, it does not match the joined company name. */
export const listCommitmentsQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(COMMITMENT_SORT_KEYS).optional(),
    type: commitmentTypeSchema.optional(),
    companyId: z.string().uuid().optional(),
  })
  .strict();
export type ListCommitmentsQuery = z.infer<typeof listCommitmentsQuerySchema>;

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

export const CHANGE_ORDER_SORT_KEYS = ["number", "title", "status", "costImpact"] as const;
export type ChangeOrderSortKey = (typeof CHANGE_ORDER_SORT_KEYS)[number];

/** GET /change-orders's query contract (Phase 22, same shape as rfi.schema.ts's listRfisQuerySchema from Phase 21). */
export const listChangeOrdersQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(CHANGE_ORDER_SORT_KEYS).optional(),
    status: changeStatusSchema.optional(),
  })
  .strict();
export type ListChangeOrdersQuery = z.infer<typeof listChangeOrdersQuerySchema>;

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

// ---------------------------------------------------------------------------
// Prime Contract
// ---------------------------------------------------------------------------

export const primeContractStatusSchema = z.enum(["draft", "executed", "closed"]);
export type PrimeContractStatus = z.infer<typeof primeContractStatusSchema>;

export const PRIME_CONTRACT_STATUS_TRANSITIONS: Record<PrimeContractStatus, readonly PrimeContractStatus[]> = {
  draft: ["executed"],
  executed: ["closed"],
  closed: [],
};

/** One per project (enforced by a unique index on projectId) -- the owner agreement itself, distinct from the internal Budget and from Commitments. */
export const createPrimeContractSchema = z
  .object({
    projectId: z.string().uuid(),
    contractNumber: z.string().min(1).max(50),
    title: z.string().min(1).max(300),
    ownerCompanyId: z.string().uuid(),
    originalContractSum: money.default(0),
    retentionPct: z.number().min(0).max(100).default(0),
    currency: currencyCode,
  })
  .strict();
export type CreatePrimeContractInput = z.infer<typeof createPrimeContractSchema>;

export const updatePrimeContractSchema = z
  .object({
    contractNumber: z.string().min(1).max(50).optional(),
    title: z.string().min(1).max(300).optional(),
    originalContractSum: money.optional(),
    retentionPct: z.number().min(0).max(100).optional(),
    executedDate: z.string().date().optional(),
  })
  .strict();
export type UpdatePrimeContractInput = z.infer<typeof updatePrimeContractSchema>;

export const transitionPrimeContractStatusSchema = z
  .object({
    toStatus: primeContractStatusSchema,
  })
  .strict();
export type TransitionPrimeContractStatusInput = z.infer<typeof transitionPrimeContractStatusSchema>;

// ---------------------------------------------------------------------------
// Direct Costs
// ---------------------------------------------------------------------------

export const directCostTypeSchema = z.enum(["invoice", "expense", "payroll", "other"]);
export type DirectCostType = z.infer<typeof directCostTypeSchema>;

export const directCostStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type DirectCostStatus = z.infer<typeof directCostStatusSchema>;

/** A cost that hits a budget cost code without going through a commitment (subcontract/PO) -- a permit fee, owner-purchased material, payroll allocation, etc. */
export const createDirectCostSchema = z
  .object({
    projectId: z.string().uuid(),
    costCodeId: z.string().uuid(),
    vendorCompanyId: z.string().uuid().optional(),
    type: directCostTypeSchema.default("invoice"),
    description: z.string().min(1).max(300),
    amount: money,
    incurredDate: z.string().date(),
  })
  .strict();
export type CreateDirectCostInput = z.infer<typeof createDirectCostSchema>;

export const transitionDirectCostStatusSchema = z
  .object({
    toStatus: z.enum(["approved", "rejected"]),
  })
  .strict();
export type TransitionDirectCostStatusInput = z.infer<typeof transitionDirectCostStatusSchema>;
