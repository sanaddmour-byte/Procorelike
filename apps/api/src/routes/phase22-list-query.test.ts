import { schema } from "@siteops/db";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 22's rollout of the Phase 21 server-query contract (search/filter/
 * sort/pagination) to Submittals, Change Orders, Punch List, and
 * Commitments -- one backward-compatibility + filter/sort/pagination
 * sweep per module, mirroring rfi-list-query.test.ts. Preconditions: same
 * seeded Postgres as apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";
const MARKER = `zqxw${Date.now()}`;

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
let specSectionId: string;
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

  const specSectionsRes = await request(app).get("/submittals/spec-sections").query({ projectId }).set("authorization", `Bearer ${adminToken}`);
  specSectionId = specSectionsRes.body[0].id as string;

  const [costCode] = await clients.authDb.db.select().from(schema.costCodes).where(eq(schema.costCodes.projectId, projectId)).limit(1);
  if (!costCode) throw new Error("Seed cost code not found");
  costCodeId = costCode.id;
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

describe("GET /submittals query contract (Phase 22)", () => {
  async function createSubmittal(title: string, opts: { ballInCourtUserId?: string; isPrivate?: boolean } = {}): Promise<{ id: string; number: string }> {
    const res = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, specSectionId, title, ...opts });
    expect(res.status).toBe(201);
    return res.body as { id: string; number: string };
  }

  it("with no query params, returns a plain array of every visible row (backward compatible)", async () => {
    const created = await createSubmittal(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/submittals?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches title or number, and status/assignee filters narrow results", async () => {
    const khalid = memberByEmail("khalid.zoubi@siteops.test");
    const created = await createSubmittal(`${MARKER} assignee filter`, { ballInCourtUserId: khalid.userId });

    const bySearch = await request(app).get(`/submittals?projectId=${projectId}&search=${encodeURIComponent(MARKER)}`).set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body.map((s: { id: string }) => s.id)).toContain(created.id);

    const byAssignee = await request(app)
      .get(`/submittals?projectId=${projectId}&search=${encodeURIComponent(MARKER)}&assigneeUserId=${khalid.userId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byAssignee.body.map((s: { id: string }) => s.id)).toContain(created.id);

    const byStatus = await request(app)
      .get(`/submittals?projectId=${projectId}&search=${encodeURIComponent(MARKER)}&status=draft`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byStatus.body.map((s: { id: string }) => s.id)).toContain(created.id);
  });

  it("sorts by title and paginates with the true total in X-Total-Count", async () => {
    const pageMarker = `${MARKER}-page`;
    await createSubmittal(`${pageMarker}-aaa`);
    await createSubmittal(`${pageMarker}-bbb`);
    await createSubmittal(`${pageMarker}-ccc`);

    const asc = await request(app)
      .get(`/submittals?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=title&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(asc.body).toHaveLength(2);
    expect(asc.headers["x-total-count"]).toBe("3");
    expect(asc.body[0].title).toBe(`${pageMarker}-aaa`);

    const secondPage = await request(app)
      .get(`/submittals?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=title&direction=asc&pageSize=2&page=2`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(secondPage.body).toHaveLength(1);
    expect(secondPage.body[0].title).toBe(`${pageMarker}-ccc`);
  });

  it("excludes a private submittal from both the results and the total count for a caller with no access to it", async () => {
    const privateMarker = `${MARKER}-private`;
    await createSubmittal(privateMarker, { isPrivate: true });

    const outsiderToken = await loginAs("karim.abughazaleh@siteops.test");
    const asOutsider = await request(app)
      .get(`/submittals?projectId=${projectId}&search=${encodeURIComponent(privateMarker)}`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(asOutsider.body).toHaveLength(0);
    expect(asOutsider.headers["x-total-count"]).toBe("0");

    const asCreator = await request(app)
      .get(`/submittals?projectId=${projectId}&search=${encodeURIComponent(privateMarker)}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(asCreator.body).toHaveLength(1);
    expect(asCreator.headers["x-total-count"]).toBe("1");
  });
});

describe("GET /change-orders query contract (Phase 22)", () => {
  async function createBudgetLineItem(): Promise<string> {
    const res = await request(app)
      .post("/budget-line-items")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, costCodeId, originalAmount: 100000, forecastToComplete: 0 });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function createChangeOrder(title: string, costImpact: number): Promise<{ id: string; number: string }> {
    const lineItemId = await createBudgetLineItem();
    const res = await request(app)
      .post("/change-orders")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, title, targetType: "prime", targetId: lineItemId, costImpact });
    expect(res.status).toBe(201);
    return res.body as { id: string; number: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createChangeOrder(`${MARKER} backward-compat check`, 1000);
    const res = await request(app).get(`/change-orders?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches title or number, and status filters narrow results", async () => {
    const created = await createChangeOrder(`${MARKER} status filter`, 1500);

    const bySearch = await request(app).get(`/change-orders?projectId=${projectId}&search=${encodeURIComponent(MARKER)}`).set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body.map((c: { id: string }) => c.id)).toContain(created.id);

    const byStatus = await request(app)
      .get(`/change-orders?projectId=${projectId}&search=${encodeURIComponent(MARKER)}&status=draft`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byStatus.body.map((c: { id: string }) => c.id)).toContain(created.id);
  });

  it("sorts by title and paginates with the true total in X-Total-Count", async () => {
    const pageMarker = `${MARKER}-co-page`;
    await createChangeOrder(`${pageMarker}-aaa`, 100);
    await createChangeOrder(`${pageMarker}-bbb`, 200);
    await createChangeOrder(`${pageMarker}-ccc`, 300);

    const firstPage = await request(app)
      .get(`/change-orders?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=title&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].title).toBe(`${pageMarker}-aaa`);
  });
});

describe("GET /punch-items query contract (Phase 22)", () => {
  async function createPunchItem(description: string, assigneeUserId?: string): Promise<{ id: string; number: string }> {
    const res = await request(app)
      .post("/punch-items")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, description, assigneeUserId });
    expect(res.status).toBe(201);
    return res.body as { id: string; number: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createPunchItem(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/punch-items?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches description or number, and status/assignee filters narrow results", async () => {
    const khalid = memberByEmail("khalid.zoubi@siteops.test");
    const created = await createPunchItem(`${MARKER} assignee filter`, khalid.userId);

    const bySearch = await request(app).get(`/punch-items?projectId=${projectId}&search=${encodeURIComponent(MARKER)}`).set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body.map((p: { id: string }) => p.id)).toContain(created.id);

    const byAssignee = await request(app)
      .get(`/punch-items?projectId=${projectId}&search=${encodeURIComponent(MARKER)}&assigneeUserId=${khalid.userId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byAssignee.body.map((p: { id: string }) => p.id)).toContain(created.id);

    const byStatus = await request(app)
      .get(`/punch-items?projectId=${projectId}&search=${encodeURIComponent(MARKER)}&status=open`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byStatus.body.map((p: { id: string }) => p.id)).toContain(created.id);
  });

  it("sorts by number and paginates with the true total in X-Total-Count", async () => {
    const pageMarker = `${MARKER}-pi-page`;
    await createPunchItem(`${pageMarker}-1`);
    await createPunchItem(`${pageMarker}-2`);
    await createPunchItem(`${pageMarker}-3`);

    const firstPage = await request(app)
      .get(`/punch-items?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=number&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
  });

  it("sorts by description (the list page's Description column header, which is sortable client-side)", async () => {
    const pageMarker = `${MARKER}-pi-desc`;
    await createPunchItem(`${pageMarker}-bbb`);
    await createPunchItem(`${pageMarker}-aaa`);

    const res = await request(app)
      .get(`/punch-items?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=description&direction=asc`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0].description).toBe(`${pageMarker}-aaa`);
  });
});

describe("GET /commitments query contract (Phase 22)", () => {
  async function createCommitment(title: string, opts: { companyId?: string; type?: "subcontract" | "po" } = {}): Promise<{ id: string; number: string }> {
    const huda = memberByEmail("huda.masri@siteops.test");
    const res = await request(app)
      .post("/commitments")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, title, companyId: opts.companyId ?? huda.companyId, type: opts.type ?? "subcontract" });
    expect(res.status).toBe(201);
    return res.body as { id: string; number: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createCommitment(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/commitments?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches title or number, and the type filter narrows results", async () => {
    const created = await createCommitment(`${MARKER} type filter`, { type: "po" });

    const bySearch = await request(app).get(`/commitments?projectId=${projectId}&search=${encodeURIComponent(MARKER)}`).set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body.map((c: { id: string }) => c.id)).toContain(created.id);

    const byType = await request(app)
      .get(`/commitments?projectId=${projectId}&search=${encodeURIComponent(MARKER)}&type=po`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byType.body.map((c: { id: string }) => c.id)).toContain(created.id);

    const byOtherType = await request(app)
      .get(`/commitments?projectId=${projectId}&search=${encodeURIComponent(MARKER)}&type=subcontract`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byOtherType.body.map((c: { id: string }) => c.id)).not.toContain(created.id);
  });

  it("sorts by title and paginates with the true total in X-Total-Count", async () => {
    const pageMarker = `${MARKER}-cm-page`;
    await createCommitment(`${pageMarker}-aaa`);
    await createCommitment(`${pageMarker}-bbb`);
    await createCommitment(`${pageMarker}-ccc`);

    const firstPage = await request(app)
      .get(`/commitments?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=title&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].title).toBe(`${pageMarker}-aaa`);
  });
});
