import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Action Plans (Phase 18): a reusable, admin-defined template of action
 * items that instantiates in one shot into ordinary corrective_actions
 * rows (each stamped with an action_plan_id) rather than a parallel
 * tracking system -- so the plan's own "status" is always derived from
 * those rows, never stored. Preconditions: same seeded Postgres as
 * apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";

interface Member {
  userId: string;
  email: string;
}

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let members: Member[];

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const token = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = projectsRes.body[0].id as string;

  const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${token}`);
  members = membersRes.body as Member[];
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

function memberByEmail(email: string): Member {
  const member = members.find((m) => m.email === email);
  if (!member) throw new Error(`Seed member not found: ${email}`);
  return member;
}

describe("Action plan templates", () => {
  it("rejects a non-admin creating a template", async () => {
    const viewerToken = await loginAs("karim.abughazaleh@siteops.test");
    const res = await request(app)
      .post("/action-plan-templates")
      .set("authorization", `Bearer ${viewerToken}`)
      .send({ projectId, name: "Should be rejected" });
    expect(res.status).toBe(403);
  });

  it("an admin creates a template with ordered items, lists it, and fetches its detail", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");

    const createRes = await request(app)
      .post("/action-plan-templates")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, name: "Fall Hazard Response", description: "Standard response for a fall-hazard near-miss" });
    expect(createRes.status).toBe(201);
    const templateId = createRes.body.id as string;

    const item1Res = await request(app)
      .post(`/action-plan-templates/${templateId}/items`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, description: "Barricade the area", defaultDueDays: 1, sortOrder: 0 });
    expect(item1Res.status).toBe(201);

    const item2Res = await request(app)
      .post(`/action-plan-templates/${templateId}/items`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, description: "Retrain crew on fall protection", defaultDueDays: 7, sortOrder: 1 });
    expect(item2Res.status).toBe(201);

    const listRes = await request(app).get(`/action-plan-templates?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((t: { id: string }) => t.id === templateId)).toBe(true);

    const detailRes = await request(app).get(`/action-plan-templates/${templateId}?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.items).toHaveLength(2);
    expect(detailRes.body.items[0].description).toBe("Barricade the area");
  });
});

describe("Action plan instantiation", () => {
  it("instantiating a plan creates linked corrective actions, and the plan's status is derived from their completion", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test");
    const khalid = memberByEmail("khalid.zoubi@siteops.test");

    const templateRes = await request(app)
      .post("/action-plan-templates")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, name: "Spill Response" });
    const templateId = templateRes.body.id as string;

    const incidentRes = await request(app)
      .post("/safety-incidents")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, occurredAt: "2030-03-01T09:00:00.000Z", severity: "minor", description: "Chemical spill in storage area" });
    expect(incidentRes.status).toBe(201);
    const incidentId = incidentRes.body.id as string;

    const instantiateRes = await request(app)
      .post("/action-plans")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        projectId,
        templateId,
        name: "Spill Response for incident",
        sourceType: "safety_incident",
        sourceId: incidentId,
        items: [
          { description: "Contain and clean the spill", assignedToUserId: lina.userId, dueDate: "2030-03-02" },
          { description: "File an incident report with EHS", assignedToUserId: khalid.userId, dueDate: "2030-03-05" },
        ],
      });
    expect(instantiateRes.status).toBe(201);
    expect(instantiateRes.body.status).toBe("in_progress");
    expect(instantiateRes.body.itemCount).toBe(2);
    expect(instantiateRes.body.completedCount).toBe(0);
    const planId = instantiateRes.body.id as string;

    // The instantiated items are ordinary corrective actions, visible through the existing list endpoint.
    const actionsRes = await request(app)
      .get(`/corrective-actions?projectId=${projectId}&sourceType=safety_incident&sourceId=${incidentId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(actionsRes.status).toBe(200);
    const linkedActions = (actionsRes.body as { id: string; actionPlanId: string | null }[]).filter((a) => a.actionPlanId === planId);
    expect(linkedActions).toHaveLength(2);

    const planListRes = await request(app)
      .get(`/action-plans?projectId=${projectId}&sourceType=safety_incident&sourceId=${incidentId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(planListRes.status).toBe(200);
    const plan = (planListRes.body as { id: string; status: string }[]).find((p) => p.id === planId);
    expect(plan?.status).toBe("in_progress");

    // Complete one of the two -- the plan should still read as in_progress.
    await request(app).post(`/corrective-actions/${linkedActions[0]?.id}/transition`).set("authorization", `Bearer ${adminToken}`).send({ toStatus: "completed" });
    const midwayRes = await request(app)
      .get(`/action-plans?projectId=${projectId}&sourceType=safety_incident&sourceId=${incidentId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(midwayRes.body.find((p: { id: string }) => p.id === planId)?.status).toBe("in_progress");

    // Complete the second -- now the plan is fully done.
    await request(app).post(`/corrective-actions/${linkedActions[1]?.id}/transition`).set("authorization", `Bearer ${adminToken}`).send({ toStatus: "completed" });
    const finalRes = await request(app)
      .get(`/action-plans?projectId=${projectId}&sourceType=safety_incident&sourceId=${incidentId}`)
      .set("authorization", `Bearer ${adminToken}`);
    const finalPlan = (finalRes.body as { id: string; status: string; completedCount: number }[]).find((p) => p.id === planId);
    expect(finalPlan?.status).toBe("completed");
    expect(finalPlan?.completedCount).toBe(2);
  });

  it("rejects instantiating a plan without safety:standard", async () => {
    const viewerToken = await loginAs("karim.abughazaleh@siteops.test");
    const someUserId = memberByEmail("omar.nassar@siteops.test").userId;
    const res = await request(app)
      .post("/action-plans")
      .set("authorization", `Bearer ${viewerToken}`)
      .send({
        projectId,
        name: "Should be rejected",
        sourceType: "safety_incident",
        sourceId: someUserId, // any uuid; permission check runs first
        items: [{ description: "n/a", assignedToUserId: someUserId, dueDate: "2030-01-01" }],
      });
    expect(res.status).toBe(403);
  });
});
