import { z } from "zod";
import { MODULES } from "../constants/modules";
import { PERMISSION_LEVELS } from "../constants/permission-levels";

/**
 * Admin narrowing of a module's hardcoded status-transition machine
 * (RFI_STATUS_TRANSITIONS, PUNCH_ITEM_STATUS_TRANSITIONS, ...). A rule can
 * only make a transition the code already allows stricter -- disable it,
 * or raise the permission level required to perform it above the module's
 * own base check -- never widen the state machine itself. fromStatus/
 * toStatus are plain strings here (not per-module enums) since this
 * schema is shared across modules with different status vocabularies;
 * the service layer validates the pair against the calling module's own
 * transition table before accepting a rule.
 */
export const upsertWorkflowTransitionRuleSchema = z
  .object({
    projectId: z.string().uuid(),
    module: z.enum(MODULES),
    fromStatus: z.string().min(1).max(100),
    toStatus: z.string().min(1).max(100),
    enabled: z.boolean().default(true),
    requiredLevel: z.enum(PERMISSION_LEVELS).default("standard"),
  })
  .strict();
export type UpsertWorkflowTransitionRuleInput = z.infer<typeof upsertWorkflowTransitionRuleSchema>;

export const listWorkflowTransitionRulesQuerySchema = z
  .object({
    projectId: z.string().uuid(),
    module: z.enum(MODULES).optional(),
  })
  .strict();
export type ListWorkflowTransitionRulesQuery = z.infer<typeof listWorkflowTransitionRulesQuerySchema>;

export const deleteWorkflowTransitionRuleSchema = z.object({ projectId: z.string().uuid() }).strict();
export type DeleteWorkflowTransitionRuleInput = z.infer<typeof deleteWorkflowTransitionRuleSchema>;
