import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 4 (Workflow core) integration tests: the RFI lifecycle across
 * three distinct users, ball-in-court tracking, the overdue computed
 * flag, and the subcontractor-visibility RLS rule flagged as deferred in
 * the Phase 1 gate report. Preconditions: same seeded Postgres as
 * apps/api/src/routes/integration.test.ts.
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

describe("RFI lifecycle across three users", () => {
  it("draft -> open -> answered (official response, ball flips back) -> closed", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test");
    const omar = memberByEmail("omar.nassar@siteops.test");

    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${omarToken}`)
      .send({
        projectId,
        subject: "Rebar spacing at grid line C",
        question: "Drawing S-201 shows 200mm spacing but the spec calls for 150mm. Which governs?",
        ballInCourtUserId: lina.userId,
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("draft");
    expect(createRes.body.number).toMatch(/^RFI-\d{4}$/);
    const rfiId = createRes.body.id as string;

    const openRes = await request(app)
      .post(`/rfis/${rfiId}/transition`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ toStatus: "open" });
    expect(openRes.status).toBe(200);
    expect(openRes.body.status).toBe("open");

    // User 2: Lina (ball-in-court) posts a non-official response, then the official one.
    const linaToken = await loginAs("lina.kanaan@siteops.test");
    const draftResponseRes = await request(app)
      .post(`/rfis/${rfiId}/responses`)
      .set("authorization", `Bearer ${linaToken}`)
      .send({ responseText: "Checking with the structural engineer, will confirm shortly." });
    expect(draftResponseRes.status).toBe(201);
    expect(draftResponseRes.body.isOfficial).toBe(false);

    const officialResponseRes = await request(app)
      .post(`/rfis/${rfiId}/responses`)
      .set("authorization", `Bearer ${linaToken}`)
      .send({ responseText: "Spec governs: use 150mm spacing per Section 03.20.00.", isOfficial: true });
    expect(officialResponseRes.status).toBe(201);
    expect(officialResponseRes.body.isOfficial).toBe(true);

    const afterAnswer = await request(app).get(`/rfis/${rfiId}`).set("authorization", `Bearer ${omarToken}`);
    expect(afterAnswer.body.status).toBe("answered");
    expect(afterAnswer.body.ballInCourtUserId).toBe(omar.userId); // ball flipped back to the asker
    expect(afterAnswer.body.responses).toHaveLength(2);
    expect(afterAnswer.body.responses.filter((r: { isOfficial: boolean }) => r.isOfficial)).toHaveLength(1);

    // User 3: Sara (owner_admin) closes it out.
    const saraToken = await loginAs("sara.haddad@siteops.test");
    const closeRes = await request(app)
      .post(`/rfis/${rfiId}/transition`)
      .set("authorization", `Bearer ${saraToken}`)
      .send({ toStatus: "closed" });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.status).toBe("closed");

    const rejectedTransition = await request(app)
      .post(`/rfis/${rfiId}/transition`)
      .set("authorization", `Bearer ${saraToken}`)
      .send({ toStatus: "open" });
    expect(rejectedTransition.status).toBe(400);
  });

  it("allows manually reassigning the ball-in-court user via PATCH", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test");
    const rana = memberByEmail("rana.odeh@siteops.test");

    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${omarToken}`)
      .send({
        projectId,
        subject: "Waterproofing detail at parapet",
        question: "Which membrane detail applies at the parapet-to-roof transition?",
        ballInCourtUserId: lina.userId,
      });
    expect(createRes.status).toBe(201);
    const rfiId = createRes.body.id as string;

    const reassignRes = await request(app)
      .patch(`/rfis/${rfiId}`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ ballInCourtUserId: rana.userId });
    expect(reassignRes.status).toBe(200);
    expect(reassignRes.body.ballInCourtUserId).toBe(rana.userId);

    const detailRes = await request(app).get(`/rfis/${rfiId}`).set("authorization", `Bearer ${omarToken}`);
    expect(detailRes.body.ballInCourtUserId).toBe(rana.userId);
  });

  it("computes isOverdue from status + dueDate rather than storing it", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const pastDueDate = "2020-01-01";

    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, subject: "Overdue test RFI", question: "Does this compute as overdue?", dueDate: pastDueDate });
    const rfiId = createRes.body.id as string;
    expect(createRes.body.isOverdue).toBe(false); // still draft, not open yet

    await request(app).post(`/rfis/${rfiId}/transition`).set("authorization", `Bearer ${token}`).send({ toStatus: "open" });

    const detailRes = await request(app).get(`/rfis/${rfiId}`).set("authorization", `Bearer ${token}`);
    expect(detailRes.body.isOverdue).toBe(true);

    const listRes = await request(app).get("/rfis").query({ projectId }).set("authorization", `Bearer ${token}`);
    const listed = listRes.body.find((r: { id: string }) => r.id === rfiId);
    expect(listed.isOverdue).toBe(true);
  });

  it("a subcontractor only sees RFIs where their company is ball-in-court or distributed", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const huda = memberByEmail("huda.masri@siteops.test"); // sub1: Rawafed Electrical Works

    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${omarToken}`)
      .send({
        projectId,
        subject: "Conduit routing conflict",
        question: "Please confirm conduit routing around the beam at grid B4.",
        ballInCourtCompanyId: huda.companyId,
      });
    expect(createRes.status).toBe(201);
    const rfiId = createRes.body.id as string;

    const hudaToken = await loginAs("huda.masri@siteops.test");
    const hudaSeesIt = await request(app).get(`/rfis/${rfiId}`).set("authorization", `Bearer ${hudaToken}`);
    expect(hudaSeesIt.status).toBe(200);
    const hudaList = await request(app).get("/rfis").query({ projectId }).set("authorization", `Bearer ${hudaToken}`);
    expect(hudaList.body.some((r: { id: string }) => r.id === rfiId)).toBe(true);

    const ziadToken = await loginAs("ziad.btoush@siteops.test");
    const ziadSeesIt = await request(app).get(`/rfis/${rfiId}`).set("authorization", `Bearer ${ziadToken}`);
    expect(ziadSeesIt.status).toBe(404);
    const ziadList = await request(app).get("/rfis").query({ projectId }).set("authorization", `Bearer ${ziadToken}`);
    expect(ziadList.body.some((r: { id: string }) => r.id === rfiId)).toBe(false);
  });
});
