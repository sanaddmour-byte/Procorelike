import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 10 (T&M Tickets & Correspondence, T3) integration tests.
 * Preconditions: docker-compose Postgres migrated + seeded (same as
 * apps/api/src/routes/integration.test.ts).
 */

const SEED_PASSWORD = "ChangeMe123!";

interface Member {
  userId: string;
  email: string;
  companyId: string;
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
  const res = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = res.body[0].id as string;

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

describe("T&M Tickets", () => {
  it("creates a ticket with labor/equipment/material entries, computes the total, and moves through draft -> submitted -> approved", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const huda = memberByEmail("huda.masri@siteops.test");

    const create = await request(app)
      .post("/tm-tickets")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        companyId: huda.companyId,
        workDate: "2026-01-15",
        description: "Emergency dewatering pump rental and crew, outside contract scope.",
        laborEntries: [{ workerName: "Ahmad Salem", trade: "Laborer", hours: 8, rate: 12 }],
        equipmentEntries: [{ description: "Submersible pump", hours: 8, rate: 15 }],
        materialEntries: [{ description: "PVC discharge pipe", quantity: 20, unit: "m", unitCost: 3 }],
      });
    expect(create.status).toBe(201);
    expect(create.body.ticketNumber).toMatch(/^TM-\d{4}$/);
    expect(create.body.status).toBe("draft");
    // 8*12 (labor) + 8*15 (equipment) + 20*3 (material) = 96 + 120 + 60 = 276
    expect(create.body.totalAmount).toBe(276);
    const ticketId = create.body.id as string;

    const detail = await request(app).get(`/tm-tickets/${ticketId}`).set("authorization", `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.laborEntries).toHaveLength(1);
    expect(detail.body.equipmentEntries).toHaveLength(1);
    expect(detail.body.materialEntries).toHaveLength(1);

    const toSubmitted = await request(app)
      .post(`/tm-tickets/${ticketId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "submitted" });
    expect(toSubmitted.status).toBe(200);
    expect(toSubmitted.body.status).toBe("submitted");

    const toApproved = await request(app)
      .post(`/tm-tickets/${ticketId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "approved" });
    expect(toApproved.status).toBe(200);
    expect(toApproved.body.status).toBe("approved");
    expect(toApproved.body.approvedBy).toBeTruthy();

    const list = await request(app).get(`/tm-tickets?projectId=${projectId}`).set("authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.some((t: { id: string }) => t.id === ticketId)).toBe(true);
  });

  it("requires a rejection reason to reject, and lets a rejected ticket go back to draft", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const huda = memberByEmail("huda.masri@siteops.test");

    const create = await request(app)
      .post("/tm-tickets")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, companyId: huda.companyId, workDate: "2026-01-16", description: "Reject-path probe" });
    const ticketId = create.body.id as string;

    await request(app).post(`/tm-tickets/${ticketId}/transition`).set("authorization", `Bearer ${token}`).send({ toStatus: "submitted" });

    const rejectWithoutReason = await request(app)
      .post(`/tm-tickets/${ticketId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "rejected" });
    expect(rejectWithoutReason.status).toBe(422);

    const rejectWithReason = await request(app)
      .post(`/tm-tickets/${ticketId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "rejected", rejectionReason: "Missing daily log backup for the hours claimed." });
    expect(rejectWithReason.status).toBe(200);
    expect(rejectWithReason.body.status).toBe("rejected");

    const backToDraft = await request(app)
      .post(`/tm-tickets/${ticketId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "draft" });
    expect(backToDraft.status).toBe(200);
  });

  it("a subcontractor only sees T&M tickets billed under their own company", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const huda = memberByEmail("huda.masri@siteops.test");
    const ziad = memberByEmail("ziad.btoush@siteops.test");

    const hudaTicket = await request(app)
      .post("/tm-tickets")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, companyId: huda.companyId, workDate: "2026-01-17", description: "Sub1-scoping probe" });
    const ziadTicket = await request(app)
      .post("/tm-tickets")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, companyId: ziad.companyId, workDate: "2026-01-17", description: "Sub2-scoping probe" });

    const hudaToken = await loginAs("huda.masri@siteops.test");
    const hudaList = await request(app).get(`/tm-tickets?projectId=${projectId}`).set("authorization", `Bearer ${hudaToken}`);
    expect(hudaList.status).toBe(200);
    const hudaIds = hudaList.body.map((t: { id: string }) => t.id);
    expect(hudaIds).toContain(hudaTicket.body.id);
    expect(hudaIds).not.toContain(ziadTicket.body.id);
  });

  it("client_viewer (read-only) cannot create a T&M ticket", async () => {
    const token = await loginAs("karim.abughazaleh@siteops.test");
    const huda = memberByEmail("huda.masri@siteops.test");
    const res = await request(app)
      .post("/tm-tickets")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, companyId: huda.companyId, workDate: "2026-01-18", description: "Should be rejected" });
    expect(res.status).toBe(403);
  });
});

describe("Correspondence", () => {
  it("creates a letter and moves it through draft -> sent -> acknowledged -> closed", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const huda = memberByEmail("huda.masri@siteops.test");
    const omar = memberByEmail("omar.nassar@siteops.test");

    const create = await request(app)
      .post("/correspondence")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        direction: "outgoing",
        type: "notice",
        subject: "Notice to proceed with dewatering scope",
        body: "Please proceed with the dewatering scope discussed on site.",
        fromCompanyId: omar.companyId,
        toCompanyId: huda.companyId,
      });
    expect(create.status).toBe(201);
    expect(create.body.correspondenceNumber).toMatch(/^COR-\d{4}$/);
    expect(create.body.status).toBe("draft");
    const correspondenceId = create.body.id as string;

    const toSent = await request(app)
      .post(`/correspondence/${correspondenceId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "sent" });
    expect(toSent.status).toBe(200);
    expect(toSent.body.sentDate).toBeTruthy();

    const toAcknowledged = await request(app)
      .post(`/correspondence/${correspondenceId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "acknowledged" });
    expect(toAcknowledged.status).toBe(200);

    const toClosed = await request(app)
      .post(`/correspondence/${correspondenceId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "closed" });
    expect(toClosed.status).toBe(200);
    expect(toClosed.body.status).toBe("closed");

    const list = await request(app).get(`/correspondence?projectId=${projectId}`).set("authorization", `Bearer ${token}`);
    expect(list.body.some((c: { id: string }) => c.id === correspondenceId)).toBe(true);
  });

  it("a subcontractor only sees correspondence where their own company is sender or recipient", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const huda = memberByEmail("huda.masri@siteops.test");
    const ziad = memberByEmail("ziad.btoush@siteops.test");
    const omar = memberByEmail("omar.nassar@siteops.test");

    const toHuda = await request(app)
      .post("/correspondence")
      .set("authorization", `Bearer ${omarToken}`)
      .send({
        projectId,
        direction: "outgoing",
        type: "memo",
        subject: "For Huda's company only",
        body: "Scoping probe.",
        fromCompanyId: omar.companyId,
        toCompanyId: huda.companyId,
      });
    const toZiad = await request(app)
      .post("/correspondence")
      .set("authorization", `Bearer ${omarToken}`)
      .send({
        projectId,
        direction: "outgoing",
        type: "memo",
        subject: "For Ziad's company only",
        body: "Scoping probe.",
        fromCompanyId: omar.companyId,
        toCompanyId: ziad.companyId,
      });

    const hudaToken = await loginAs("huda.masri@siteops.test");
    const hudaList = await request(app).get(`/correspondence?projectId=${projectId}`).set("authorization", `Bearer ${hudaToken}`);
    const hudaIds = hudaList.body.map((c: { id: string }) => c.id);
    expect(hudaIds).toContain(toHuda.body.id);
    expect(hudaIds).not.toContain(toZiad.body.id);
  });

  it("client_viewer can read correspondence but cannot create it", async () => {
    const karimToken = await loginAs("karim.abughazaleh@siteops.test");
    const omar = memberByEmail("omar.nassar@siteops.test");
    const huda = memberByEmail("huda.masri@siteops.test");

    const readRes = await request(app).get(`/correspondence?projectId=${projectId}`).set("authorization", `Bearer ${karimToken}`);
    expect(readRes.status).toBe(200);

    const createRes = await request(app)
      .post("/correspondence")
      .set("authorization", `Bearer ${karimToken}`)
      .send({
        projectId,
        direction: "outgoing",
        type: "letter",
        subject: "Should be rejected",
        body: "Should be rejected.",
        fromCompanyId: omar.companyId,
        toCompanyId: huda.companyId,
      });
    expect(createRes.status).toBe(403);
  });
});
