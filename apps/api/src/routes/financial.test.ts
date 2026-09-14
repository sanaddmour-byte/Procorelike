import { schema } from "@siteops/db";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 6 (Financials) integration tests -- the Phase 6 gate: "a change
 * order flows through approval and updates the budget forecast correctly,
 * and client_viewer provably cannot reach any of it."
 *
 * The seeded GC-side users who default to standard+ change_management
 * access (owner_admin, project_manager) are both company "gc" -- there is
 * no seeded pair of standard-access users from two different companies to
 * exercise the "second approver from a different company" rule. Rather
 * than invent new seed users, this test grants huda.masri (company "sub1",
 * seeded on this project as a subcontractor) a per-project
 * change_management override directly via the RLS-bypassing authDb
 * connection, the same mechanism a not-yet-built invite/permissions-
 * management UI would use (docs/ROADMAP.md module tier #1 lists that UI as
 * still pending).
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

  const huda = memberByEmail("huda.masri@siteops.test");
  await clients.authDb.db
    .insert(schema.projectUserPermissions)
    .values({ projectId, userId: huda.userId, module: "change_management", level: "standard" })
    .onConflictDoNothing();
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

async function seedCostCodeId(): Promise<string> {
  const [costCode] = await clients.authDb.db.select().from(schema.costCodes).where(eq(schema.costCodes.projectId, projectId)).limit(1);
  if (!costCode) throw new Error("Seed cost code not found");
  return costCode.id;
}

async function createBudgetLineItem(token: string, originalAmount: number, forecastToComplete = 0): Promise<string> {
  const costCodeId = await seedCostCodeId();
  const res = await request(app)
    .post("/budget-line-items")
    .set("authorization", `Bearer ${token}`)
    .send({ projectId, costCodeId, originalAmount, forecastToComplete });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("Budget + Change Management (Phase 6 gate)", () => {
  it("approving a below-threshold 'prime' change order updates the budget line item in one step", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const lineItemId = await createBudgetLineItem(omarToken, 100000, 2000);

    const coRes = await request(app)
      .post("/change-orders")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, targetType: "prime", targetId: lineItemId, costImpact: 3000 });
    expect(coRes.status).toBe(201);
    expect(coRes.body.number).toMatch(/^CO-\d{3}$/);
    expect(coRes.body.status).toBe("draft");
    const changeOrderId = coRes.body.id as string;

    await request(app).post(`/change-orders/${changeOrderId}/submit`).set("authorization", `Bearer ${omarToken}`).expect(200);

    const approveRes = await request(app)
      .post(`/change-orders/${changeOrderId}/approve`)
      .set("authorization", `Bearer ${omarToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("approved"); // below the $5000 default threshold: one approver is enough

    const lineItemRes = await request(app).get("/budget-line-items").query({ projectId }).set("authorization", `Bearer ${omarToken}`);
    const lineItem = lineItemRes.body.find((li: { id: string }) => li.id === lineItemId);
    expect(Number(lineItem.approvedChangesAmount)).toBe(3000);
    expect(Number(lineItem.projectedAmount)).toBe(105000); // 100000 original + 3000 approved change + 2000 forecast
  });

  it("a change order at/above the threshold requires a second approver from a different company", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const lineItemId = await createBudgetLineItem(omarToken, 50000);

    const coRes = await request(app)
      .post("/change-orders")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, targetType: "prime", targetId: lineItemId, costImpact: 6000 }); // >= $5000 default threshold
    const changeOrderId = coRes.body.id as string;
    await request(app).post(`/change-orders/${changeOrderId}/submit`).set("authorization", `Bearer ${omarToken}`).expect(200);

    const firstApproval = await request(app)
      .post(`/change-orders/${changeOrderId}/approve`)
      .set("authorization", `Bearer ${omarToken}`);
    expect(firstApproval.status).toBe(200);
    expect(firstApproval.body.status).toBe("pending_approval"); // still waiting on a valid second approver

    // Same user can't approve twice.
    const selfReapprove = await request(app)
      .post(`/change-orders/${changeOrderId}/approve`)
      .set("authorization", `Bearer ${omarToken}`);
    expect(selfReapprove.status).toBe(400);

    // Sara is also company "gc", same as Omar -- not a valid second approver.
    const saraToken = await loginAs("sara.haddad@siteops.test");
    const sameCompanyApproval = await request(app)
      .post(`/change-orders/${changeOrderId}/approve`)
      .set("authorization", `Bearer ${saraToken}`);
    expect(sameCompanyApproval.status).toBe(403);

    // Huda (company "sub1", granted a change_management override in beforeAll) is valid.
    const hudaToken = await loginAs("huda.masri@siteops.test");
    const secondApproval = await request(app)
      .post(`/change-orders/${changeOrderId}/approve`)
      .set("authorization", `Bearer ${hudaToken}`);
    expect(secondApproval.status).toBe(200);
    expect(secondApproval.body.status).toBe("approved");
    expect(secondApproval.body.approvalChain).toHaveLength(2);

    const lineItemRes = await request(app).get("/budget-line-items").query({ projectId }).set("authorization", `Bearer ${omarToken}`);
    const lineItem = lineItemRes.body.find((li: { id: string }) => li.id === lineItemId);
    expect(Number(lineItem.approvedChangesAmount)).toBe(6000);
  });

  it("a change event can carry potential change orders before a real change order is cut", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const eventRes = await request(app)
      .post("/change-events")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, title: "Owner requested finish upgrade", potentialCostImpact: 8000 });
    expect(eventRes.status).toBe(201);
    const changeEventId = eventRes.body.id as string;

    const pcoRes = await request(app)
      .post(`/change-events/${changeEventId}/potential-change-orders`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ costImpact: 7500, timeImpactDays: 3 });
    expect(pcoRes.status).toBe(201);

    const detailRes = await request(app).get(`/change-events/${changeEventId}`).set("authorization", `Bearer ${omarToken}`);
    expect(detailRes.body.potentialChangeOrders).toHaveLength(1);
  });

  it("supports Procore's Change Event workflow status, Reason categories, a Change Order title, and the Executed flag", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const lineItemId = await createBudgetLineItem(omarToken, 50000, 0);

    const eventRes = await request(app)
      .post("/change-events")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, title: "Unforeseen rock excavation", reason: "unforeseen_condition" });
    expect(eventRes.status).toBe(201);
    expect(eventRes.body.status).toBe("open");
    expect(eventRes.body.reason).toBe("unforeseen_condition");
    const changeEventId = eventRes.body.id as string;

    // Void is a terminal status; open -> void is valid, but a second transition off void is not.
    const voidRes = await request(app)
      .post(`/change-events/${changeEventId}/transition`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ toStatus: "void" });
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.status).toBe("void");

    const reopenAttempt = await request(app)
      .post(`/change-events/${changeEventId}/transition`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ toStatus: "incorporated" });
    expect(reopenAttempt.status).toBe(409);
    expect(reopenAttempt.body.error.code).toBe("invalid_status_transition");

    // A change order carries its own title/reason and defaults isn't executed until marked so.
    const coRes = await request(app)
      .post("/change-orders")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, title: "Rock excavation CCO", reason: "unforeseen_condition", targetType: "prime", targetId: lineItemId, costImpact: 4000 });
    expect(coRes.status).toBe(201);
    expect(coRes.body.title).toBe("Rock excavation CCO");
    expect(coRes.body.reason).toBe("unforeseen_condition");
    expect(coRes.body.executed).toBe(false);
    const changeOrderId = coRes.body.id as string;

    // Can't execute before it's approved.
    const tooEarlyExecute = await request(app).post(`/change-orders/${changeOrderId}/execute`).set("authorization", `Bearer ${omarToken}`);
    expect(tooEarlyExecute.status).toBe(400);

    await request(app).post(`/change-orders/${changeOrderId}/submit`).set("authorization", `Bearer ${omarToken}`).expect(200);
    await request(app).post(`/change-orders/${changeOrderId}/approve`).set("authorization", `Bearer ${omarToken}`).expect(200);

    const executeRes = await request(app).post(`/change-orders/${changeOrderId}/execute`).set("authorization", `Bearer ${omarToken}`);
    expect(executeRes.status).toBe(200);
    expect(executeRes.body.executed).toBe(true);

    const secondExecute = await request(app).post(`/change-orders/${changeOrderId}/execute`).set("authorization", `Bearer ${omarToken}`);
    expect(secondExecute.status).toBe(400);
    expect(secondExecute.body.error.code).toBe("already_executed");
  });

  it("client_viewer is blocked from every financial module, per the RLS + permission-engine hard rule", async () => {
    const karimToken = await loginAs("karim.abughazaleh@siteops.test");

    const budgetRes = await request(app).get("/budget-line-items").query({ projectId }).set("authorization", `Bearer ${karimToken}`);
    expect(budgetRes.status).toBe(403);

    const commitmentsRes = await request(app).get("/commitments").query({ projectId }).set("authorization", `Bearer ${karimToken}`);
    expect(commitmentsRes.status).toBe(403);

    const changeEventsRes = await request(app).get("/change-events").query({ projectId }).set("authorization", `Bearer ${karimToken}`);
    expect(changeEventsRes.status).toBe(403);

    const changeOrdersRes = await request(app).get("/change-orders").query({ projectId }).set("authorization", `Bearer ${karimToken}`);
    expect(changeOrdersRes.status).toBe(403);

    const billingRes = await request(app).get("/payment-applications").query({ projectId }).set("authorization", `Bearer ${karimToken}`);
    expect(billingRes.status).toBe(403);
  });
});

describe("Commitments + Progress Billing", () => {
  it("SOV line items plus computed pay-application amounts, with retention withheld", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const huda = memberByEmail("huda.masri@siteops.test");
    const costCodeId = await seedCostCodeId();

    const commitmentRes = await request(app)
      .post("/commitments")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, companyId: huda.companyId, type: "subcontract", title: "Electrical rough-in", retentionPct: 10 });
    expect(commitmentRes.status).toBe(201);
    expect(commitmentRes.body.number).toMatch(/^SC-\d{3}$/);
    const commitmentId = commitmentRes.body.id as string;

    const lineItemRes = await request(app)
      .post(`/commitments/${commitmentId}/line-items`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ costCodeId, description: "Rough-in labor and material", scheduleOfValuesAmount: 100000 });
    expect(lineItemRes.status).toBe(201);
    const sovLineId = lineItemRes.body.id as string;

    const commitmentDetail = await request(app).get(`/commitments/${commitmentId}`).set("authorization", `Bearer ${omarToken}`);
    expect(commitmentDetail.body.contractValue).toBe(100000);

    const payAppRes = await request(app)
      .post("/payment-applications")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, commitmentId, periodStart: "2026-01-01", periodEnd: "2026-01-31", retentionPct: 10 });
    expect(payAppRes.status).toBe(201);
    const payAppId = payAppRes.body.id as string;

    const setLinesRes = await request(app)
      .put(`/payment-applications/${payAppId}/lines`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ lines: [{ sovLineId, pctCompleteThisPeriod: 20 }] });
    expect(setLinesRes.status).toBe(200);
    expect(Number(setLinesRes.body[0].pctCompletePrevious)).toBe(0); // first application against this commitment

    const detailRes = await request(app).get(`/payment-applications/${payAppId}`).set("authorization", `Bearer ${omarToken}`);
    expect(detailRes.body.lines).toHaveLength(1);
    expect(detailRes.body.lines[0].completedToDate).toBe(20000);
    expect(detailRes.body.lines[0].retentionThisPeriod).toBe(2000);
    expect(detailRes.body.lines[0].netThisPeriod).toBe(18000);
    expect(detailRes.body.totalNetThisPeriod).toBe(18000);

    const transitionRes = await request(app)
      .post(`/payment-applications/${payAppId}/transition`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ toStatus: "submitted" });
    expect(transitionRes.status).toBe(200);
    expect(transitionRes.body.status).toBe("submitted");

    // A second application picks up "previous" from the first automatically.
    const payApp2Res = await request(app)
      .post("/payment-applications")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, commitmentId, periodStart: "2026-02-01", periodEnd: "2026-02-28", retentionPct: 10 });
    const payApp2Id = payApp2Res.body.id as string;
    const setLines2Res = await request(app)
      .put(`/payment-applications/${payApp2Id}/lines`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ lines: [{ sovLineId, pctCompleteThisPeriod: 50 }] });
    expect(Number(setLines2Res.body[0].pctCompletePrevious)).toBe(20); // chained from the first application
  });
});
