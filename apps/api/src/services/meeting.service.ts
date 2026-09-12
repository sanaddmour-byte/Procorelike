import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  requirePermission,
  type CarryForwardMeetingItemInput,
  type CreateMeetingInput,
  type CreateMeetingItemInput,
  type PermissionContext,
  type TransitionMeetingItemStatusInput,
} from "@siteops/shared";
import { eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { createPunchItem } from "./punch-item.service";
import { withUserContext } from "./permission.service";

type MeetingRow = typeof schema.meetings.$inferSelect;
type MeetingItemRow = typeof schema.meetingItems.$inferSelect;

export interface MeetingDetail extends MeetingRow {
  items: MeetingItemRow[];
}

export async function createMeeting(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateMeetingInput,
): Promise<MeetingRow> {
  requirePermission(ctx, "meetings", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.meetings)
      .values({
        projectId: input.projectId,
        title: input.title,
        occurredAt: new Date(input.occurredAt),
        attendees: input.attendees,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create meeting");

    await writeAuditLog(tx, { actorId: userId, entityType: "meeting", entityId: row.id, action: "create", after: row });
    return row;
  });
}

/** Peek used by routes to resolve which project a meeting belongs to before loading the full permission context. */
export async function findMeetingById(appDb: Database, userId: string, meetingId: string): Promise<MeetingRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.meetings).where(eq(schema.meetings.id, meetingId)).limit(1);
    return row;
  });
}

/** Peek used by routes to resolve which project a meeting item's meeting belongs to before loading the full permission context. */
export async function findMeetingItemById(
  appDb: Database,
  userId: string,
  meetingItemId: string,
): Promise<(MeetingItemRow & { projectId: string }) | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx
      .select({ item: schema.meetingItems, projectId: schema.meetings.projectId })
      .from(schema.meetingItems)
      .innerJoin(schema.meetings, eq(schema.meetingItems.meetingId, schema.meetings.id))
      .where(eq(schema.meetingItems.id, meetingItemId))
      .limit(1);
    return row ? { ...row.item, projectId: row.projectId } : undefined;
  });
}

export async function listMeetings(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<MeetingRow[]> {
  requirePermission(ctx, "meetings", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.meetings).where(eq(schema.meetings.projectId, projectId));
  });
}

export async function getMeeting(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  meetingId: string,
): Promise<MeetingDetail | undefined> {
  requirePermission(ctx, "meetings", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [meeting] = await tx.select().from(schema.meetings).where(eq(schema.meetings.id, meetingId)).limit(1);
    if (!meeting) return undefined;
    const items = await tx.select().from(schema.meetingItems).where(eq(schema.meetingItems.meetingId, meetingId));
    return { ...meeting, items };
  });
}

export async function addMeetingItem(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  meetingId: string,
  input: CreateMeetingItemInput,
): Promise<MeetingItemRow> {
  requirePermission(ctx, "meetings", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [meeting] = await tx.select().from(schema.meetings).where(eq(schema.meetings.id, meetingId)).limit(1);
    if (!meeting) throw new NotFoundError("Meeting not found");

    const [row] = await tx
      .insert(schema.meetingItems)
      .values({ meetingId, description: input.description, ownerUserId: input.ownerUserId, status: "open" })
      .returning();
    if (!row) throw new Error("Failed to create meeting item");
    return row;
  });
}

export async function transitionMeetingItemStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  meetingItemId: string,
  input: TransitionMeetingItemStatusInput,
): Promise<MeetingItemRow> {
  requirePermission(ctx, "meetings", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [updated] = await tx
      .update(schema.meetingItems)
      .set({ status: input.toStatus })
      .where(eq(schema.meetingItems.id, meetingItemId))
      .returning();
    if (!updated) throw new NotFoundError("Meeting item not found");
    return updated;
  });
}

/** Copies an unresolved item into a later meeting's agenda, linked back via `carriedForwardFromItemId`. The original item is left untouched -- carrying forward doesn't imply it was resolved. */
export async function carryForwardMeetingItem(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  meetingItemId: string,
  input: CarryForwardMeetingItemInput,
): Promise<MeetingItemRow> {
  requirePermission(ctx, "meetings", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [original] = await tx.select().from(schema.meetingItems).where(eq(schema.meetingItems.id, meetingItemId)).limit(1);
    if (!original) throw new NotFoundError("Meeting item not found");
    const [toMeeting] = await tx.select().from(schema.meetings).where(eq(schema.meetings.id, input.toMeetingId)).limit(1);
    if (!toMeeting) throw new NotFoundError("Target meeting not found");

    const [row] = await tx
      .insert(schema.meetingItems)
      .values({
        meetingId: input.toMeetingId,
        description: original.description,
        ownerUserId: original.ownerUserId,
        status: "open",
        carriedForwardFromItemId: original.id,
      })
      .returning();
    if (!row) throw new Error("Failed to carry forward meeting item");
    return row;
  });
}

/**
 * Creates a real punch item from this meeting item's description and
 * records the link (`convertedToType`/`convertedToId`), then closes the
 * meeting item. `createPunchItem` runs in its own transaction (it's a
 * general-purpose entry point also used by the Punch List module
 * directly) rather than this one, so this is two separate writes, not
 * one atomic operation -- a failure between them would leave a punch item
 * with no recorded back-link. Accepted as a reasonable simplification
 * here; a stricter version would inline punch-item creation into this
 * transaction.
 */
export async function convertMeetingItemToPunchItem(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  meetingItemId: string,
): Promise<MeetingItemRow> {
  requirePermission(ctx, "meetings", "standard");
  const item = await withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx.select().from(schema.meetingItems).where(eq(schema.meetingItems.id, meetingItemId)).limit(1);
    if (!row) throw new NotFoundError("Meeting item not found");
    const [meeting] = await tx.select().from(schema.meetings).where(eq(schema.meetings.id, row.meetingId)).limit(1);
    if (!meeting) throw new Error("Meeting item references a missing meeting");
    return { row, projectId: meeting.projectId };
  });

  const punchItem = await createPunchItem(appDb, userId, ctx, { projectId: item.projectId, description: item.row.description, priority: "medium" });

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [updated] = await tx
      .update(schema.meetingItems)
      .set({ status: "converted", convertedToType: "punch_item", convertedToId: punchItem.id })
      .where(eq(schema.meetingItems.id, meetingItemId))
      .returning();
    if (!updated) throw new Error("Failed to record meeting item conversion");
    return updated;
  });
}
