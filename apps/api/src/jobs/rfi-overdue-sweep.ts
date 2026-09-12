import { schema, type Database } from "@siteops/db";
import { and, eq, isNull, lt } from "drizzle-orm";
import type { Transporter } from "nodemailer";
import type { Env } from "../env";
import { sendRfiEscalationEmail } from "../lib/mailer";

export interface RfiOverdueSweepResult {
  checked: number;
  escalated: number;
}

/**
 * Finds every open, past-due, not-yet-escalated RFI across *all* projects
 * and emails its ball-in-court user once. This runs as a system sweep, not
 * on behalf of any one caller, so it uses `authDb` (RLS-bypassing) the
 * same way the pre-authentication lookups do (docs/ARCHITECTURE.md §3) —
 * there is no per-user request context to scope by here.
 *
 * An RFI addressed only to a company (no `ball_in_court_user_id`) has no
 * specific person to email and is skipped — a real limitation of a
 * single-recipient email model, not silently worked around.
 *
 * Nothing in this codebase calls this on a timer yet: there's no
 * in-process scheduler (flagged in docs/ROADMAP.md's Phase 4 gate report
 * rather than adding cron/BullMQ infrastructure this sandbox can't verify
 * either). `POST /rfis/run-overdue-check` (internal-secret gated) is meant
 * to be invoked by an external cron in a real deployment.
 */
export async function runRfiOverdueSweep(authDb: Database, mailer: Transporter, env: Env): Promise<RfiOverdueSweepResult> {
  const overdueRfis = await authDb
    .select({ rfi: schema.rfis, userEmail: schema.users.email, projectName: schema.projects.name })
    .from(schema.rfis)
    .innerJoin(schema.users, eq(schema.rfis.ballInCourtUserId, schema.users.id))
    .innerJoin(schema.projects, eq(schema.rfis.projectId, schema.projects.id))
    .where(and(eq(schema.rfis.status, "open"), isNull(schema.rfis.escalatedAt), lt(schema.rfis.dueDate, new Date())));

  let escalated = 0;
  for (const row of overdueRfis) {
    if (!row.rfi.dueDate) continue;
    await sendRfiEscalationEmail(mailer, env, {
      to: row.userEmail,
      rfiNumber: row.rfi.number,
      subject: row.rfi.subject,
      projectName: row.projectName,
      dueDate: row.rfi.dueDate,
    });
    await authDb.update(schema.rfis).set({ escalatedAt: new Date() }).where(eq(schema.rfis.id, row.rfi.id));
    escalated++;
  }

  return { checked: overdueRfis.length, escalated };
}
