import { schema } from "@siteops/db";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 33 rolls the Phase 28/31/32 bulk-actions pattern out to a fourth
 * module: POST /change-orders/bulk-submit, a thin loop over the exact same
 * submitChangeOrder a single-item POST already uses. Preconditions: same
 * seeded Postgres as apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";

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

async function seedCostCodeId(): Promise<string> {
  const [costCode] = await clients.authDb.db.select().from(schema.costCodes).where(eq(schema.costCodes.projectId, projectId)).limit(1);
  if (!costCode) throw new Error("Seed cost code not found");
  return costCode.id;
}

async function createBudgetLineItem(originalAmount: number): Promise<string> {
  const costCodeId = await seedCostCodeId();
  const res = await request(app)
    .post("/budget-line-items")
    .set("authorization", `Bearer ${adminToken}`)
    .send({ projectId, costCodeId, originalAmount });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Creates a fresh draft change order against its own budget line item -- the only status submitChangeOrder accepts. */
async function createDraftChangeOrder(costImpact: number): Promise<string> {
  const lineItemId = await createBudgetLineItem(100000);
  const res = await request(app)
    .post("/change-orders")
    .set("authorization", `Bearer ${adminToken}`)
    .send({ projectId, targetType: "prime", targetId: lineItemId, costImpact });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe("draft");
  return res.body.id as string;
}

describe("POST /change-orders/bulk-submit (Phase 33)", () => {
  it("submits every draft change order in the batch and reports each one ok", async () => {
    const a = await createDraftChangeOrder(1000);
    const b = await createDraftChangeOrder(2000);

    const res = await request(app).post("/change-orders/bulk-submit").set("authorization", `Bearer ${adminToken}`).send({ ids: [a, b] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { id: a, ok: true },
        { id: b, ok: true },
      ]),
    );

    const refetched = await request(app).get(`/change-orders/${a}`).set("authorization", `Bearer ${adminToken}`);
    expect(refetched.body.status).toBe("pending_approval");
  });

  it("reports a per-row failure without failing the rest of the batch", async () => {
    const draft = await createDraftChangeOrder(1500);
    const alreadySubmitted = await createDraftChangeOrder(1500);
    await request(app).post(`/change-orders/${alreadySubmitted}/submit`).set("authorization", `Bearer ${adminToken}`).expect(200);

    const res = await request(app)
      .post("/change-orders/bulk-submit")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [draft, alreadySubmitted] });
    expect(res.status).toBe(200);
    const byId = new Map((res.body as { id: string; ok: boolean }[]).map((r) => [r.id, r.ok]));
    expect(byId.get(draft)).toBe(true);
    // Already pending_approval, so submitChangeOrder rejects it a second time.
    expect(byId.get(alreadySubmitted)).toBe(false);
  });

  it("reports a not-found id as a per-row failure rather than 404ing the whole batch", async () => {
    const draft = await createDraftChangeOrder(1000);
    const missingId = "00000000-0000-0000-0000-000000000000";

    const res = await request(app)
      .post("/change-orders/bulk-submit")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [draft, missingId] });
    expect(res.status).toBe(200);
    const byId = new Map((res.body as { id: string; ok: boolean }[]).map((r) => [r.id, r.ok]));
    expect(byId.get(draft)).toBe(true);
    expect(byId.get(missingId)).toBe(false);
  });

  it("rejects an empty ids array with a 400 (schema validation)", async () => {
    const res = await request(app).post("/change-orders/bulk-submit").set("authorization", `Bearer ${adminToken}`).send({ ids: [] });
    expect(res.status).toBe(400);
  });
});
