import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 9 (Schedule & Safety, T3) integration tests. Preconditions:
 * docker-compose Postgres migrated + seeded (same as
 * apps/api/src/routes/integration.test.ts).
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
  const res = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = res.body[0].id as string;
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

describe("Schedule", () => {
  it("creates a task and moves it through not_started -> in_progress -> complete", async () => {
    const token = await loginAs("omar.nassar@siteops.test"); // project_manager: admin on schedule

    const create = await request(app)
      .post("/schedule-tasks")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, name: "Pour Level 5 slab", startDate: "2026-01-05", endDate: "2026-01-12" });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe("not_started");
    expect(create.body.percentComplete).toBe(0);
    const taskId = create.body.id as string;

    const list = await request(app).get(`/schedule-tasks?projectId=${projectId}`).set("authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.some((t: { id: string }) => t.id === taskId)).toBe(true);

    const toInProgress = await request(app)
      .post(`/schedule-tasks/${taskId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "in_progress" });
    expect(toInProgress.status).toBe(200);
    expect(toInProgress.body.status).toBe("in_progress");

    const toComplete = await request(app)
      .post(`/schedule-tasks/${taskId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "complete" });
    expect(toComplete.status).toBe(200);
    expect(toComplete.body.status).toBe("complete");
    // Marking complete auto-fills percentComplete rather than trusting a
    // separately-tracked field to agree with the status.
    expect(toComplete.body.percentComplete).toBe(100);
  });

  it("rejects an invalid status transition", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const create = await request(app)
      .post("/schedule-tasks")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, name: "Invalid-transition probe", startDate: "2026-02-01", endDate: "2026-02-05" });
    const taskId = create.body.id as string;

    const res = await request(app)
      .post(`/schedule-tasks/${taskId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "complete" }); // not_started -> complete is not an allowed edge
    expect(res.status).toBe(409);
  });

  it("client_viewer (read-only) cannot create a schedule task", async () => {
    const token = await loginAs("karim.abughazaleh@siteops.test");
    const res = await request(app)
      .post("/schedule-tasks")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, name: "Should be rejected", startDate: "2026-03-01", endDate: "2026-03-02" });
    expect(res.status).toBe(403);
  });
});

describe("Safety", () => {
  it("logs an incident, investigates it, and requires a corrective action to close", async () => {
    const token = await loginAs("fadi.salameh@siteops.test"); // safety_officer: admin on safety

    const create = await request(app)
      .post("/safety-incidents")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        occurredAt: new Date().toISOString(),
        severity: "minor",
        description: "Worker slipped on wet rebar near the hoist.",
      });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe("open");
    const incidentId = create.body.id as string;

    const investigating = await request(app)
      .post(`/safety-incidents/${incidentId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "investigating" });
    expect(investigating.status).toBe(200);

    const closeWithoutAction = await request(app)
      .post(`/safety-incidents/${incidentId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "closed" });
    expect(closeWithoutAction.status).toBe(422);

    const closed = await request(app)
      .post(`/safety-incidents/${incidentId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "closed", correctiveAction: "Installed non-slip matting and re-briefed the crew." });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe("closed");
    expect(closed.body.closedBy).toBeTruthy();
    expect(closed.body.closedAt).toBeTruthy();

    const list = await request(app).get(`/safety-incidents?projectId=${projectId}`).set("authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.some((i: { id: string }) => i.id === incidentId)).toBe(true);
  });

  it("logs and resolves a safety observation", async () => {
    const token = await loginAs("fadi.salameh@siteops.test");
    const create = await request(app)
      .post("/safety-observations")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        observedAt: new Date().toISOString(),
        category: "unsafe_condition",
        description: "Extension cord run through standing water near panel L2.",
      });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe("open");
    const observationId = create.body.id as string;

    const resolved = await request(app)
      .post(`/safety-observations/${observationId}/toggle-resolved`)
      .set("authorization", `Bearer ${token}`);
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe("resolved");
    expect(resolved.body.resolvedAt).toBeTruthy();
  });

  it("client_viewer (read-only) cannot create a safety incident", async () => {
    const token = await loginAs("karim.abughazaleh@siteops.test");
    const res = await request(app)
      .post("/safety-incidents")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, occurredAt: new Date().toISOString(), severity: "near_miss", description: "Should be rejected" });
    expect(res.status).toBe(403);
  });
});
