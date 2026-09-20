import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Integration tests for the admin-defined custom fields (definitions +
 * per-entity values) and the scoped getEntityHistory endpoint that backs
 * the RecordHistory panel. Preconditions: same seeded Postgres as
 * apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";

let app: Express;
let clients: ApiDbClients;
let projectId: string;

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const token = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
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

async function createRfi(token: string, subject: string): Promise<string> {
  const res = await request(app)
    .post("/rfis")
    .set("authorization", `Bearer ${token}`)
    .send({ projectId, subject, question: "Please clarify." });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("Custom field definitions + values", () => {
  it("an admin defines a text field on the RFI module, a member sets its value, and it round-trips", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");

    const createDefRes = await request(app)
      .post("/custom-field-definitions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, module: "rfis", label: "Contract reference", fieldType: "text" });
    expect(createDefRes.status).toBe(201);
    const definitionId = createDefRes.body.id as string;

    const listRes = await request(app)
      .get("/custom-field-definitions")
      .query({ projectId, module: "rfis" })
      .set("authorization", `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((d: { id: string }) => d.id === definitionId)).toBe(true);

    const rfiId = await createRfi(adminToken, "Confirm door hardware schedule");

    const setValueRes = await request(app)
      .put(`/custom-field-values/${definitionId}/${rfiId}`)
      .query({ projectId })
      .set("authorization", `Bearer ${adminToken}`)
      .send({ value: "CO-004" });
    expect(setValueRes.status).toBe(200);
    expect(setValueRes.body.value).toBe("CO-004");

    const getValuesRes = await request(app)
      .get("/custom-field-values")
      .query({ projectId, module: "rfis", entityId: rfiId })
      .set("authorization", `Bearer ${adminToken}`);
    expect(getValuesRes.status).toBe(200);
    const row = getValuesRes.body.find((r: { definition: { id: string } }) => r.definition.id === definitionId);
    expect(row.value.value).toBe("CO-004");

    // Overwriting an existing value updates it in place rather than creating a duplicate.
    const updateValueRes = await request(app)
      .put(`/custom-field-values/${definitionId}/${rfiId}`)
      .query({ projectId })
      .set("authorization", `Bearer ${adminToken}`)
      .send({ value: "CO-005" });
    expect(updateValueRes.status).toBe(200);
    const getValuesAfterUpdate = await request(app)
      .get("/custom-field-values")
      .query({ projectId, module: "rfis", entityId: rfiId })
      .set("authorization", `Bearer ${adminToken}`);
    const rowAfter = getValuesAfterUpdate.body.find((r: { definition: { id: string } }) => r.definition.id === definitionId);
    expect(rowAfter.value.value).toBe("CO-005");
  });

  it("rejects a non-admin defining a custom field", async () => {
    const foremanToken = await loginAs("yousef.amer@siteops.test");
    const res = await request(app)
      .post("/custom-field-definitions")
      .set("authorization", `Bearer ${foremanToken}`)
      .send({ projectId, module: "rfis", label: "Should not be created", fieldType: "text" });
    expect(res.status).toBe(403);
  });

  it("rejects a select-type value that isn't one of the defined options", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");
    const createDefRes = await request(app)
      .post("/custom-field-definitions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, module: "rfis", label: "Priority tier", fieldType: "select", options: ["low", "medium", "high"] });
    expect(createDefRes.status).toBe(201);
    const definitionId = createDefRes.body.id as string;

    const rfiId = await createRfi(adminToken, "Confirm ceiling grid layout");

    const badRes = await request(app)
      .put(`/custom-field-values/${definitionId}/${rfiId}`)
      .query({ projectId })
      .set("authorization", `Bearer ${adminToken}`)
      .send({ value: "urgent" });
    expect(badRes.status).toBe(400);

    const goodRes = await request(app)
      .put(`/custom-field-values/${definitionId}/${rfiId}`)
      .query({ projectId })
      .set("authorization", `Bearer ${adminToken}`)
      .send({ value: "high" });
    expect(goodRes.status).toBe(200);
  });

  it("deletes a definition and cascades its values", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");
    const createDefRes = await request(app)
      .post("/custom-field-definitions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, module: "rfis", label: "Temp field", fieldType: "text" });
    const definitionId = createDefRes.body.id as string;

    const deleteRes = await request(app)
      .delete(`/custom-field-definitions/${definitionId}`)
      .query({ projectId })
      .set("authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get("/custom-field-definitions")
      .query({ projectId, module: "rfis" })
      .set("authorization", `Bearer ${adminToken}`);
    expect(listRes.body.some((d: { id: string }) => d.id === definitionId)).toBe(false);
  });
});

describe("Scoped entity history", () => {
  it("returns the create audit entry for an RFI the caller can read", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const rfiId = await createRfi(token, "History check: confirm rebar spacing");

    const res = await request(app)
      .get(`/projects/${projectId}/history`)
      .query({ entityType: "rfi", entityId: rfiId })
      .set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.some((entry: { action: string }) => entry.action === "create")).toBe(true);
  });

  it("404s for an entity that doesn't belong to the given project", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const rfiId = await createRfi(token, "History check: wrong project");

    const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
    const otherProject = (projectsRes.body as { id: string }[]).find((p) => p.id !== projectId);
    if (!otherProject) return; // single-project seed — nothing to cross-check against

    const res = await request(app)
      .get(`/projects/${otherProject.id}/history`)
      .query({ entityType: "rfi", entityId: rfiId })
      .set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("Project settings", () => {
  it("an admin updates the default currency and change order threshold", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");
    const res = await request(app)
      .patch(`/projects/${projectId}/settings`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ defaultCurrency: "JOD", changeOrderThreshold: 7500 });
    expect(res.status).toBe(200);
    expect(res.body.defaultCurrency).toBe("JOD");
    expect(res.body.changeOrderThreshold).toBe("7500.00");

    // Restore the default so later tests in this suite/run aren't affected.
    await request(app)
      .patch(`/projects/${projectId}/settings`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ defaultCurrency: "USD", changeOrderThreshold: 5000 });
  });

  it("rejects a non-admin updating project settings", async () => {
    const foremanToken = await loginAs("yousef.amer@siteops.test");
    const res = await request(app)
      .patch(`/projects/${projectId}/settings`)
      .set("authorization", `Bearer ${foremanToken}`)
      .send({ defaultCurrency: "EUR" });
    expect(res.status).toBe(403);
  });
});
