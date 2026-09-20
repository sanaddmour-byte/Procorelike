import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import {
  DEFAULT_PAGE_SIZE,
  formatTmTicketNumber,
  requirePermission,
  TM_TICKET_STATUS_TRANSITIONS,
  type CreateTmTicketInput,
  type ListTmTicketsQuery,
  type PaginatedResult,
  type PermissionContext,
  type TmTicketSortKey,
  type TransitionTmTicketStatusInput,
} from "@siteops/shared";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type TmTicketRow = typeof schema.tmTickets.$inferSelect;
type LaborRow = typeof schema.tmTicketLaborEntries.$inferSelect;
type EquipmentRow = typeof schema.tmTicketEquipmentEntries.$inferSelect;
type MaterialRow = typeof schema.tmTicketMaterialEntries.$inferSelect;

export interface TmTicketDetail extends TmTicketRow {
  laborEntries: LaborRow[];
  equipmentEntries: EquipmentRow[];
  materialEntries: MaterialRow[];
  /** Sum of labor/equipment/material line totals -- derived, never stored redundantly (docs/DATA_MODEL.md convention). */
  totalAmount: number;
}

function computeTotal(labor: LaborRow[], equipment: EquipmentRow[], material: MaterialRow[]): number {
  const laborTotal = labor.reduce((sum, l) => sum + Number(l.hours) * Number(l.rate), 0);
  const equipmentTotal = equipment.reduce((sum, e) => sum + Number(e.hours) * Number(e.rate), 0);
  const materialTotal = material.reduce((sum, m) => sum + Number(m.quantity) * Number(m.unitCost), 0);
  return laborTotal + equipmentTotal + materialTotal;
}

export async function createTmTicket(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateTmTicketInput,
): Promise<TmTicketDetail> {
  requirePermission(ctx, "tm_tickets", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const seq = await nextSequenceNumber(tx, input.projectId, "TM");
    const [ticket] = await tx
      .insert(schema.tmTickets)
      .values({
        projectId: input.projectId,
        ticketNumber: formatTmTicketNumber(seq),
        companyId: input.companyId,
        workDate: new Date(input.workDate),
        description: input.description,
        createdBy: userId,
      })
      .returning();
    if (!ticket) throw new Error("Failed to create T&M ticket");

    const laborEntries = input.laborEntries.length
      ? await tx
          .insert(schema.tmTicketLaborEntries)
          .values(input.laborEntries.map((l) => ({ ticketId: ticket.id, ...l, hours: l.hours.toString(), rate: l.rate.toString() })))
          .returning()
      : [];
    const equipmentEntries = input.equipmentEntries.length
      ? await tx
          .insert(schema.tmTicketEquipmentEntries)
          .values(
            input.equipmentEntries.map((e) => ({ ticketId: ticket.id, ...e, hours: e.hours.toString(), rate: e.rate.toString() })),
          )
          .returning()
      : [];
    const materialEntries = input.materialEntries.length
      ? await tx
          .insert(schema.tmTicketMaterialEntries)
          .values(
            input.materialEntries.map((m) => ({
              ticketId: ticket.id,
              ...m,
              quantity: m.quantity.toString(),
              unitCost: m.unitCost.toString(),
            })),
          )
          .returning()
      : [];

    await writeAuditLog(tx, { actorId: userId, entityType: "tm_ticket", entityId: ticket.id, action: "create", after: ticket });
    return { ...ticket, laborEntries, equipmentEntries, materialEntries, totalAmount: computeTotal(laborEntries, equipmentEntries, materialEntries) };
  });
}

/** Peek used by routes to resolve which project a ticket belongs to before loading the full permission context. */
export async function findTmTicketById(appDb: Database, userId: string, ticketId: string): Promise<TmTicketRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.tmTickets).where(eq(schema.tmTickets.id, ticketId)).limit(1);
    return row;
  });
}

export async function getTmTicket(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  ticketId: string,
): Promise<TmTicketDetail | undefined> {
  requirePermission(ctx, "tm_tickets", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [ticket] = await tx.select().from(schema.tmTickets).where(eq(schema.tmTickets.id, ticketId)).limit(1);
    if (!ticket) return undefined;

    const laborEntries = await tx.select().from(schema.tmTicketLaborEntries).where(eq(schema.tmTicketLaborEntries.ticketId, ticketId));
    const equipmentEntries = await tx
      .select()
      .from(schema.tmTicketEquipmentEntries)
      .where(eq(schema.tmTicketEquipmentEntries.ticketId, ticketId));
    const materialEntries = await tx
      .select()
      .from(schema.tmTicketMaterialEntries)
      .where(eq(schema.tmTicketMaterialEntries.ticketId, ticketId));

    return { ...ticket, laborEntries, equipmentEntries, materialEntries, totalAmount: computeTotal(laborEntries, equipmentEntries, materialEntries) };
  });
}

const TM_TICKET_SORT_COLUMNS: Record<
  TmTicketSortKey,
  typeof schema.tmTickets.ticketNumber | typeof schema.tmTickets.description | typeof schema.tmTickets.workDate | typeof schema.tmTickets.status
> = {
  ticketNumber: schema.tmTickets.ticketNumber,
  description: schema.tmTickets.description,
  workDate: schema.tmTickets.workDate,
  status: schema.tmTickets.status,
};

export async function listTmTickets(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  query: ListTmTicketsQuery = {},
): Promise<PaginatedResult<TmTicketRow>> {
  requirePermission(ctx, "tm_tickets", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.tmTickets.projectId, projectId)];

    if (query.status) conditions.push(eq(schema.tmTickets.status, query.status));
    if (query.search) {
      conditions.push(or(ilike(schema.tmTickets.description, `%${query.search}%`), ilike(schema.tmTickets.ticketNumber, `%${query.search}%`))!);
    }
    const where = and(...conditions)!;

    const sortColumn = TM_TICKET_SORT_COLUMNS[query.sort ?? "ticketNumber"];
    const orderFn = query.direction === "desc" ? desc : asc;

    const isPaginated = query.page !== undefined || query.pageSize !== undefined;
    let rowsQuery = tx.select().from(schema.tmTickets).where(where).orderBy(orderFn(sortColumn));
    if (isPaginated) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query.page ?? 1;
      rowsQuery = rowsQuery.limit(pageSize).offset((page - 1) * pageSize) as typeof rowsQuery;
    }

    const [rows, [totalRow]] = await Promise.all([
      rowsQuery,
      tx.select({ value: count() }).from(schema.tmTickets).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  });
}

export async function transitionTmTicketStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  ticketId: string,
  input: TransitionTmTicketStatusInput,
): Promise<TmTicketRow> {
  requirePermission(ctx, "tm_tickets", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.tmTickets).where(eq(schema.tmTickets.id, ticketId)).limit(1);
    if (!existing) throw new NotFoundError("T&M ticket not found");

    const allowed = TM_TICKET_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(409, "invalid_status_transition", `Cannot move a T&M ticket from '${existing.status}' to '${input.toStatus}'`);
    }
    if (input.toStatus === "rejected" && !input.rejectionReason) {
      throw new ApiError(422, "rejection_reason_required", "A rejection reason is required to reject a T&M ticket");
    }

    const [updated] = await tx
      .update(schema.tmTickets)
      .set({
        status: input.toStatus,
        submittedBy: input.toStatus === "submitted" ? userId : existing.submittedBy,
        submittedAt: input.toStatus === "submitted" ? new Date() : existing.submittedAt,
        approvedBy: input.toStatus === "approved" ? userId : existing.approvedBy,
        approvedAt: input.toStatus === "approved" ? new Date() : existing.approvedAt,
        rejectionReason: input.toStatus === "rejected" ? input.rejectionReason : null,
        serverRevision: existing.serverRevision + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(schema.tmTickets.id, ticketId))
      .returning();
    if (!updated) throw new Error("Failed to transition T&M ticket");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "tm_ticket",
      entityId: ticketId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}
