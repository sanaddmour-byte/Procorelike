import type { Module } from "../constants/modules";
import { FINANCIAL_MODULES } from "../constants/modules";
import type { PermissionLevel } from "../constants/permission-levels";
import { levelAtLeast } from "../constants/permission-levels";
import type { ProjectRole } from "../constants/roles";

export type ModuleLevels = Partial<Record<Module, PermissionLevel>>;

export interface PermissionContext {
  role: ProjectRole;
  /** Default levels per module from the user's assigned permission_templates row. */
  templateLevels: ModuleLevels;
  /** Per-user, per-project overrides from project_user_permissions. Wins over the template when present. */
  overrides: ModuleLevels;
}

/**
 * Resolves the effective permission level for a module, applying overrides
 * over the template default, then the hard rules that no template or
 * override may loosen (client_viewer is never granted financial access,
 * regardless of what a misconfigured template/override says).
 */
export function resolveEffectiveLevel(ctx: PermissionContext, module: Module): PermissionLevel {
  const base = ctx.overrides[module] ?? ctx.templateLevels[module] ?? "none";

  if (ctx.role === "client_viewer" && FINANCIAL_MODULES.includes(module)) {
    return "none";
  }

  return base;
}

export function hasPermission(
  ctx: PermissionContext,
  module: Module,
  required: PermissionLevel,
): boolean {
  return levelAtLeast(resolveEffectiveLevel(ctx, module), required);
}

export class PermissionDeniedError extends Error {
  constructor(
    public readonly module: Module,
    public readonly required: PermissionLevel,
  ) {
    super(`Permission denied: requires '${required}' on module '${module}'`);
    this.name = "PermissionDeniedError";
  }
}

/** Throws PermissionDeniedError when the caller lacks the required level. Server-side call sites should always use this rather than the boolean form silently. */
export function requirePermission(
  ctx: PermissionContext,
  module: Module,
  required: PermissionLevel,
): void {
  if (!hasPermission(ctx, module, required)) {
    throw new PermissionDeniedError(module, required);
  }
}

export interface SubcontractorScopeRecord {
  assigneeCompanyId?: string | null;
  ballInCourtCompanyId?: string | null;
  distributionCompanyIds?: readonly string[];
}

/**
 * A subcontractor may only see records where their company is the assignee,
 * the ball-in-court, or an explicit distribution recipient. Other roles are
 * unrestricted by this rule (module-level permission still applies
 * separately). This mirrors the RLS policy branch described in
 * docs/DATA_MODEL.md §10 — used to unit-test the rule and to pre-filter in
 * application code before the DB round-trip.
 */
export function subcontractorCanSeeRecord(
  role: ProjectRole,
  subcontractorCompanyId: string,
  record: SubcontractorScopeRecord,
): boolean {
  if (role !== "subcontractor") return true;

  return (
    record.assigneeCompanyId === subcontractorCompanyId ||
    record.ballInCourtCompanyId === subcontractorCompanyId ||
    (record.distributionCompanyIds?.includes(subcontractorCompanyId) ?? false)
  );
}
