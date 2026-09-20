import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 28's pilot for DataTable row-selection + bulk actions
 * (docs/DATA_MODEL.md §9p): POST /rfis/bulk-transition, the first bulk
 * action built on top of the per-row `transitionRfiStatus` PATCH already
 * covered by rfi.test.ts. Preconditions: same seeded Postgres as
 * apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";
const MARKER = `p28${Date.now()}`;

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

async function createRfi(subject: string): Promise<{ id: string; status: string }> {
  const res = await request(app)
    .post("/rfis")
    .set("authorization", `Bearer ${adminToken}`)
    .send({ projectId, subject, question: "Bulk action test question" });
  expect(res.status).toBe(201);
  return res.body as { id: string; status: string };
}

describe("POST /rfis/bulk-transition (Phase 28)", () => {
  it("closes every valid RFI in the batch and reports each one ok", async () => {
    const a = await createRfi(`${MARKER}-a`);
    const b = await createRfi(`${MARKER}-b`);
    // draft -> closed isn't a legal jump (RFI_STATUS_TRANSITIONS), so open both first.
    await request(app).post(`/rfis/${a.id}/transition`).set("authorization", `Bearer ${adminToken}`).send({ toStatus: "open" });
    await request(app).post(`/rfis/${b.id}/transition`).set("authorization", `Bearer ${adminToken}`).send({ toStatus: "open" });

    const res = await request(app)
      .post("/rfis/bulk-transition")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [a.id, b.id], toStatus: "closed" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { id: a.id, ok: true },
        { id: b.id, ok: true },
      ]),
    );

    const refetched = await request(app).get(`/rfis/${a.id}`).set("authorization", `Bearer ${adminToken}`);
    expect(refetched.body.status).toBe("closed");
  });

  it("reports a per-row failure without failing the rest of the batch", async () => {
    const ok = await createRfi(`${MARKER}-partial-ok`);
    await request(app).post(`/rfis/${ok.id}/transition`).set("authorization", `Bearer ${adminToken}`).send({ toStatus: "open" });
    const alreadyClosed = await createRfi(`${MARKER}-partial-closed`);
    await request(app).post(`/rfis/${alreadyClosed.id}/transition`).set("authorization", `Bearer ${adminToken}`).send({ toStatus: "open" });
    await request(app).post(`/rfis/${alreadyClosed.id}/transition`).set("authorization", `Bearer ${adminToken}`).send({ toStatus: "closed" });

    const res = await request(app)
      .post("/rfis/bulk-transition")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [ok.id, alreadyClosed.id], toStatus: "closed" });
    expect(res.status).toBe(200);
    const byId = new Map((res.body as { id: string; ok: boolean }[]).map((r) => [r.id, r.ok]));
    expect(byId.get(ok.id)).toBe(true);
    expect(byId.get(alreadyClosed.id)).toBe(false);
  });

  it("reports a not-found id as a per-row failure rather than 404ing the whole batch", async () => {
    const ok = await createRfi(`${MARKER}-with-missing`);
    await request(app).post(`/rfis/${ok.id}/transition`).set("authorization", `Bearer ${adminToken}`).send({ toStatus: "open" });
    const missingId = "00000000-0000-0000-0000-000000000000";

    const res = await request(app)
      .post("/rfis/bulk-transition")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [ok.id, missingId], toStatus: "closed" });
    expect(res.status).toBe(200);
    const byId = new Map((res.body as { id: string; ok: boolean }[]).map((r) => [r.id, r.ok]));
    expect(byId.get(ok.id)).toBe(true);
    expect(byId.get(missingId)).toBe(false);
  });

  it("rejects an empty ids array with a 400 (schema validation)", async () => {
    const res = await request(app)
      .post("/rfis/bulk-transition")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [], toStatus: "closed" });
    expect(res.status).toBe(400);
  });
});
