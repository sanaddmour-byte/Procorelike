import type { Express } from "express";
import nodemailer from "nodemailer";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv, type Env } from "../env";
import { runRfiOverdueSweep } from "./rfi-overdue-sweep";

/**
 * The overdue-RFI escalation sweep and its trigger endpoint. Real SMTP
 * delivery (MailHog) isn't reachable in this sandbox — no Docker, same
 * constraint as the S3/MinIO gap noted in the Phase 1 gate report — so
 * `runRfiOverdueSweep` is exercised directly with nodemailer's
 * `jsonTransport` (no network, just captures what would have been sent),
 * proving the query/composition/escalatedAt logic without needing a real
 * mail server. The endpoint itself is only checked for its auth guard;
 * triggering it for real would attempt a genuine SMTP connection this
 * sandbox can't make.
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

describe("RFI overdue escalation sweep", () => {
  it("escalates an open, past-due, unescalated RFI once, then leaves it alone on the next run", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${token}`);
    const lina = (membersRes.body as { email: string; userId: string }[]).find((m) => m.email === "lina.kanaan@siteops.test");
    if (!lina) throw new Error("Seed member not found: lina.kanaan@siteops.test");

    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        subject: "Escalation sweep test RFI",
        question: "This RFI is deliberately overdue to test the escalation sweep.",
        ballInCourtUserId: lina.userId,
        dueDate: "2020-01-01",
      });
    const rfiId = createRes.body.id as string;
    await request(app).post(`/rfis/${rfiId}/transition`).set("authorization", `Bearer ${token}`).send({ toStatus: "open" });

    const testMailer = nodemailer.createTransport({ jsonTransport: true });
    const firstRun = await runRfiOverdueSweep(clients.authDb.db, testMailer, env);
    expect(firstRun.escalated).toBeGreaterThanOrEqual(1);

    const afterFirstRun = await request(app).get(`/rfis/${rfiId}`).set("authorization", `Bearer ${token}`);
    expect(afterFirstRun.body.escalatedAt).not.toBeNull();

    const secondRun = await runRfiOverdueSweep(clients.authDb.db, testMailer, env);
    void secondRun;
    const afterSecondRun = await request(app).get(`/rfis/${rfiId}`).set("authorization", `Bearer ${token}`);
    // Our specific RFI's escalatedAt is unchanged — it wasn't picked up (and re-emailed) a second time.
    expect(afterSecondRun.body.escalatedAt).toBe(afterFirstRun.body.escalatedAt);
  });

  it("skips an overdue RFI addressed only to a company, with no specific person to email", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${token}`);
    const huda = (membersRes.body as { email: string; companyId: string }[]).find((m) => m.email === "huda.masri@siteops.test");
    if (!huda) throw new Error("Seed member not found: huda.masri@siteops.test");

    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        subject: "Company-only ball-in-court RFI",
        question: "Addressed to a company, not a specific person.",
        ballInCourtCompanyId: huda.companyId,
        dueDate: "2020-01-01",
      });
    const rfiId = createRes.body.id as string;
    await request(app).post(`/rfis/${rfiId}/transition`).set("authorization", `Bearer ${token}`).send({ toStatus: "open" });

    const testMailer = nodemailer.createTransport({ jsonTransport: true });
    await runRfiOverdueSweep(clients.authDb.db, testMailer, env);

    const afterSweep = await request(app).get(`/rfis/${rfiId}`).set("authorization", `Bearer ${token}`);
    expect(afterSweep.body.escalatedAt).toBeNull();
  });

  it("POST /internal/rfi-overdue-check rejects a request without the shared secret", async () => {
    const res = await request(app).post("/internal/rfi-overdue-check").send({});
    expect(res.status).toBe(401);

    const wrongSecretRes = await request(app).post("/internal/rfi-overdue-check").set("x-internal-job-secret", "wrong").send({});
    expect(wrongSecretRes.status).toBe(401);
  });
});
