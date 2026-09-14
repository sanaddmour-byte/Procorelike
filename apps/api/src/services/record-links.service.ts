import { schema, withRequestContext, type Database } from "@siteops/db";
import { requirePermission, type Module, type PermissionContext } from "@siteops/shared";
import { and, eq, or } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";

type RecordLinkRow = typeof schema.recordLinks.$inferSelect;

/**
 * record_links is polymorphic and deliberately has no RLS
 * (packages/db/src/sql/001_rls_and_functions.sql's note above the table,
 * an open item since Phase 1) -- scoping happens here instead: creating
 * or listing a link requires "standard"/"read" on whichever module the
 * source or target type belongs to. This does not independently verify
 * the referenced record's project_id matches the caller's project (that
 * would need a per-type lookup); a link only ever exposes an id + type
 * pair, never the underlying record, so a mismatched id just 404s
 * whichever module's own (already-RLS'd) endpoint is used to resolve it.
 */
const LINK_TYPE_MODULES: Record<string, Module> = {
  rfi: "rfis",
  submittal: "submittals",
  punch_item: "punch_list",
  daily_log: "daily_log",
  change_order: "change_management",
  commitment: "commitments",
  tm_ticket: "tm_tickets",
  correspondence: "correspondence",
  schedule_task: "schedule",
  drawing: "drawings",
  /** Spec sections have no module of their own -- they're reference data browsed today only through submittals. */
  specification_section: "submittals",
};

function moduleForLinkType(type: string): Module {
  const module = LINK_TYPE_MODULES[type];
  if (!module) throw new ApiError(400, "validation_error", `Unknown record link type: ${type}`);
  return module;
}

export interface CreateRecordLinkInput {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
}

export async function createRecordLink(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateRecordLinkInput,
): Promise<RecordLinkRow> {
  requirePermission(ctx, moduleForLinkType(input.sourceType), "standard");
  requirePermission(ctx, moduleForLinkType(input.targetType), "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx.insert(schema.recordLinks).values(input).returning();
    if (!row) throw new Error("Failed to create record link");
    return row;
  });
}

/** Removing a link requires "standard" on whichever module the *source* side belongs to -- the same level required to create it. */
export async function deleteRecordLink(appDb: Database, userId: string, ctx: PermissionContext, linkId: string): Promise<void> {
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [link] = await tx.select().from(schema.recordLinks).where(eq(schema.recordLinks.id, linkId)).limit(1);
    if (!link) throw new NotFoundError("Record link not found");
    requirePermission(ctx, moduleForLinkType(link.sourceType), "standard");
    await tx.delete(schema.recordLinks).where(eq(schema.recordLinks.id, linkId));
  });
}

/** Links where the given record is either end -- so "what's linked to this RFI" and "what's linked to this schedule task" both work off one call. */
export async function listRecordLinksFor(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  recordType: string,
  recordId: string,
): Promise<RecordLinkRow[]> {
  requirePermission(ctx, moduleForLinkType(recordType), "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx
      .select()
      .from(schema.recordLinks)
      .where(
        or(
          and(eq(schema.recordLinks.sourceType, recordType), eq(schema.recordLinks.sourceId, recordId)),
          and(eq(schema.recordLinks.targetType, recordType), eq(schema.recordLinks.targetId, recordId)),
        ),
      );
  });
}
