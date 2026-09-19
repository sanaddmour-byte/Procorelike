import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Integration tests for workflow_transition_rules: a directory:admin can
 * narrow -- disable, or raise the permission level required for -- a
 * transition the module's own hardcoded state machine already allows, but
 * can't widen it to a transition the module doesn't support. Preconditions:
 * same seeded Postgres as apps/api/src/routes/integration.test.ts.
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

describe("Workflow transition rules", () => {
  it("rejects a non-admin configuring a workflow rule", async () => {
    const foremanToken = await loginAs("yousef.amer@siteops.test");
    const res = await request(app)
      .put("/workflow-transition-rules")
      .set("authorization", `Bearer ${foremanToken}`)
      .send({ projectId, module: "rfis", fromStatus: "open", toStatus: "closed", enabled: false, requiredLevel: "standard" });
    expect(res.status).toBe(403);
  });

  it("rejects a transition the module's own state machine doesn't support", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");
    const res = await request(app)
      .put("/workflow-transition-rules")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, module: "rfis", fromStatus: "closed", toStatus: "open", enabled: false, requiredLevel: "standard" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("unsupported_transition");
  });

  it("rejects a module that doesn't support workflow rules yet", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");
    const res = await request(app)
      .put("/workflow-transition-rules")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, module: "submittals", fromStatus: "in_review", toStatus: "approved", enabled: false, requiredLevel: "standard" });
    expect(res.status).toBe(400);
  });

  it("disables the RFI open->closed transition project-wide, blocking even an admin caller", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");

    const putRes = await request(app)
      .put("/workflow-transition-rules")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, module: "rfis", fromStatus: "open", toStatus: "closed", enabled: false, requiredLevel: "standard" });
    expect(putRes.status).toBe(200);
    expect(putRes.body.enabled).toBe(false);

    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, subject: "Workflow rule disablement test", question: "Please advise." });
    expect(createRes.status).toBe(201);
    const rfiId = createRes.body.id as string;

    const openRes = await request(app)
      .post(`/rfis/${rfiId}/transition`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ toStatus: "open" });
    expect(openRes.status).toBe(200);

    const closeRes = await request(app)
      .post(`/rfis/${rfiId}/transition`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ toStatus: "closed" });
    expect(closeRes.status).toBe(403);
    expect(closeRes.body.error.code).toBe("transition_disabled");

    // Restore the default so later tests in this suite/run aren't affected.
    await request(app)
      .put("/workflow-transition-rules")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, module: "rfis", fromStatus: "open", toStatus: "closed", enabled: true, requiredLevel: "standard" });
  });

  it("raises the permission level required for a punch item transition above the module's own base check", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");
    const foremanToken = await loginAs("yousef.amer@siteops.test");

    const createRes = await request(app)
      .post("/punch-items")
      .set("authorization", `Bearer ${foremanToken}`)
      .send({ projectId, description: "Workflow rule elevation test" });
    expect(createRes.status).toBe(201);
    const punchItemId = createRes.body.id as string;

    const toReviewRes = await request(app)
      .post(`/punch-items/${punchItemId}/transition`)
      .set("authorization", `Bearer ${foremanToken}`)
      .send({ toStatus: "ready_for_review" });
    expect(toReviewRes.status).toBe(200);

    const ruleRes = await request(app)
      .put("/workflow-transition-rules")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, module: "punch_list", fromStatus: "ready_for_review", toStatus: "approved", enabled: true, requiredLevel: "admin" });
    expect(ruleRes.status).toBe(200);

    // yousef has punch_list:standard by default -- enough for the module's
    // own base check, but not the "admin" this rule now additionally
    // requires for this specific transition.
    const foremanApproveRes = await request(app)
      .post(`/punch-items/${punchItemId}/transition`)
      .set("authorization", `Bearer ${foremanToken}`)
      .send({ toStatus: "approved" });
    expect(foremanApproveRes.status).toBe(403);

    const adminApproveRes = await request(app)
      .post(`/punch-items/${punchItemId}/transition`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ toStatus: "approved" });
    expect(adminApproveRes.status).toBe(200);
    expect(adminApproveRes.body.status).toBe("approved");
  });

  it("lists rules scoped to the given module", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");
    const res = await request(app)
      .get("/workflow-transition-rules")
      .query({ projectId, module: "punch_list" })
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.every((r: { module: string }) => r.module === "punch_list")).toBe(true);
  });
});
