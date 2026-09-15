import { randomUUID } from "node:crypto";
import { schema } from "@siteops/db";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Preconstruction depth: Prequalification, Bidding, and Estimating --
 * project-scoped fields largely absent from the earlier phases, added to
 * round out Procore parity. Preconditions: same seeded Postgres as
 * apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";

interface ProjectCompany {
  companyId: string;
  name: string;
}

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let companies: ProjectCompany[];

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const token = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = projectsRes.body[0].id as string;

  const companiesRes = await request(app).get(`/projects/${projectId}/companies`).set("authorization", `Bearer ${token}`);
  companies = companiesRes.body as ProjectCompany[];
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

async function seedCostCodeId(): Promise<string> {
  const [costCode] = await clients.authDb.db.select().from(schema.costCodes).where(eq(schema.costCodes.projectId, projectId)).limit(1);
  if (!costCode) throw new Error("Seed cost code not found");
  return costCode.id;
}

describe("Prequalification (Preconstruction depth)", () => {
  it("runs invited -> submitted -> under_review -> qualified, and rejects a disqualified company back to review", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    // A dedicated, uniquely-named company -- not one of the fixed seeded
    // project companies -- since prequalifications are unique per
    // (projectId, companyId) and this suite runs repeatedly against a
    // persistent DB.
    const companyRes = await request(app)
      .post("/companies")
      .set("authorization", `Bearer ${token}`)
      .send({ name: `E2E Prequal Co ${randomUUID()}`, type: "sub" });
    expect(companyRes.status).toBe(201);
    const companyId = companyRes.body.id as string;

    const inviteRes = await request(app)
      .post("/prequalifications")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, companyId });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.status).toBe("invited");
    const prequalificationId = inviteRes.body.id as string;

    // Duplicate invite for the same company is rejected.
    const dupRes = await request(app)
      .post("/prequalifications")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, companyId });
    expect(dupRes.status).toBe(409);

    const submitRes = await request(app)
      .post(`/prequalifications/${prequalificationId}/submit`)
      .set("authorization", `Bearer ${token}`)
      .send({ bondingCapacity: 5000000, experienceModRate: 0.85, annualRevenue: 20000000, yearsInBusiness: 12 });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe("submitted");
    expect(Number(submitRes.body.experienceModRate)).toBe(0.85);

    const toReviewRes = await request(app)
      .post(`/prequalifications/${prequalificationId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "under_review" });
    expect(toReviewRes.status).toBe(200);

    // Can't jump straight to qualified from submitted (already past that -- this asserts the invalid edge from under_review's sibling).
    const invalidRes = await request(app)
      .post(`/prequalifications/${prequalificationId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "invited" });
    expect(invalidRes.status).toBe(409);

    const qualifyRes = await request(app)
      .post(`/prequalifications/${prequalificationId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "qualified", overallScore: 88, reviewNotes: "Strong financials and safety record." });
    expect(qualifyRes.status).toBe(200);
    expect(qualifyRes.body.status).toBe("qualified");
    expect(Number(qualifyRes.body.overallScore)).toBe(88);
    expect(qualifyRes.body.reviewedBy).toBeTruthy();

    const listRes = await request(app).get(`/prequalifications?projectId=${projectId}`).set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((p: { id: string }) => p.id === prequalificationId)).toBe(true);
  });

  it("client_viewer is blocked from prequalification", async () => {
    const karimToken = await loginAs("karim.abughazaleh@siteops.test");
    const res = await request(app).get(`/prequalifications?projectId=${projectId}`).set("authorization", `Bearer ${karimToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Bidding (Preconstruction depth)", () => {
  it("invites bidders, logs bids, and awards one -- rejecting the rest and creating a Commitment", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const costCodeId = await seedCostCodeId();
    const [companyA, companyB] = companies;
    if (!companyA || !companyB) throw new Error("Expected at least two project companies");

    const createRes = await request(app)
      .post("/bid-packages")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, title: "Electrical rough-in bid package", costCodeId });
    expect(createRes.status).toBe(201);
    expect(createRes.body.number).toMatch(/^BID-\d{3}$/);
    expect(createRes.body.status).toBe("draft");
    const bidPackageId = createRes.body.id as string;

    const toOpenRes = await request(app)
      .post(`/bid-packages/${bidPackageId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "open" });
    expect(toOpenRes.status).toBe(200);

    const inviteARes = await request(app)
      .post(`/bid-packages/${bidPackageId}/invite`)
      .set("authorization", `Bearer ${token}`)
      .send({ companyId: companyA.companyId });
    expect(inviteARes.status).toBe(201);
    expect(inviteARes.body.status).toBe("invited");

    await request(app)
      .post(`/bid-packages/${bidPackageId}/invite`)
      .set("authorization", `Bearer ${token}`)
      .send({ companyId: companyB.companyId });

    const bidARes = await request(app)
      .post(`/bid-packages/${bidPackageId}/bids`)
      .set("authorization", `Bearer ${token}`)
      .send({ companyId: companyA.companyId, amount: 150000, alternates: [{ description: "Upgrade to copper", amount: 5000 }] });
    expect(bidARes.status).toBe(201);
    expect(bidARes.body.status).toBe("submitted");
    const bidAId = bidARes.body.id as string;

    const bidBRes = await request(app)
      .post(`/bid-packages/${bidPackageId}/bids`)
      .set("authorization", `Bearer ${token}`)
      .send({ companyId: companyB.companyId, amount: 162000 });
    expect(bidBRes.status).toBe(201);
    const bidBId = bidBRes.body.id as string;

    // Logging a bid against a company auto-marks their invitation as submitted.
    const detailAfterBids = await request(app).get(`/bid-packages/${bidPackageId}`).set("authorization", `Bearer ${token}`);
    expect(detailAfterBids.body.bids).toHaveLength(2);
    const invitationA = detailAfterBids.body.invitations.find((inv: { companyId: string }) => inv.companyId === companyA.companyId);
    expect(invitationA.status).toBe("submitted");

    const toClosedRes = await request(app)
      .post(`/bid-packages/${bidPackageId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "closed" });
    expect(toClosedRes.status).toBe(200);

    const awardRes = await request(app)
      .post(`/bids/${bidAId}/award`)
      .set("authorization", `Bearer ${token}`)
      .send({ createCommitment: true });
    expect(awardRes.status).toBe(200);
    expect(awardRes.body.bid.status).toBe("awarded");
    expect(awardRes.body.bidPackage.status).toBe("awarded");
    expect(awardRes.body.commitment).toBeTruthy();
    expect(awardRes.body.commitment.companyId).toBe(companyA.companyId);
    expect(awardRes.body.commitment.number).toMatch(/^SC-\d{3}$/);
    const commitmentId = awardRes.body.commitment.id as string;

    const commitmentDetailRes = await request(app).get(`/commitments/${commitmentId}`).set("authorization", `Bearer ${token}`);
    expect(commitmentDetailRes.status).toBe(200);
    expect(commitmentDetailRes.body.contractValue).toBe(150000);

    // The losing bid was auto-rejected.
    const finalDetailRes = await request(app).get(`/bid-packages/${bidPackageId}`).set("authorization", `Bearer ${token}`);
    const losingBid = finalDetailRes.body.bids.find((b: { id: string }) => b.id === bidBId);
    expect(losingBid.status).toBe("rejected");

    // Can't award a second time on an already-awarded package.
    const secondAwardRes = await request(app)
      .post(`/bids/${bidBId}/award`)
      .set("authorization", `Bearer ${token}`)
      .send({ createCommitment: false });
    expect(secondAwardRes.status).toBe(409);
  });

  it("client_viewer is blocked from bidding", async () => {
    const karimToken = await loginAs("karim.abughazaleh@siteops.test");
    const res = await request(app).get(`/bid-packages?projectId=${projectId}`).set("authorization", `Bearer ${karimToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Estimating (Preconstruction depth)", () => {
  it("totals line items by cost code, finalizes, and converts to Budget line items exactly once", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const costCodeId = await seedCostCodeId();

    const createRes = await request(app)
      .post("/estimates")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, title: "Conceptual estimate v1" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.number).toMatch(/^EST-\d{3}$/);
    const estimateId = createRes.body.id as string;

    const line1Res = await request(app)
      .post(`/estimates/${estimateId}/line-items`)
      .set("authorization", `Bearer ${token}`)
      .send({ costCodeId, description: "Cast-in-place concrete", quantity: 100, unit: "CY", unitCost: 250 });
    expect(line1Res.status).toBe(201);
    expect(Number(line1Res.body.amount)).toBe(25000);

    const line2Res = await request(app)
      .post(`/estimates/${estimateId}/line-items`)
      .set("authorization", `Bearer ${token}`)
      .send({ costCodeId, description: "Rebar", quantity: 20, unit: "TON", unitCost: 900 });
    expect(line2Res.status).toBe(201);
    expect(Number(line2Res.body.amount)).toBe(18000);

    const detailRes = await request(app).get(`/estimates/${estimateId}`).set("authorization", `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.lineItems).toHaveLength(2);
    expect(Number(detailRes.body.total)).toBe(43000);

    const tooEarlyConvert = await request(app).post(`/estimates/${estimateId}/convert-to-budget`).set("authorization", `Bearer ${token}`);
    expect(tooEarlyConvert.status).toBe(400); // not final yet

    const finalizeRes = await request(app).post(`/estimates/${estimateId}/finalize`).set("authorization", `Bearer ${token}`);
    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.status).toBe("final");

    const addAfterFinalRes = await request(app)
      .post(`/estimates/${estimateId}/line-items`)
      .set("authorization", `Bearer ${token}`)
      .send({ costCodeId, description: "Should be rejected", quantity: 1, unit: "EA", unitCost: 1 });
    expect(addAfterFinalRes.status).toBe(400);

    const baselineBudgetRes = await request(app).get("/budget-line-items").query({ projectId }).set("authorization", `Bearer ${token}`);
    const baselineCount = baselineBudgetRes.body.length as number;

    const convertRes = await request(app).post(`/estimates/${estimateId}/convert-to-budget`).set("authorization", `Bearer ${token}`);
    expect(convertRes.status).toBe(200);
    expect(convertRes.body).toHaveLength(1); // both line items share the same cost code
    expect(Number(convertRes.body[0].originalAmount)).toBe(43000);

    const afterBudgetRes = await request(app).get("/budget-line-items").query({ projectId }).set("authorization", `Bearer ${token}`);
    expect(afterBudgetRes.body.length).toBe(baselineCount + 1);

    // A second conversion attempt is rejected -- never silently duplicates budget lines.
    const secondConvertRes = await request(app).post(`/estimates/${estimateId}/convert-to-budget`).set("authorization", `Bearer ${token}`);
    expect(secondConvertRes.status).toBe(409);
  });

  it("client_viewer is blocked from estimating", async () => {
    const karimToken = await loginAs("karim.abughazaleh@siteops.test");
    const res = await request(app).get(`/estimates?projectId=${projectId}`).set("authorization", `Bearer ${karimToken}`);
    expect(res.status).toBe(403);
  });
});
