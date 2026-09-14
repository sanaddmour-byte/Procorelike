import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Integration tests for connecting an RFI to a drawing or a specification
 * section (the generic record_links mechanism extended for these two
 * target types) and for the new spec-section detail endpoint that such a
 * link's "go there" navigation lands on. Preconditions: same seeded
 * Postgres as apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let specSectionId: string;

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const token = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = projectsRes.body[0].id as string;

  const specSectionsRes = await request(app).get("/submittals/spec-sections").query({ projectId }).set("authorization", `Bearer ${token}`);
  specSectionId = specSectionsRes.body[0].id as string;
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

async function createDrawing(token: string, sheetNumber: string): Promise<string> {
  const res = await request(app)
    .post("/drawings")
    .set("authorization", `Bearer ${token}`)
    .send({ projectId, sheetNumber, discipline: "Structural", title: "Foundation Plan" });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("Record links: RFI <-> drawing / specification section", () => {
  it("links an RFI to a drawing, lists it bidirectionally, then removes it", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const rfiId = await createRfi(token, "Confirm foundation detail at gridline C-4");
    const drawingId = await createDrawing(token, "S-101");

    const createLinkRes = await request(app)
      .post("/record-links")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sourceType: "rfi", sourceId: rfiId, targetType: "drawing", targetId: drawingId });
    expect(createLinkRes.status).toBe(201);
    const linkId = createLinkRes.body.id as string;

    // Bidirectional lookup: querying from either side of the link finds it.
    const fromRfi = await request(app)
      .get("/record-links")
      .query({ projectId, recordType: "rfi", recordId: rfiId })
      .set("authorization", `Bearer ${token}`);
    expect(fromRfi.status).toBe(200);
    expect(fromRfi.body).toHaveLength(1);
    expect(fromRfi.body[0].targetId).toBe(drawingId);

    const fromDrawing = await request(app)
      .get("/record-links")
      .query({ projectId, recordType: "drawing", recordId: drawingId })
      .set("authorization", `Bearer ${token}`);
    expect(fromDrawing.status).toBe(200);
    expect(fromDrawing.body).toHaveLength(1);
    expect(fromDrawing.body[0].sourceId).toBe(rfiId);

    const deleteRes = await request(app).delete(`/record-links/${linkId}`).query({ projectId }).set("authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);

    const afterDelete = await request(app)
      .get("/record-links")
      .query({ projectId, recordType: "rfi", recordId: rfiId })
      .set("authorization", `Bearer ${token}`);
    expect(afterDelete.body).toHaveLength(0);
  });

  it("links an RFI to a specification section, and the section's detail page shows the RFI and its submittals", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const rfiId = await createRfi(token, "Clarify finish spec for lobby");

    const submittalRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, specSectionId, title: "Lobby finish schedule submittal" });
    expect(submittalRes.status).toBe(201);

    const createLinkRes = await request(app)
      .post("/record-links")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sourceType: "rfi", sourceId: rfiId, targetType: "specification_section", targetId: specSectionId });
    expect(createLinkRes.status).toBe(201);

    const detailRes = await request(app).get(`/submittals/spec-sections/${specSectionId}`).set("authorization", `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.id).toBe(specSectionId);
    expect(detailRes.body.linkedRfis.some((r: { id: string }) => r.id === rfiId)).toBe(true);
    expect(detailRes.body.submittals.some((s: { id: string }) => s.id === submittalRes.body.id)).toBe(true);
  });

  it("rejects an unregistered link target type", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const rfiId = await createRfi(token, "Bogus link attempt");

    const res = await request(app)
      .post("/record-links")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sourceType: "rfi", sourceId: rfiId, targetType: "not_a_real_type", targetId: rfiId });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
