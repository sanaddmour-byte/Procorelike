import { schema } from "@siteops/db";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 11c (look-ahead, constraint log, PPC/Last Planner, progress
 * capture with planner acceptance) integration tests -- the self-defined
 * gate: a look-ahead plan with a commitment a subcontractor confirms and
 * later misses (PPC reflects it), a field progress update that only
 * changes the schedule once a planner accepts it (never on submission),
 * a constraint log entry, and a delay register entry.
 *
 * Uses the Zarqa project (not Amman Heights, which apps/api/src/routes/
 * cpm-schedule.test.ts already owns and resets) so this file's own
 * schedule reset doesn't race that one.
 */

const SEED_PASSWORD = "ChangeMe123!";

let app: Express;
let clients: ApiDbClients;
let projectId: string;

/** The one daily log this file's own test creates, cleaned up alongside the schedule so re-running the suite doesn't hit its (project_id, log_date) unique constraint. */
async function resetTestDailyLog(): Promise<void> {
  const [log] = await clients.authDb.db
    .select()
    .from(schema.dailyLogs)
    .where(and(eq(schema.dailyLogs.projectId, projectId), eq(schema.dailyLogs.logDate, new Date("2026-01-10"))))
    .limit(1);
  if (!log) return;
  await clients.authDb.db.delete(schema.dailyLogDelays).where(eq(schema.dailyLogDelays.dailyLogId, log.id));
  await clients.authDb.db.delete(schema.dailyLogs).where(eq(schema.dailyLogs.id, log.id));
}

async function resetProjectSchedule(): Promise<void> {
  await resetTestDailyLog();
  const [existing] = await clients.authDb.db.select().from(schema.schedules).where(eq(schema.schedules.projectId, projectId)).limit(1);
  if (!existing) return;
  const versions = await clients.authDb.db.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.scheduleId, existing.id));
  const versionIds = versions.map((v) => v.id);
  if (versionIds.length > 0) {
    const tasks = await clients.authDb.db.select().from(schema.cpmScheduleTasks).where(inArray(schema.cpmScheduleTasks.versionId, versionIds));
    const taskIds = tasks.map((t) => t.id);
    if (taskIds.length > 0) {
      await clients.authDb.db.update(schema.dailyLogDelays).set({ scheduleTaskId: null }).where(inArray(schema.dailyLogDelays.scheduleTaskId, taskIds));
      await clients.authDb.db.delete(schema.scheduleProgressUpdates).where(inArray(schema.scheduleProgressUpdates.taskId, taskIds));
      await clients.authDb.db.delete(schema.scheduleConstraints).where(inArray(schema.scheduleConstraints.taskId, taskIds));
      const commitments = await clients.authDb.db
        .select()
        .from(schema.lookaheadCommitments)
        .where(inArray(schema.lookaheadCommitments.taskId, taskIds));
      if (commitments.length > 0) {
        await clients.authDb.db.delete(schema.lookaheadCommitments).where(
          inArray(
            schema.lookaheadCommitments.id,
            commitments.map((c) => c.id),
          ),
        );
      }
      await clients.authDb.db.delete(schema.taskDependencies).where(inArray(schema.taskDependencies.successorId, taskIds));
      await clients.authDb.db.delete(schema.recordLinks).where(inArray(schema.recordLinks.targetId, taskIds));
      await clients.authDb.db.delete(schema.cpmScheduleTasks).where(inArray(schema.cpmScheduleTasks.id, taskIds));
    }
    await clients.authDb.db.delete(schema.scheduleVersions).where(inArray(schema.scheduleVersions.id, versionIds));
  }
  await clients.authDb.db.delete(schema.lookaheadPlans).where(eq(schema.lookaheadPlans.projectId, projectId));
  await clients.authDb.db.delete(schema.calendars).where(eq(schema.calendars.projectId, projectId));
  await clients.authDb.db.delete(schema.schedules).where(eq(schema.schedules.id, existing.id));
}

async function loginAs(email: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password: SEED_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

/** A small, hand-generated P6 XER: one WBS node + three sequential FS-chained activities. */
function generateSmallXer(): string {
  const lines: string[] = [];
  lines.push("ERMHDR\t21.12\t2026-01-01\tProject\tadmin\tadmin\tdbxDatabaseNoName\tProject Management\tUSD");
  lines.push("%T\tPROJECT");
  lines.push("%F\tproj_id\tproj_short_name\tlast_recalc_date");
  lines.push("%R\tP1\tZARQA-LA\t2026-01-01");
  lines.push("%T\tCALENDAR");
  lines.push("%F\tclndr_id\tclndr_name\tdefault_flag");
  lines.push("%R\tC1\tStandard Sun-Thu\tY");
  lines.push("%T\tPROJWBS");
  lines.push("%F\twbs_id\twbs_name\twbs_short_name\tparent_wbs_id");
  lines.push("%R\tW1\tPipeline Trenching\t1\t");
  lines.push("%T\tTASK");
  lines.push(
    "%F\ttask_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt\ttarget_start_date\ttarget_end_date\ttotal_float_hr_cnt\tfree_float_hr_cnt\tphys_complete_pct",
  );
  lines.push("%R\tT1\tW1\tC1\tA1000\tMobilize crew\tTT_Task\t8\t2026-01-05\t2026-01-06\t0\t0\t100");
  lines.push("%R\tT2\tW1\tC1\tA1001\tExcavation\tTT_Task\t40\t2026-01-07\t2026-01-14\t0\t0\t0");
  lines.push("%R\tT3\tW1\tC1\tA1002\tPipe laying\tTT_Task\t40\t2026-01-15\t2026-01-22\t0\t0\t0");
  lines.push("%T\tTASKPRED");
  lines.push("%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt");
  lines.push("%R\tL1\tT2\tT1\tPR_FS\t0");
  lines.push("%R\tL2\tT3\tT2\tPR_FS\t0");
  lines.push("%E");
  return lines.join("\n");
}

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const saraToken = await loginAs("sara.haddad@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${saraToken}`);
  const zarqa = (projectsRes.body as { id: string; name: string }[]).find((p) => p.name.startsWith("Zarqa"));
  if (!zarqa) throw new Error("Zarqa project not found in seed data");
  projectId = zarqa.id;

  await resetProjectSchedule();
});

afterAll(async () => {
  await resetProjectSchedule();
  await clients.authDb.queryClient.end();
  await clients.appDb.queryClient.end();
});

describe("Look-ahead, PPC, constraints, progress capture (Phase 11c gate)", () => {
  it("runs the full look-ahead + PPC + progress-capture round trip", async () => {
    const saraToken = await loginAs("sara.haddad@siteops.test");
    const mahmoudToken = await loginAs("mahmoud.tarawneh@siteops.test");
    const structuraCompanyId = "f04fe9cc-0c71-4a8f-912a-614213d537f5";

    // -- Import a small schedule --
    const importRes = await request(app)
      .post("/schedules/import")
      .set("authorization", `Bearer ${saraToken}`)
      .send({ projectId, sourceTool: "p6_xer", fileText: generateSmallXer() });
    expect(importRes.status).toBe(201);

    const currentRes = await request(app).get(`/schedules/current?projectId=${projectId}`).set("authorization", `Bearer ${saraToken}`);
    expect(currentRes.status).toBe(200);
    const tasks = currentRes.body.tasks as { id: string; name: string; percentComplete: number }[];
    const excavation = tasks.find((t) => t.name === "Excavation")!;
    const pipeLaying = tasks.find((t) => t.name === "Pipe laying")!;
    expect(excavation).toBeDefined();
    expect(pipeLaying).toBeDefined();

    // -- Ad-hoc look-ahead view (no saved plan needed to just view it) --
    const viewRes = await request(app)
      .get(`/lookahead/view?projectId=${projectId}&weekStart=2026-01-05&horizonWeeks=3`)
      .set("authorization", `Bearer ${saraToken}`);
    expect(viewRes.status).toBe(200);
    expect(viewRes.body.taskIds).toEqual(expect.arrayContaining([excavation.id, pipeLaying.id]));

    // -- Company name lookup works for a foreman, who has no financial-module access (the endpoint that would otherwise 403 them) --
    const companiesRes = await request(app).get(`/lookahead/companies?projectId=${projectId}`).set("authorization", `Bearer ${mahmoudToken}`);
    expect(companiesRes.status).toBe(200);
    expect((companiesRes.body as { companyId: string }[]).map((c) => c.companyId)).toContain(structuraCompanyId);

    // -- Publish a look-ahead plan, add a commitment --
    const planRes = await request(app)
      .post("/lookahead/plans")
      .set("authorization", `Bearer ${saraToken}`)
      .send({ projectId, weekStart: "2026-01-05", horizonWeeks: 3 });
    expect(planRes.status).toBe(201);
    const planId = planRes.body.id as string;

    const commitmentRes = await request(app)
      .post("/lookahead/commitments")
      .set("authorization", `Bearer ${saraToken}`)
      .send({ lookaheadPlanId: planId, taskId: excavation.id, promisedFinish: "2026-01-14", committedByCompanyId: structuraCompanyId });
    expect(commitmentRes.status).toBe(201);
    const commitmentId = commitmentRes.body.id as string;
    expect(commitmentRes.body.status).toBe("promised");

    // -- Confirm/decline is company-scoped, not just permission-level-scoped --
    const wrongCompanyConfirm = await request(app)
      .post(`/lookahead/commitments/${commitmentId}/confirm`)
      .set("authorization", `Bearer ${saraToken}`)
      .send();
    expect(wrongCompanyConfirm.status).toBe(403);

    const confirmRes = await request(app)
      .post(`/lookahead/commitments/${commitmentId}/confirm`)
      .set("authorization", `Bearer ${mahmoudToken}`) // Structura Concrete Co., same company as the commitment
      .send();
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe("confirmed");

    // -- Record a late actual finish; PPC should reflect one missed commitment --
    const actualRes = await request(app)
      .post(`/lookahead/commitments/${commitmentId}/actual`)
      .set("authorization", `Bearer ${saraToken}`)
      .send({ actualFinish: "2026-01-16", reasonCode: "weather" });
    expect(actualRes.status).toBe(200);

    const ppcRes = await request(app).get(`/lookahead/plans/${planId}/ppc`).set("authorization", `Bearer ${saraToken}`);
    expect(ppcRes.status).toBe(200);
    const structuraPpc = ppcRes.body.find((p: { companyId: string }) => p.companyId === structuraCompanyId);
    expect(structuraPpc).toEqual({ companyId: structuraCompanyId, met: 0, missed: 1, pending: 0, ppcPercent: 0 });

    // -- Progress update: submitted by a foreman (read-level), never mutates until a planner accepts --
    const submitRes = await request(app)
      .post("/schedule-progress-updates")
      .set("authorization", `Bearer ${mahmoudToken}`)
      .send({ taskId: excavation.id, proposedPercentComplete: 75, note: "Trench dug to station 4+50" });
    expect(submitRes.status).toBe(201);
    const updateId = submitRes.body.id as string;
    expect(submitRes.body.status).toBe("pending");

    const unchangedAfterSubmit = await request(app).get(`/schedules/current?projectId=${projectId}`).set("authorization", `Bearer ${saraToken}`);
    const excavationStillZero = (unchangedAfterSubmit.body.tasks as typeof tasks).find((t) => t.id === excavation.id)!;
    expect(excavationStillZero.percentComplete).toBe(0); // the phone submission alone changed nothing

    const foremanAcceptAttempt = await request(app)
      .post(`/schedule-progress-updates/${updateId}/accept`)
      .set("authorization", `Bearer ${mahmoudToken}`)
      .send();
    expect(foremanAcceptAttempt.status).toBe(403); // schedule:read can submit, not accept

    const queueRes = await request(app).get(`/schedule-progress-updates?projectId=${projectId}`).set("authorization", `Bearer ${saraToken}`);
    expect(queueRes.status).toBe(200);
    expect(queueRes.body.map((u: { id: string }) => u.id)).toContain(updateId);

    const acceptRes = await request(app)
      .post(`/schedule-progress-updates/${updateId}/accept`)
      .set("authorization", `Bearer ${saraToken}`)
      .send();
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe("accepted");

    const afterAcceptRes = await request(app).get(`/schedules/current?projectId=${projectId}`).set("authorization", `Bearer ${saraToken}`);
    const excavationNow = (afterAcceptRes.body.tasks as typeof tasks).find((t) => t.id === excavation.id)!;
    expect(excavationNow.percentComplete).toBe(75); // now it actually changed

    const doubleAccept = await request(app).post(`/schedule-progress-updates/${updateId}/accept`).set("authorization", `Bearer ${saraToken}`).send();
    expect(doubleAccept.status).toBe(409);

    // -- A rejected update leaves the task untouched --
    const secondSubmit = await request(app)
      .post("/schedule-progress-updates")
      .set("authorization", `Bearer ${mahmoudToken}`)
      .send({ taskId: excavation.id, proposedPercentComplete: 100 });
    expect(secondSubmit.status).toBe(201);
    const rejectRes = await request(app)
      .post(`/schedule-progress-updates/${secondSubmit.body.id}/reject`)
      .set("authorization", `Bearer ${saraToken}`)
      .send({ rejectionReason: "Not actually complete per site walk" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe("rejected");

    const afterRejectRes = await request(app).get(`/schedules/current?projectId=${projectId}`).set("authorization", `Bearer ${saraToken}`);
    const excavationAfterReject = (afterRejectRes.body.tasks as typeof tasks).find((t) => t.id === excavation.id)!;
    expect(excavationAfterReject.percentComplete).toBe(75); // unchanged by the rejected update

    // -- Progress update, submitted entirely offline via sync/push (the mobile round trip) --
    const offlineLocalId = randomUUID();
    const offlinePushRes = await request(app)
      .post("/sync/push")
      .set("authorization", `Bearer ${mahmoudToken}`)
      .send({
        projectId,
        entityType: "schedule_progress_update",
        records: [
          {
            localId: offlineLocalId,
            baseRevision: null,
            base: null,
            data: { taskId: pipeLaying.id, proposedPercentComplete: 30, note: "Submitted while offline" },
          },
        ],
      });
    expect(offlinePushRes.status).toBe(200);
    expect(offlinePushRes.body.results[0].status).toBe("applied");

    // Retrying the same push (device retries before it saw the response) is an idempotent no-op, not a duplicate.
    const offlineRetryRes = await request(app)
      .post("/sync/push")
      .set("authorization", `Bearer ${mahmoudToken}`)
      .send({
        projectId,
        entityType: "schedule_progress_update",
        records: [{ localId: offlineLocalId, baseRevision: null, base: null, data: { taskId: pipeLaying.id, proposedPercentComplete: 30 } }],
      });
    expect(offlineRetryRes.body.results[0].status).toBe("applied");

    const offlinePullRes = await request(app)
      .get("/sync/pull")
      .query({ projectId, entityType: "schedule_progress_update", since: 0 })
      .set("authorization", `Bearer ${saraToken}`);
    expect(offlinePullRes.status).toBe(200);
    expect(offlinePullRes.body.records.some((r: { id: string }) => r.id === offlineLocalId)).toBe(true);

    // It shows up in the planner's normal acceptance queue and accepts exactly like a web-submitted one.
    const offlineQueueRes = await request(app).get(`/schedule-progress-updates?projectId=${projectId}`).set("authorization", `Bearer ${saraToken}`);
    expect(offlineQueueRes.body.map((u: { id: string }) => u.id)).toContain(offlineLocalId);

    const offlineAcceptRes = await request(app)
      .post(`/schedule-progress-updates/${offlineLocalId}/accept`)
      .set("authorization", `Bearer ${saraToken}`)
      .send();
    expect(offlineAcceptRes.status).toBe(200);

    const afterOfflineAcceptRes = await request(app).get(`/schedules/current?projectId=${projectId}`).set("authorization", `Bearer ${saraToken}`);
    const pipeLayingNow = (afterOfflineAcceptRes.body.tasks as typeof tasks).find((t) => t.id === pipeLaying.id)!;
    expect(pipeLayingNow.percentComplete).toBe(30);

    // -- Constraint log --
    const constraintRes = await request(app)
      .post("/schedule-constraints")
      .set("authorization", `Bearer ${saraToken}`)
      .send({ taskId: pipeLaying.id, category: "material", description: "Pipe delivery pending customs clearance", needByDate: "2026-01-15" });
    expect(constraintRes.status).toBe(201);
    const constraintId = constraintRes.body.id as string;

    const consultantToken = await loginAs("nadia.qutub@siteops.test"); // schedule:read only -- cannot create a constraint
    const consultantCreateAttempt = await request(app)
      .post("/schedule-constraints")
      .set("authorization", `Bearer ${consultantToken}`)
      .send({ taskId: pipeLaying.id, category: "access", description: "should be blocked", needByDate: "2026-01-15" });
    expect(consultantCreateAttempt.status).toBe(403);

    const constraintsListRes = await request(app).get(`/schedule-constraints?projectId=${projectId}`).set("authorization", `Bearer ${saraToken}`);
    expect(constraintsListRes.status).toBe(200);
    expect(constraintsListRes.body.map((c: { id: string }) => c.id)).toContain(constraintId);

    const clearRes = await request(app).post(`/schedule-constraints/${constraintId}/clear`).set("authorization", `Bearer ${saraToken}`).send();
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.status).toBe("cleared");

    // -- Delay register: a daily-log delay linked to a schedule task --
    const dailyLogRes = await request(app)
      .post("/daily-logs")
      .set("authorization", `Bearer ${saraToken}`)
      .send({
        projectId,
        logDate: "2026-01-10",
        delays: [{ causeCode: "weather", description: "Rain halted excavation", hoursImpact: 4, scheduleTaskId: excavation.id }],
      });
    expect(dailyLogRes.status).toBe(201);

    const delayRegisterRes = await request(app).get(`/lookahead/delays?projectId=${projectId}`).set("authorization", `Bearer ${saraToken}`);
    expect(delayRegisterRes.status).toBe(200);
    const excavationDelay = delayRegisterRes.body.find((d: { taskId: string }) => d.taskId === excavation.id);
    expect(excavationDelay).toBeDefined();
    expect(excavationDelay.totalHoursImpact).toBeGreaterThanOrEqual(4);
  });
});
