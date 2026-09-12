import { schema, type Database } from "@siteops/db";
import { eq, ne } from "drizzle-orm";
import type { Transporter } from "nodemailer";
import type { Env } from "../env";
import { sendDailyDigestEmail } from "../lib/mailer";

export interface DailyDigestSweepResult {
  usersEmailed: number;
}

/**
 * Emails every user who has at least one open ball-in-court RFI or open
 * assigned punch item a same-shape summary across *all* their projects.
 * Runs as a system sweep against `authDb` (RLS-bypassing), the same
 * pattern as `runRfiOverdueSweep` — there is no single project's request
 * context to scope by here, and no in-process scheduler in this codebase
 * (see that job's doc comment); `POST /internal/daily-digest`
 * (internal-secret gated) is meant to be invoked by an external cron.
 */
export async function runDailyDigestSweep(authDb: Database, mailer: Transporter, env: Env): Promise<DailyDigestSweepResult> {
  const openRfis = await authDb
    .select({
      userId: schema.rfis.ballInCourtUserId,
      email: schema.users.email,
      number: schema.rfis.number,
      subject: schema.rfis.subject,
      projectName: schema.projects.name,
    })
    .from(schema.rfis)
    .innerJoin(schema.users, eq(schema.rfis.ballInCourtUserId, schema.users.id))
    .innerJoin(schema.projects, eq(schema.rfis.projectId, schema.projects.id))
    .where(eq(schema.rfis.status, "open"));

  const openPunchItems = await authDb
    .select({
      userId: schema.punchItems.assigneeUserId,
      email: schema.users.email,
      number: schema.punchItems.number,
      description: schema.punchItems.description,
      projectName: schema.projects.name,
    })
    .from(schema.punchItems)
    .innerJoin(schema.users, eq(schema.punchItems.assigneeUserId, schema.users.id))
    .innerJoin(schema.projects, eq(schema.punchItems.projectId, schema.projects.id))
    .where(ne(schema.punchItems.status, "closed"));

  const byUser = new Map<
    string,
    { email: string; rfis: { number: string; subject: string; projectName: string }[]; punchItems: { number: string; description: string; projectName: string }[] }
  >();

  for (const row of openRfis) {
    if (!row.userId) continue;
    const entry = byUser.get(row.userId) ?? { email: row.email, rfis: [], punchItems: [] };
    entry.rfis.push({ number: row.number, subject: row.subject, projectName: row.projectName });
    byUser.set(row.userId, entry);
  }
  for (const row of openPunchItems) {
    if (!row.userId) continue;
    const entry = byUser.get(row.userId) ?? { email: row.email, rfis: [], punchItems: [] };
    entry.punchItems.push({ number: row.number, description: row.description, projectName: row.projectName });
    byUser.set(row.userId, entry);
  }

  for (const entry of byUser.values()) {
    await sendDailyDigestEmail(mailer, env, { to: entry.email, ballInCourtRfis: entry.rfis, assignedPunchItems: entry.punchItems });
  }

  return { usersEmailed: byUser.size };
}
