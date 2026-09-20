import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Integration tests for GET /projects/:id/analytics -- the first real use
 * of the long-defined-but-unused "reports" permission module (Phase 17
 * gate report). Preconditions: same seeded Postgres as
 * apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";

let app: Express;
let clients: ApiDbClients;
let projectId: string;

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const token = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = projectsRes.body[0].id as string;
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

describe("Project analytics", () => {
  it("rejects a caller with no reports permission (foreman: reports:none)", async () => {
    const foremanToken = await loginAs("yousef.amer@siteops.test");
    const res = await request(app).get(`/projects/${projectId}/analytics`).set("authorization", `Bearer ${foremanToken}`);
    expect(res.status).toBe(403);
  });

  it("returns every section for a caller with reports:read and read-or-above on each module (project_manager)", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");

    // Seed enough real data that the trend/cycle-time math has something to chew on.
    const rfiRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, subject: "Analytics smoke RFI", question: "Does this show up in the trend?" });
    expect(rfiRes.status).toBe(201);
    await request(app)
      .post(`/rfis/${rfiRes.body.id}/responses`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ responseText: "Yes it does.", isOfficial: true });

    const res = await request(app).get(`/projects/${projectId}/analytics`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    expect(res.body.rfis).toBeTruthy();
    expect(res.body.rfis.createdVsAnsweredWeekly).toHaveLength(12);
    expect(res.body.rfis.byStatus.answered).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.rfis.avgResponseTimeDays === "number" || res.body.rfis.avgResponseTimeDays === null).toBe(true);

    expect(res.body.punchList).toBeTruthy();
    expect(res.body.submittals).toBeTruthy();
    expect(res.body.safety).toBeTruthy();
    expect(res.body.changeOrders).toBeTruthy();
  });

  it("omits a section the caller's own module permission excludes (qa_qc: change_management:none)", async () => {
    const qaToken = await loginAs("rana.odeh@siteops.test");
    const res = await request(app).get(`/projects/${projectId}/analytics`).set("authorization", `Bearer ${qaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rfis).toBeTruthy();
    expect(res.body.punchList).toBeTruthy();
    expect(res.body.changeOrders).toBeUndefined();
  });
});
