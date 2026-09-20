import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 31 rolls Phase 28's DataTable row-selection + bulk-actions pattern
 * out to a second module: POST /punch-items/bulk-transition, a thin loop
 * over the exact same transitionPunchItemStatus PATCH already covered by
 * the punch-item integration tests. Preconditions: same seeded Postgres as
 * apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";
const MARKER = `p31${Date.now()}`;

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

async function createPunchItem(description: string): Promise<{ id: string; status: string }> {
  const res = await request(app).post("/punch-items").set("authorization", `Bearer ${adminToken}`).send({ projectId, description });
  expect(res.status).toBe(201);
  return res.body as { id: string; status: string };
}

describe("POST /punch-items/bulk-transition (Phase 31)", () => {
  it("sends every valid punch item in the batch for review and reports each one ok", async () => {
    const a = await createPunchItem(`${MARKER}-a`);
    const b = await createPunchItem(`${MARKER}-b`);

    const res = await request(app)
      .post("/punch-items/bulk-transition")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [a.id, b.id], toStatus: "ready_for_review" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { id: a.id, ok: true },
        { id: b.id, ok: true },
      ]),
    );

    const refetched = await request(app).get(`/punch-items/${a.id}`).set("authorization", `Bearer ${adminToken}`);
    expect(refetched.body.status).toBe("ready_for_review");
  });

  it("reports a per-row failure without failing the rest of the batch", async () => {
    const ok = await createPunchItem(`${MARKER}-partial-ok`);
    const approved = await createPunchItem(`${MARKER}-partial-approved`);
    await request(app).post(`/punch-items/${approved.id}/transition`).set("authorization", `Bearer ${adminToken}`).send({ toStatus: "ready_for_review" });
    await request(app).post(`/punch-items/${approved.id}/transition`).set("authorization", `Bearer ${adminToken}`).send({ toStatus: "approved" });

    const res = await request(app)
      .post("/punch-items/bulk-transition")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [ok.id, approved.id], toStatus: "ready_for_review" });
    expect(res.status).toBe(200);
    const byId = new Map((res.body as { id: string; ok: boolean }[]).map((r) => [r.id, r.ok]));
    expect(byId.get(ok.id)).toBe(true);
    // approved -> ready_for_review isn't a legal transition (PUNCH_ITEM_STATUS_TRANSITIONS.approved is ["closed", "open"]).
    expect(byId.get(approved.id)).toBe(false);
  });

  it("reports a not-found id as a per-row failure rather than 404ing the whole batch", async () => {
    const ok = await createPunchItem(`${MARKER}-with-missing`);
    const missingId = "00000000-0000-0000-0000-000000000000";

    const res = await request(app)
      .post("/punch-items/bulk-transition")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [ok.id, missingId], toStatus: "ready_for_review" });
    expect(res.status).toBe(200);
    const byId = new Map((res.body as { id: string; ok: boolean }[]).map((r) => [r.id, r.ok]));
    expect(byId.get(ok.id)).toBe(true);
    expect(byId.get(missingId)).toBe(false);
  });

  it("rejects an empty ids array with a 400 (schema validation)", async () => {
    const res = await request(app)
      .post("/punch-items/bulk-transition")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [], toStatus: "ready_for_review" });
    expect(res.status).toBe(400);
  });
});
