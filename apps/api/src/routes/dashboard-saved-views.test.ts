import type { Express } from "express";
import nodemailer from "nodemailer";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv, type Env } from "../env";
import { runDailyDigestSweep } from "../jobs/daily-digest-sweep";

/**
 * Phase 7 gate (dashboard/saved-views/digest halves): a project dashboard
 * shows live rollup counts, a saved view persists a list screen's filter,
 * and a scheduled digest job emails a user their open items.
 */

const SEED_PASSWORD = "ChangeMe123!";

let app: Express;
let clients: ApiDbClients;
let env: Env;
let projectId: string;

beforeAll(async () => {
  env = loadEnv();
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

describe("Project dashboard", () => {
  it("shows RFI/Punch List rollups to everyone but omits financial sections for client_viewer", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const dashboardRes = await request(app).get(`/projects/${projectId}/dashboard`).set("authorization", `Bearer ${omarToken}`);
    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.body.rfis).toBeDefined();
    expect(dashboardRes.body.punchList).toBeDefined();
    expect(dashboardRes.body.budget).toBeDefined();
    expect(dashboardRes.body.changeOrders).toBeDefined();
    expect(typeof dashboardRes.body.rfis.total).toBe("number");
    expect(typeof dashboardRes.body.punchList.byStatus).toBe("object");

    const karimToken = await loginAs("karim.abughazaleh@siteops.test");
    const clientDashboardRes = await request(app).get(`/projects/${projectId}/dashboard`).set("authorization", `Bearer ${karimToken}`);
    expect(clientDashboardRes.status).toBe(200);
    expect(clientDashboardRes.body.rfis).toBeDefined();
    expect(clientDashboardRes.body.punchList).toBeDefined();
    expect(clientDashboardRes.body.budget).toBeUndefined();
    expect(clientDashboardRes.body.changeOrders).toBeUndefined();
  });
});

describe("Saved views", () => {
  it("saves and lists a view, private to the creating user", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    // Unique per run: the (project, user, module, name) unique constraint would otherwise
    // collide with a row left over from a previous run against this same seeded DB.
    const viewName = `My open items ${Date.now()}`;

    const createRes = await request(app)
      .post("/saved-views")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, module: "punch_list", name: viewName, filters: { status: "open" } });
    expect(createRes.status).toBe(201);
    expect(createRes.body.name).toBe(viewName);

    const listAsOmar = await request(app)
      .get("/saved-views")
      .query({ projectId, module: "punch_list" })
      .set("authorization", `Bearer ${omarToken}`);
    expect(listAsOmar.status).toBe(200);
    expect(listAsOmar.body.some((v: { name: string }) => v.name === viewName)).toBe(true);

    // Private to the creator -- a different project member on the same project doesn't see it.
    const saraToken = await loginAs("sara.haddad@siteops.test");
    const listAsSara = await request(app)
      .get("/saved-views")
      .query({ projectId, module: "punch_list" })
      .set("authorization", `Bearer ${saraToken}`);
    expect(listAsSara.status).toBe(200);
    expect(listAsSara.body.some((v: { name: string }) => v.name === viewName)).toBe(false);
  });
});

describe("Daily digest sweep", () => {
  it("composes a digest for a user with an open ball-in-court RFI", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${omarToken}`);
    const lina = (membersRes.body as { email: string; userId: string }[]).find((m) => m.email === "lina.kanaan@siteops.test");
    if (!lina) throw new Error("Seed member not found: lina.kanaan@siteops.test");

    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${omarToken}`)
      .send({
        projectId,
        subject: "Digest sweep test RFI",
        question: "This RFI exists to exercise the daily digest job.",
        ballInCourtUserId: lina.userId,
      });
    const rfiId = createRes.body.id as string;
    await request(app).post(`/rfis/${rfiId}/transition`).set("authorization", `Bearer ${omarToken}`).send({ toStatus: "open" });

    const testMailer = nodemailer.createTransport({ jsonTransport: true });
    const result = await runDailyDigestSweep(clients.authDb.db, testMailer, env);
    expect(result.usersEmailed).toBeGreaterThanOrEqual(1);
  });
});
