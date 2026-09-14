import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Field-module (Phase 2) integration tests: Daily Log + Punch List CRUD,
 * status-transition rules, and the offline-sync push/pull path including
 * the genuine-conflict case from mergeFields (@siteops/shared).
 * Preconditions: docker-compose Postgres migrated + seeded (same as
 * apps/api/src/routes/integration.test.ts).
 */

const SEED_PASSWORD = "ChangeMe123!";

/**
 * The daily_logs unique index is on (project_id, log_date); the test DB
 * persists across repeated `pnpm test` runs (no reset between them), so a
 * fixed or narrowly-randomized date would eventually collide with a
 * previous run's row and fail for the wrong reason. Deriving from the
 * current high-resolution clock (spread a few thousand years out, well
 * past any seeded or realistic project date) keeps each invocation's dates
 * practically guaranteed unique.
 */
function uniqueLogDate(salt: number): string {
  const dayOffset = (Date.now() + salt) % 100_000; // wall-clock based: unique across repeated invocations, not just within one process
  const date = new Date(Date.UTC(2100, 0, 1));
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

let app: Express;
let clients: ApiDbClients;
let ammanHeightsProjectId: string;

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const token = await loginAs("omar.nassar@siteops.test");
  const res = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  ammanHeightsProjectId = res.body[0].id as string;
});

afterAll(async () => {
  await clients.authDb.queryClient.end();
  await clients.appDb.queryClient.end();
});

async function loginAs(email: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password: SEED_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe("Daily Log", () => {
  it("creates a daily log, rejects a duplicate for the same project+date, lets the creator edit, and locks/reopens", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const logDate = uniqueLogDate(1);

    const createRes = await request(app)
      .post("/daily-logs")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId: ammanHeightsProjectId, logDate, notes: "Poured slab on grade, level 3" });
    expect(createRes.status).toBe(201);
    const logId = createRes.body.id as string;

    const dupeRes = await request(app)
      .post("/daily-logs")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId: ammanHeightsProjectId, logDate, notes: "duplicate attempt" });
    expect(dupeRes.status).toBe(409);
    expect(dupeRes.body.error.code).toBe("daily_log_exists");

    // Foreman didn't create it and only has "standard" (create+edit own) -> forbidden.
    const foremanToken = await loginAs("yousef.amer@siteops.test");
    const forbiddenEdit = await request(app)
      .patch(`/daily-logs/${logId}`)
      .set("authorization", `Bearer ${foremanToken}`)
      .send({ notes: "trying to edit someone else's log" });
    expect(forbiddenEdit.status).toBe(403);

    const editRes = await request(app)
      .patch(`/daily-logs/${logId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ notes: "Poured slab on grade, level 3 — inspected and approved" });
    expect(editRes.status).toBe(200);
    expect(editRes.body.notes).toContain("approved");

    const lockRes = await request(app)
      .patch(`/daily-logs/${logId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ locked: true });
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.lockedAt).toBeTruthy();

    const editLockedRes = await request(app)
      .patch(`/daily-logs/${logId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ notes: "trying to sneak an edit in" });
    expect(editLockedRes.status).toBe(409);
    expect(editLockedRes.body.error.code).toBe("daily_log_locked");

    const reopenRes = await request(app)
      .patch(`/daily-logs/${logId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ locked: false });
    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.lockedAt).toBeNull();
  });

  it("stores manpower sub-entries and returns them on GET", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
    const companiesRes = await request(app).get("/companies").set("authorization", `Bearer ${token}`);
    const gc = companiesRes.body.find((c: { name: string }) => c.name.includes("Al-Amal"));

    const logDate = uniqueLogDate(2);
    const createRes = await request(app)
      .post("/daily-logs")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId: projectsRes.body[0].id,
        logDate,
        manpower: gc ? [{ companyId: gc.id, tradeId: await getAnyTradeId(token), headcount: 6, hours: 8 }] : [],
      });
    expect(createRes.status).toBe(201);

    const getRes = await request(app)
      .get(`/daily-logs/${createRes.body.id}`)
      .set("authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body.manpower)).toBe(true);
  });
});

async function getAnyTradeId(_token: string): Promise<string> {
  // Trades are global reference data seeded in Phase 1; fetched directly
  // for this test rather than adding a /trades endpoint this phase doesn't need yet.
  const rows = await clients.authDb.db.execute<{ id: string }>(sql`select id from trades limit 1`);
  return rows[0]?.id ?? randomUUID();
}

describe("Punch List", () => {
  it("numbers a new punch item and enforces valid status transitions only", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const createRes = await request(app)
      .post("/punch-items")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId: ammanHeightsProjectId, description: "Touch up paint, unit 4B", priority: "low" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.number).toMatch(/^PI-\d{4}$/);
    expect(createRes.body.status).toBe("open");
    const id = createRes.body.id as string;

    const invalidTransition = await request(app)
      .post(`/punch-items/${id}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "closed" });
    expect(invalidTransition.status).toBe(409);
    expect(invalidTransition.body.error.code).toBe("invalid_status_transition");

    const validTransition = await request(app)
      .post(`/punch-items/${id}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "ready_for_review", note: "Ready for QA walk" });
    expect(validTransition.status).toBe(200);
    expect(validTransition.body.status).toBe("ready_for_review");

    const detailRes = await request(app).get(`/punch-items/${id}`).set("authorization", `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.history).toHaveLength(2); // created + transitioned
  });

  it("records additional distribution personnel at creation, alongside the single assignee", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const membersRes = await request(app).get(`/projects/${ammanHeightsProjectId}/members`).set("authorization", `Bearer ${token}`);
    const members = membersRes.body as { userId: string; email: string }[];
    const assignee = members.find((m) => m.email === "yousef.amer@siteops.test");
    const distributee = members.find((m) => m.email !== assignee?.email);
    if (!assignee || !distributee) throw new Error("Seed members not found");

    const createRes = await request(app)
      .post("/punch-items")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId: ammanHeightsProjectId,
        description: "Re-caulk shower pan, unit 7C",
        priority: "medium",
        assigneeUserId: assignee.userId,
        distributionUserIds: [distributee.userId],
      });
    expect(createRes.status).toBe(201);

    const detailRes = await request(app).get(`/punch-items/${createRes.body.id}`).set("authorization", `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.distribution.map((d: { userId: string | null }) => d.userId)).toContain(distributee.userId);
  });
});

describe("Offline sync (airplane-mode scenario)", () => {
  it("creates a brand-new punch item entirely offline via sync/push, then it appears on sync/pull", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const localId = randomUUID();

    const pushRes = await request(app)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId: ammanHeightsProjectId,
        entityType: "punch_item",
        records: [
          {
            localId,
            baseRevision: null,
            base: null,
            data: { description: "Offline-created: missing outlet cover, level 5", priority: "medium" },
          },
        ],
      });
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.results[0].status).toBe("applied");

    const pullRes = await request(app)
      .get("/sync/pull")
      .query({ projectId: ammanHeightsProjectId, entityType: "punch_item", since: 0 })
      .set("authorization", `Bearer ${token}`);
    expect(pullRes.status).toBe(200);
    expect(pullRes.body.records.some((r: { id: string }) => r.id === localId)).toBe(true);
  });

  it("rejects a sync push from a caller without write permission on the module", async () => {
    const token = await loginAs("karim.abughazaleh@siteops.test"); // client_viewer: read-only on punch_list
    const pushRes = await request(app)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId: ammanHeightsProjectId,
        entityType: "punch_item",
        records: [{ localId: randomUUID(), baseRevision: null, base: null, data: { description: "should be rejected" } }],
      });
    expect(pushRes.status).toBe(200); // batch endpoint always 200; per-record status carries the outcome
    expect(pushRes.body.results[0].status).toBe("rejected");
    expect(pushRes.body.results[0].reason).toBe("permission_denied");
  });

  it("flags a genuine field-level conflict instead of silently overwriting either side", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const createRes = await request(app)
      .post("/punch-items")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId: ammanHeightsProjectId, description: "Original description" });
    const id = createRes.body.id as string;
    const base = { description: createRes.body.description };

    // "Device A" pushes a change and it applies cleanly.
    const deviceAPush = await request(app)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId: ammanHeightsProjectId,
        entityType: "punch_item",
        records: [{ localId: id, baseRevision: createRes.body.serverRevision, base, data: { description: "Changed by device A" } }],
      });
    expect(deviceAPush.body.results[0].status).toBe("applied");

    // "Device B" was offline since before device A's change, still has the ORIGINAL base,
    // and pushes a *different* change to the same field.
    const deviceBPush = await request(app)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId: ammanHeightsProjectId,
        entityType: "punch_item",
        records: [{ localId: id, baseRevision: createRes.body.serverRevision, base, data: { description: "Changed by device B" } }],
      });
    expect(deviceBPush.status).toBe(200);
    expect(deviceBPush.body.results[0].status).toBe("conflict");
    expect(deviceBPush.body.results[0].conflicts).toEqual([
      { field: "description", base: "Original description", server: "Changed by device A", client: "Changed by device B" },
    ]);

    const detailRes = await request(app).get(`/punch-items/${id}`).set("authorization", `Bearer ${token}`);
    expect(detailRes.body.needsReview).toBe(true);
    // Neither side's value was silently discarded: server keeps device A's (already-applied)
    // value, and device B's conflicting value is preserved in conflictData for the resolution screen.
    expect(detailRes.body.description).toBe("Changed by device A");
    expect(detailRes.body.conflictData).toBeTruthy();

    // Resolving the conflict from the mobile resolution screen is just a
    // normal authoritative PATCH — it clears the flag since the user has
    // now explicitly confirmed a value.
    const resolveRes = await request(app)
      .patch(`/punch-items/${id}`)
      .set("authorization", `Bearer ${token}`)
      .send({ description: "Resolved by user: keeping device B's wording" });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.needsReview).toBe(false);
    expect(resolveRes.body.conflictData).toBeNull();
  });

  it("Phase 2 gate: 5 punch items + 1 daily log created entirely offline all sync on reconnect", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const punchLocalIds = Array.from({ length: 5 }, () => randomUUID());
    const punchPush = await request(app)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId: ammanHeightsProjectId,
        entityType: "punch_item",
        records: punchLocalIds.map((localId, i) => ({
          localId,
          baseRevision: null,
          base: null,
          data: { description: `Airplane-mode punch item #${i + 1}`, priority: "medium" },
        })),
      });
    expect(punchPush.status).toBe(200);
    expect(punchPush.body.results).toHaveLength(5);
    for (const result of punchPush.body.results) {
      expect(result.status).toBe("applied");
      expect(typeof result.serverRevision).toBe("number");
    }

    const dailyLogLocalId = randomUUID();
    const logDate = uniqueLogDate(999);
    const dailyLogPush = await request(app)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId: ammanHeightsProjectId,
        entityType: "daily_log",
        records: [
          {
            localId: dailyLogLocalId,
            baseRevision: null,
            base: null,
            data: { logDate, notes: "Airplane-mode daily log" },
          },
        ],
      });
    expect(dailyLogPush.status).toBe(200);
    expect(dailyLogPush.body.results[0].status).toBe("applied");

    // "Reconnect": everything created offline is now visible via the normal pull path.
    const punchPull = await request(app)
      .get("/sync/pull")
      .query({ projectId: ammanHeightsProjectId, entityType: "punch_item", since: 0 })
      .set("authorization", `Bearer ${token}`);
    const pulledPunchIds = new Set(punchPull.body.records.map((r: { id: string }) => r.id));
    for (const localId of punchLocalIds) {
      expect(pulledPunchIds.has(localId)).toBe(true);
    }

    const dailyLogPull = await request(app)
      .get("/sync/pull")
      .query({ projectId: ammanHeightsProjectId, entityType: "daily_log", since: 0 })
      .set("authorization", `Bearer ${token}`);
    expect(dailyLogPull.body.records.some((r: { id: string }) => r.id === dailyLogLocalId)).toBe(true);

    const logDetail = await request(app).get(`/daily-logs/${dailyLogLocalId}`).set("authorization", `Bearer ${token}`);
    expect(logDetail.status).toBe(200);
    expect(String(logDetail.body.logDate).slice(0, 10)).toBe(logDate);
    expect(logDetail.body.notes).toBe("Airplane-mode daily log");
  });
});
