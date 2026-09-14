import { schema } from "@siteops/db";
import { eq, inArray } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 11d (Scheduling & Gantt, Tier B) gate: the native CPM editing flow,
 * behind the `nativeEditingEnabled` feature flag -- toggle, preview (no
 * persistence), apply (persists + recomputes the whole version), a
 * rejected dependency cycle, and the MS Project XML export round-trip.
 */

const SEED_PASSWORD = "ChangeMe123!";

let app: Express;
let clients: ApiDbClients;
let projectId: string;

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

/** A -> B -> C, finish-to-start, on a default Sun-Thu/8h calendar (C1) -- so computeSchedule has a real calendar to schedule against. */
const XER = [
  "ERMHDR\t21.12\t2026-01-01\tProject\tadmin\tadmin\tdbxDatabaseNoName\tProject Management\tUSD",
  "%T\tCALENDAR",
  "%F\tclndr_id\tclndr_name\tdefault_flag",
  "%R\tC1\tStandard Sun-Thu\tY",
  "%T\tTASK",
  "%F\ttask_id\tclndr_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt\ttarget_start_date\ttarget_end_date\ttotal_float_hr_cnt\tfree_float_hr_cnt\tphys_complete_pct",
  "%R\tA\tC1\tA1000\tTask A\tTT_Task\t8\t2026-01-04\t2026-01-05\t0\t0\t0",
  "%R\tB\tC1\tA1001\tTask B\tTT_Task\t8\t2026-01-05\t2026-01-06\t0\t0\t0",
  "%R\tC\tC1\tA1002\tTask C\tTT_Task\t8\t2026-01-06\t2026-01-07\t0\t0\t0",
  "%T\tTASKPRED",
  "%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
  "%R\tL1\tB\tA\tPR_FS\t0",
  "%R\tL2\tC\tB\tPR_FS\t0",
  "%E",
].join("\n");

describe("Native CPM editing (Phase 11d gate)", () => {
  it("fails cleanly (not a 500) when recompute is attempted on a calendar-less (CSV-imported) schedule", async () => {
    const pmToken = await loginAs("omar.nassar@siteops.test");
    const csv = ["ID,Task Name,Duration (days),Predecessors", "A,Task A,1,", "B,Task B,1,A"].join("\n");

    const importRes = await request(app)
      .post("/schedules/import")
      .set("authorization", `Bearer ${pmToken}`)
      .send({ projectId, sourceTool: "csv", fileText: csv });
    expect(importRes.status).toBe(201);
    const scheduleId = importRes.body.schedule.id as string;
    const versionId = importRes.body.version.id as string;

    const toggleOn = await request(app)
      .patch(`/schedules/${scheduleId}/native-editing`)
      .set("authorization", `Bearer ${pmToken}`)
      .send({ enabled: true });
    expect(toggleOn.status).toBe(200);

    const recompute = await request(app).post(`/schedules/versions/${versionId}/recompute`).set("authorization", `Bearer ${pmToken}`).send();
    expect(recompute.status).toBe(422);
    expect(recompute.body.error.code).toBe("no_calendar");

    await resetProjectSchedule(); // leave a clean slate for the main flow test below, which imports its own schedule for the same project
  });

  it("runs the full flag -> preview -> apply -> cycle-reject -> export flow", async () => {
    const pmToken = await loginAs("omar.nassar@siteops.test");
    const viewerToken = await loginAs("karim.abughazaleh@siteops.test");

    const importRes = await request(app)
      .post("/schedules/import")
      .set("authorization", `Bearer ${pmToken}`)
      .send({ projectId, sourceTool: "p6_xer", fileText: XER });
    expect(importRes.status).toBe(201);
    expect(importRes.body.taskCount).toBe(3);
    const scheduleId = importRes.body.schedule.id as string;
    const versionId = importRes.body.version.id as string;
    expect(importRes.body.schedule.nativeEditingEnabled).toBe(false);

    const tasksRes = await request(app).get(`/schedules/versions/${versionId}/tasks`).set("authorization", `Bearer ${pmToken}`);
    const taskA = tasksRes.body.tasks.find((t: { externalId: string }) => t.externalId === "A");
    const taskB = tasksRes.body.tasks.find((t: { externalId: string }) => t.externalId === "B");
    const taskC = tasksRes.body.tasks.find((t: { externalId: string }) => t.externalId === "C");
    expect(taskA && taskB && taskC).toBeTruthy();
    expect(taskA.durationMinutes).toBe(480);
    const abDependency = tasksRes.body.dependencies.find(
      (d: { predecessorId: string; successorId: string }) => d.predecessorId === taskA.id && d.successorId === taskB.id,
    );
    expect(abDependency).toBeDefined();

    // Editing is rejected while the flag is off.
    const previewBeforeFlag = await request(app)
      .post(`/schedules/versions/${versionId}/preview`)
      .set("authorization", `Bearer ${pmToken}`)
      .send({ taskEdits: [{ taskId: taskA.id, durationMinutes: 1920 }] });
    expect(previewBeforeFlag.status).toBe(409);
    expect(previewBeforeFlag.body.error.code).toBe("native_editing_disabled");

    // A client_viewer cannot toggle the flag.
    const viewerToggle = await request(app)
      .patch(`/schedules/${scheduleId}/native-editing`)
      .set("authorization", `Bearer ${viewerToken}`)
      .send({ enabled: true });
    expect(viewerToggle.status).toBe(403);

    // project_manager (has "admin" on schedule) can.
    const toggleOn = await request(app)
      .patch(`/schedules/${scheduleId}/native-editing`)
      .set("authorization", `Bearer ${pmToken}`)
      .send({ enabled: true });
    expect(toggleOn.status).toBe(200);
    expect(toggleOn.body.nativeEditingEnabled).toBe(true);

    // A bare recompute (no edits) establishes the CPM-computed baseline dates -- the import path itself only stores the source file's raw dates, not engine-computed ones.
    const baseline = await request(app).post(`/schedules/versions/${versionId}/recompute`).set("authorization", `Bearer ${pmToken}`).send();
    expect(baseline.status).toBe(200);
    const baselineA = baseline.body.tasks.find((t: { id: string }) => t.id === taskA.id);
    const baselineC = baseline.body.tasks.find((t: { id: string }) => t.id === taskC.id);
    expect(baselineC.earlyFinish).toBeTruthy();

    // Preview: quadrupling Task A's duration should push B and C's dates out, but nothing persists yet.
    const preview = await request(app)
      .post(`/schedules/versions/${versionId}/preview`)
      .set("authorization", `Bearer ${pmToken}`)
      .send({ taskEdits: [{ taskId: taskA.id, durationMinutes: 1920 }] });
    expect(preview.status).toBe(200);
    expect(preview.body.cycle).toBeNull();
    const previewC = preview.body.tasks.find((t: { id: string }) => t.id === taskC.id);
    expect(new Date(previewC.earlyFinish).getTime()).toBeGreaterThan(new Date(baselineC.earlyFinish).getTime());

    const stillUnchangedRes = await request(app).get(`/schedules/versions/${versionId}/tasks`).set("authorization", `Bearer ${pmToken}`);
    const stillUnchangedA = stillUnchangedRes.body.tasks.find((t: { id: string }) => t.id === taskA.id);
    expect(stillUnchangedA.durationMinutes).toBe(480); // preview never wrote anything

    // A dependency add that would create a cycle (C -> A, on top of the existing A -> B -> C chain) is rejected outright.
    const cycleAttempt = await request(app)
      .post(`/schedules/versions/${versionId}/apply`)
      .set("authorization", `Bearer ${pmToken}`)
      .send({ dependencyAdds: [{ predecessorId: taskC.id, successorId: taskA.id, type: "FS", lagMinutes: 0 }] });
    expect(cycleAttempt.status).toBe(409);
    expect(cycleAttempt.body.error.code).toBe("dependency_cycle");

    // Apply the same duration edit for real, plus remove A->B and add a new SS dependency with lag in its place.
    const apply = await request(app)
      .post(`/schedules/versions/${versionId}/apply`)
      .set("authorization", `Bearer ${pmToken}`)
      .send({
        taskEdits: [{ taskId: taskA.id, durationMinutes: 1920 }],
        dependencyRemoveIds: [abDependency.id],
        dependencyAdds: [{ predecessorId: taskA.id, successorId: taskB.id, type: "SS", lagMinutes: 480 }],
      });
    expect(apply.status).toBe(200);
    expect(apply.body.cpmResult.cycle).toBeNull();
    const appliedA = apply.body.tasks.find((t: { id: string }) => t.id === taskA.id);
    expect(appliedA.durationMinutes).toBe(1920);
    const appliedDeps = apply.body.dependencies;
    expect(appliedDeps.find((d: { id: string }) => d.id === abDependency.id)).toBeUndefined();
    expect(appliedDeps.find((d: { predecessorId: string; type: string }) => d.predecessorId === taskA.id && d.type === "SS")).toBeDefined();

    // A has no predecessor, so its own earlyFinish is purely earlyStart + duration -- a robust check that the
    // duration edit actually took effect, independent of the dependency-type swap applied alongside it (which,
    // by design, decouples B's start from A's finish and so does not itself guarantee C moves later).
    expect(new Date(appliedA.earlyFinish).getTime()).toBeGreaterThan(new Date(baselineA.earlyFinish).getTime());

    // Recompute with no edits is idempotent and doesn't error.
    const recompute = await request(app).post(`/schedules/versions/${versionId}/recompute`).set("authorization", `Bearer ${pmToken}`).send();
    expect(recompute.status).toBe(200);
    expect(recompute.body.cpmResult.cycle).toBeNull();

    // XML export round-trips through the same MS Project XML parser the import path uses.
    const exportRes = await request(app).get(`/schedules/versions/${versionId}/export.xml`).set("authorization", `Bearer ${pmToken}`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers["content-type"]).toBe("application/xml; charset=utf-8");
    expect(exportRes.text).toContain("Task A");
    expect(exportRes.text).toContain("<Project>");
  }, 30_000);
});
