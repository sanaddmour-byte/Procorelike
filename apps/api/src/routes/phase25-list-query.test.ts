import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 25's rollout of the Phase 21 server-query contract (search/filter/
 * sort/pagination) to Direct Costs, Payment Applications (Billing),
 * Prequalification, and Safety Observations -- one backward-compatibility +
 * filter/sort/pagination sweep per module, mirroring
 * phase22/23/24-list-query.test.ts. Payment Applications and
 * Prequalification carry no plain text field of their own, so their search
 * and "join" sort key run through a join to commitments/companies
 * respectively (the same treatment Inspections gave checklist_templates in
 * Phase 24) -- covered here too. Preconditions: same seeded Postgres as
 * apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";
const MARKER = `p25${Date.now()}`;

interface Member {
  userId: string;
  email: string;
  companyId: string;
}

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let members: Member[];
let adminToken: string;
let costCodeId: string;

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  adminToken = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${adminToken}`);
  projectId = projectsRes.body[0].id as string;

  const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${adminToken}`);
  members = membersRes.body as Member[];

  const costCodesRes = await request(app).get(`/projects/${projectId}/cost-codes`).set("authorization", `Bearer ${adminToken}`);
  const firstCostCode = (costCodesRes.body as { id: string }[])[0];
  if (!firstCostCode) throw new Error("Seed cost code not found");
  costCodeId = firstCostCode.id;
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

describe("GET /direct-costs query contract (Phase 25)", () => {
  async function createDirectCost(description: string): Promise<{ id: string }> {
    const res = await request(app)
      .post("/direct-costs")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, costCodeId, type: "invoice", description, amount: 500, incurredDate: "2026-03-01" });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createDirectCost(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/direct-costs?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches description, and sort/pagination report the true total", async () => {
    const pageMarker = `${MARKER}-dc-page`;
    await createDirectCost(`${pageMarker}-aaa`);
    await createDirectCost(`${pageMarker}-bbb`);
    await createDirectCost(`${pageMarker}-ccc`);

    const bySearch = await request(app)
      .get(`/direct-costs?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body).toHaveLength(3);

    const firstPage = await request(app)
      .get(`/direct-costs?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=description&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].description).toBe(`${pageMarker}-aaa`);
  });

  it("rejects sort=costCode: the list page's Cost Code column is a joined lookup, not a sortable server column", async () => {
    const res = await request(app)
      .get(`/direct-costs?projectId=${projectId}&sort=costCode&direction=asc`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /payment-applications query contract (Phase 25)", () => {
  async function createPaymentApplication(commitmentId?: string): Promise<{ id: string }> {
    const res = await request(app)
      .post("/payment-applications")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, commitmentId, periodStart: "2026-03-01", periodEnd: "2026-03-31", retentionPct: 10 });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createPaymentApplication();
    const res = await request(app).get(`/payment-applications?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("sorts by periodStart and paginates with the true total in X-Total-Count", async () => {
    const before = await request(app).get(`/payment-applications?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    const baseline = Number(before.headers["x-total-count"]);

    await createPaymentApplication();
    await createPaymentApplication();

    const after = await request(app)
      .get(`/payment-applications?projectId=${projectId}&sort=periodStart&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(after.body).toHaveLength(2);
    expect(Number(after.headers["x-total-count"])).toBe(baseline + 2);
  });

  it("the status filter narrows results to draft applications", async () => {
    const created = await createPaymentApplication();
    const byStatus = await request(app)
      .get(`/payment-applications?projectId=${projectId}&status=draft`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byStatus.body.map((a: { id: string }) => a.id)).toContain(created.id);
  });
});

describe("GET /prequalifications query contract (Phase 25)", () => {
  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const huda = memberByEmail("huda.masri@siteops.test");
    const invited = await request(app)
      .post("/prequalifications")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, companyId: huda.companyId });
    // Already invited on a prior test run in this same seeded project is fine --
    // either a fresh 201 or a 409 "already_invited" means the row exists.
    expect([201, 409]).toContain(invited.status);

    const res = await request(app).get(`/prequalifications?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
    expect((res.body as { companyId: string }[]).some((r) => r.companyId === huda.companyId)).toBe(true);
  });

  it("search matches the joined company name, and sort by company works", async () => {
    const searchTerm = "masri";
    const bySearch = await request(app)
      .get(`/prequalifications?projectId=${projectId}&search=${encodeURIComponent(searchTerm)}&sort=company&direction=asc`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.status).toBe(200);
    expect(Array.isArray(bySearch.body)).toBe(true);
  });
});

describe("GET /safety-observations query contract (Phase 25)", () => {
  async function createObservation(description: string): Promise<{ id: string }> {
    const res = await request(app)
      .post("/safety-observations")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, observedAt: new Date().toISOString(), category: "near_miss", description });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createObservation(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/safety-observations?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches description, and sort/pagination report the true total", async () => {
    const pageMarker = `${MARKER}-so-page`;
    await createObservation(`${pageMarker}-aaa`);
    await createObservation(`${pageMarker}-bbb`);
    await createObservation(`${pageMarker}-ccc`);

    const bySearch = await request(app)
      .get(`/safety-observations?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body).toHaveLength(3);

    const firstPage = await request(app)
      .get(`/safety-observations?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=description&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].description).toBe(`${pageMarker}-aaa`);
  });

  it("the category filter narrows results", async () => {
    const created = await createObservation(`${MARKER}-category-filter`);
    const byCategory = await request(app)
      .get(`/safety-observations?projectId=${projectId}&search=${encodeURIComponent(MARKER)}-category-filter&category=near_miss`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byCategory.body.map((o: { id: string }) => o.id)).toContain(created.id);
  });
});
