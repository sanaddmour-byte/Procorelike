import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 26's rollout of the Phase 21 server-query contract (search/filter/
 * sort/pagination) to Schedule, Bidding, and Estimating -- the last three
 * list modules in the app, closing out the initiative started in Phase 21.
 * One backward-compatibility + search/filter/sort/pagination sweep per
 * module, mirroring phase22/23/24/25-list-query.test.ts, plus a
 * sort=costCode 400-rejection regression test for Bidding (its Cost Code
 * column is a joined lookup, same shape as Direct Costs' in Phase 25).
 * Preconditions: same seeded Postgres as apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";
const MARKER = `p26${Date.now()}`;

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let adminToken: string;

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  adminToken = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${adminToken}`);
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

describe("GET /schedule-tasks query contract (Phase 26)", () => {
  async function createTask(name: string): Promise<{ id: string }> {
    const res = await request(app)
      .post("/schedule-tasks")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, name, startDate: "2026-04-01", endDate: "2026-04-15" });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createTask(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/schedule-tasks?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches name, and sort/pagination report the true total", async () => {
    const pageMarker = `${MARKER}-st-page`;
    await createTask(`${pageMarker}-aaa`);
    await createTask(`${pageMarker}-bbb`);
    await createTask(`${pageMarker}-ccc`);

    const bySearch = await request(app)
      .get(`/schedule-tasks?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body).toHaveLength(3);

    const firstPage = await request(app)
      .get(`/schedule-tasks?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=name&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].name).toBe(`${pageMarker}-aaa`);
  });

  it("the status filter narrows results to not_started tasks", async () => {
    const created = await createTask(`${MARKER}-status-filter`);
    const byStatus = await request(app)
      .get(`/schedule-tasks?projectId=${projectId}&search=${encodeURIComponent(MARKER)}-status-filter&status=not_started`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byStatus.body.map((t: { id: string }) => t.id)).toContain(created.id);
  });

  it("with no sort param, preserves the original sortOrder/startDate ordering rather than defaulting to one column", async () => {
    const res = await request(app).get(`/schedule-tasks?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const rows = res.body as { sortOrder: number; startDate: string }[];
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      if (!prev || !curr) throw new Error("unreachable: index within bounds");
      const inOrder = prev.sortOrder < curr.sortOrder || (prev.sortOrder === curr.sortOrder && prev.startDate <= curr.startDate);
      expect(inOrder).toBe(true);
    }
  });
});

describe("GET /bid-packages query contract (Phase 26)", () => {
  async function createBidPackage(title: string): Promise<{ id: string }> {
    const res = await request(app)
      .post("/bid-packages")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, title });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createBidPackage(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/bid-packages?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches title, and sort/pagination report the true total", async () => {
    const pageMarker = `${MARKER}-bp-page`;
    await createBidPackage(`${pageMarker}-aaa`);
    await createBidPackage(`${pageMarker}-bbb`);
    await createBidPackage(`${pageMarker}-ccc`);

    const bySearch = await request(app)
      .get(`/bid-packages?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body).toHaveLength(3);

    const firstPage = await request(app)
      .get(`/bid-packages?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=title&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].title).toBe(`${pageMarker}-aaa`);
  });

  it("the status filter narrows results to draft packages", async () => {
    const created = await createBidPackage(`${MARKER}-status-filter`);
    const byStatus = await request(app)
      .get(`/bid-packages?projectId=${projectId}&search=${encodeURIComponent(MARKER)}-status-filter&status=draft`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byStatus.body.map((bp: { id: string }) => bp.id)).toContain(created.id);
  });

  it("rejects sort=costCode: the list page's Cost Code column is a joined lookup, not a sortable server column", async () => {
    const res = await request(app)
      .get(`/bid-packages?projectId=${projectId}&sort=costCode&direction=asc`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /estimates query contract (Phase 26)", () => {
  async function createEstimate(title: string): Promise<{ id: string }> {
    const res = await request(app)
      .post("/estimates")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, title });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createEstimate(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/estimates?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches title, and sort/pagination report the true total", async () => {
    const pageMarker = `${MARKER}-est-page`;
    await createEstimate(`${pageMarker}-aaa`);
    await createEstimate(`${pageMarker}-bbb`);
    await createEstimate(`${pageMarker}-ccc`);

    const bySearch = await request(app)
      .get(`/estimates?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body).toHaveLength(3);

    const firstPage = await request(app)
      .get(`/estimates?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=title&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].title).toBe(`${pageMarker}-aaa`);
  });

  it("the status filter narrows results to draft estimates", async () => {
    const created = await createEstimate(`${MARKER}-status-filter`);
    const byStatus = await request(app)
      .get(`/estimates?projectId=${projectId}&search=${encodeURIComponent(MARKER)}-status-filter&status=draft`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byStatus.body.map((e: { id: string }) => e.id)).toContain(created.id);
  });
});
