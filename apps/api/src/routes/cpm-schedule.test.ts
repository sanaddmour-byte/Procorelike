import { schema } from "@siteops/db";
import { eq, inArray } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 11a (Scheduling & Gantt: data model, calendars, importers)
 * integration tests -- the Phase 11a self-defined gate: "import a real
 * 1,000+ task P6 file, re-import a revised version, prove existing RFI
 * links survive." Preconditions: docker-compose Postgres migrated +
 * seeded (same as apps/api/src/routes/integration.test.ts).
 */

const SEED_PASSWORD = "ChangeMe123!";

let app: Express;
let clients: ApiDbClients;
let projectId: string;

/**
 * Unlike every other test file in this suite, this one asserts on an
 * absolute version sequence (v1, then v2) rather than uniquely-named
 * records -- `schedules` is one row per project, so a prior run's data
 * would otherwise make a re-run start at v3, v5, etc. Deletes any
 * schedule state left by a previous run before testing, in FK-safe
 * child-to-parent order, via the RLS-bypassing authDb connection.
 */
async function resetProjectSchedule(): Promise<void> {
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
      await clients.authDb.db.delete(schema.lookaheadCommitments).where(inArray(schema.lookaheadCommitments.taskId, taskIds));
      await clients.authDb.db.delete(schema.taskDependencies).where(inArray(schema.taskDependencies.successorId, taskIds));
      await clients.authDb.db.delete(schema.recordLinks).where(inArray(schema.recordLinks.targetId, taskIds));
      await clients.authDb.db.delete(schema.cpmScheduleTasks).where(inArray(schema.cpmScheduleTasks.id, taskIds));
    }
    await clients.authDb.db.delete(schema.lookaheadPlans).where(eq(schema.lookaheadPlans.projectId, projectId));
    await clients.authDb.db.delete(schema.scheduleVersions).where(inArray(schema.scheduleVersions.id, versionIds));
  }
  await clients.authDb.db.delete(schema.calendars).where(eq(schema.calendars.projectId, projectId));
  await clients.authDb.db.delete(schema.schedules).where(eq(schema.schedules.id, existing.id));
}

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const token = await loginAs("omar.nassar@siteops.test");
  const res = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = res.body[0].id as string;

  await resetProjectSchedule();
});

afterAll(async () => {
  await resetProjectSchedule();
  await clients.authDb.queryClient.end();
  await clients.appDb.queryClient.end();
});

async function loginAs(email: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password: SEED_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

/**
 * A synthetic P6 XER schedule -- generated rather than a committed real
 * export (none was available to this build; see the Phase 11a gate
 * report) -- of `taskCount` sequential activities chained by
 * finish-to-start dependencies under one WBS node, so the diff/re-import
 * path is exercised at the scale the gate specifies. `mutate` lets a
 * second call produce a "revised" version: shifted dates, changed
 * progress, a removed task, an added task.
 */
function generateXer(taskCount: number, options: { mutate?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push("ERMHDR\t21.12\t2026-01-01\tProject\tadmin\tadmin\tdbxDatabaseNoName\tProject Management\tUSD");
  lines.push("%T\tPROJECT");
  lines.push("%F\tproj_id\tproj_short_name\tlast_recalc_date");
  lines.push(`%R\tP1\tSCALE-TEST\t${options.mutate ? "2026-03-01" : "2026-01-01"}`);
  lines.push("%T\tCALENDAR");
  lines.push("%F\tclndr_id\tclndr_name\tdefault_flag");
  lines.push("%R\tC1\tStandard Sun-Thu\tY");
  lines.push("%T\tPROJWBS");
  lines.push("%F\twbs_id\twbs_name\twbs_short_name\tparent_wbs_id");
  lines.push("%R\tW1\tScale Test Root\t1\t");

  const effectiveCount = options.mutate ? taskCount - 1 : taskCount; // one task dropped on re-import
  lines.push("%T\tTASK");
  lines.push(
    "%F\ttask_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt\ttarget_start_date\ttarget_end_date\ttotal_float_hr_cnt\tfree_float_hr_cnt\tphys_complete_pct",
  );
  for (let i = 1; i <= effectiveCount; i++) {
    const dayOffset = i + (options.mutate && i > effectiveCount - 100 ? 10 : 0); // last 100 surviving tasks shift 10 days later on re-import
    const start = new Date(Date.UTC(2026, 0, dayOffset));
    const end = new Date(Date.UTC(2026, 0, dayOffset + 1));
    const pct = options.mutate ? Math.min(100, i % 10 === 0 ? 100 : 0) : i % 10 === 0 ? 50 : 0;
    lines.push(
      `%R\tT${i}\tW1\tC1\tA${1000 + i}\tActivity ${i}\tTT_Task\t8\t${start.toISOString().slice(0, 10)}\t${end.toISOString().slice(0, 10)}\t0\t0\t${pct}`,
    );
  }
  if (options.mutate) {
    // A brand-new task added in the revised version.
    const newId = taskCount + 1;
    lines.push(`%R\tT${newId}\tW1\tC1\tA${1000 + newId}\tNewly added activity\tTT_Task\t8\t2026-02-01\t2026-02-02\t0\t0\t0`);
  }

  lines.push("%T\tTASKPRED");
  lines.push("%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt");
  for (let i = 2; i <= effectiveCount; i++) {
    lines.push(`%R\tL${i}\tT${i}\tT${i - 1}\tPR_FS\t0`);
  }
  lines.push("%E");
  return lines.join("\n");
}

describe("Scheduling & Gantt import (Phase 11a gate)", () => {
  it("imports a 1,000+ task P6 XER file, re-imports a revised version, and diffs correctly", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const TASK_COUNT = 1200;

    const firstXer = generateXer(TASK_COUNT);
    const start = Date.now();
    const importRes = await request(app)
      .post("/schedules/import")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sourceTool: "p6_xer", fileText: firstXer });
    const elapsedMs = Date.now() - start;

    expect(importRes.status).toBe(201);
    expect(importRes.body.version.versionNo).toBe(1);
    // 1 WBS node + TASK_COUNT activities.
    expect(importRes.body.taskCount).toBe(TASK_COUNT + 1);
    expect(importRes.body.diff).toBeUndefined(); // first import, nothing to diff against
    expect(elapsedMs).toBeLessThan(10_000); // docs/SCHEDULING.md A2's 5,000-task/10s bar, at this phase's smaller scale

    const scheduleId = importRes.body.schedule.id as string;
    const firstVersionId = importRes.body.version.id as string;

    const tasksRes = await request(app)
      .get(`/schedules/versions/${firstVersionId}/tasks`)
      .set("authorization", `Bearer ${token}`);
    expect(tasksRes.status).toBe(200);
    expect(tasksRes.body.tasks).toHaveLength(TASK_COUNT + 1);
    expect(tasksRes.body.dependencies.length).toBeGreaterThan(TASK_COUNT - 5);

    // Link an RFI to one specific activity in this first version.
    const targetTask = tasksRes.body.tasks.find((t: { externalId: string }) => t.externalId === "T500");
    expect(targetTask).toBeDefined();

    const rfiRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, subject: "Impact of activity T500 on scope", question: "Does this activity affect the RFI'd scope?" });
    expect(rfiRes.status).toBe(201);
    const rfiId = rfiRes.body.id as string;

    const linkRes = await request(app)
      .post("/record-links")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sourceType: "rfi", sourceId: rfiId, targetType: "schedule_task", targetId: targetTask.id });
    expect(linkRes.status).toBe(201);
    const linkId = linkRes.body.id as string;

    // Re-import a revised version: one task removed, one added, the last
    // 100 surviving tasks' dates shifted 10 days later, and every 10th
    // task's progress changed.
    const revisedXer = generateXer(TASK_COUNT, { mutate: true });
    const reimportRes = await request(app)
      .post("/schedules/import")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sourceTool: "p6_xer", fileText: revisedXer });
    expect(reimportRes.status).toBe(201);
    expect(reimportRes.body.version.versionNo).toBe(2);
    expect(reimportRes.body.schedule.id).toBe(scheduleId);

    const diff = reimportRes.body.diff;
    expect(diff).toBeDefined();
    expect(diff.added).toHaveLength(1); // the newly added activity
    expect(diff.removed).toHaveLength(1); // the dropped activity (the old last task)
    expect(diff.reDated.length).toBeGreaterThan(0);
    expect(diff.progressChanged.length).toBeGreaterThan(0);

    const secondVersionId = reimportRes.body.version.id as string;
    const secondTasksRes = await request(app)
      .get(`/schedules/versions/${secondVersionId}/tasks`)
      .set("authorization", `Bearer ${token}`);
    const newTargetTask = secondTasksRes.body.tasks.find((t: { externalId: string }) => t.externalId === "T500");
    expect(newTargetTask).toBeDefined();
    expect(newTargetTask.id).not.toBe(targetTask.id); // a genuinely new row in the new version

    // The gate: the RFI's link, created against the first version's row,
    // now resolves to the SAME activity's row in the current version.
    const linksRes = await request(app)
      .get(`/record-links?projectId=${projectId}&recordType=rfi&recordId=${rfiId}`)
      .set("authorization", `Bearer ${token}`);
    expect(linksRes.status).toBe(200);
    expect(linksRes.body).toHaveLength(1);
    expect(linksRes.body[0].id).toBe(linkId);
    expect(linksRes.body[0].targetId).toBe(newTargetTask.id);
    expect(linksRes.body[0].targetId).not.toBe(targetTask.id);

    const currentRes = await request(app).get(`/schedules/current?projectId=${projectId}`).set("authorization", `Bearer ${token}`);
    expect(currentRes.status).toBe(200);
    expect(currentRes.body.version.id).toBe(secondVersionId);
    expect(currentRes.body.tasks).toHaveLength(TASK_COUNT + 1); // 1 WBS node + (TASK_COUNT - 1 + 1 new) activities
    expect(currentRes.body.dependencies.length).toBeGreaterThan(0);
    // A calendar row is created per import (documented Phase 11a scope cut --
    // no dedup-by-name across re-imports), so this is >=1, not necessarily 1.
    expect(currentRes.body.calendars.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("rejects an import with a circular dependency", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const xer = [
      "ERMHDR\t21.12\t2026-01-01",
      "%T\tTASK",
      "%F\ttask_id\ttask_name\ttask_type",
      "%R\tC1\tA\tTT_Task",
      "%R\tC2\tB\tTT_Task",
      "%T\tTASKPRED",
      "%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
      "%R\tL1\tC2\tC1\tPR_FS\t0",
      "%R\tL2\tC1\tC2\tPR_FS\t0",
      "%E",
    ].join("\n");

    const res = await request(app)
      .post("/schedules/import")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sourceTool: "p6_xer", fileText: xer });
    expect(res.status).toBe(400);
  });

  it("client_viewer (read-only) cannot import a schedule", async () => {
    const token = await loginAs("karim.abughazaleh@siteops.test");
    const res = await request(app)
      .post("/schedules/import")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sourceTool: "csv", fileText: "ID,Task Name\n1,Should be rejected" });
    expect(res.status).toBe(403);
  });
});
