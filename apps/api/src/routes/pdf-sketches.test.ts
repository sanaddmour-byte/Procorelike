import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Integration tests for freehand redline strokes on the in-app PDF
 * previewer (PdfViewerModal): posting a completed stroke on a specific
 * page of an RFI's generated report, listing them back, and rejecting an
 * unregistered record type. Preconditions: same seeded Postgres as
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

describe("PDF sketches", () => {
  it("posts a freehand stroke on an RFI's report, lists it back by page, and rejects an unregistered record type", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const rfiId = await createRfi(token, "Clarify slab edge detail");

    const points = [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.15 },
      { x: 0.3, y: 0.12 },
    ];
    const createRes = await request(app)
      .post("/pdf-sketches")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, recordType: "rfi", recordId: rfiId, pageNumber: 1, points });
    expect(createRes.status).toBe(201);
    expect(createRes.body.pageNumber).toBe(1);
    expect(createRes.body.points).toEqual(points);
    expect(createRes.body.color).toBe("#dc2626");

    const listRes = await request(app).get("/pdf-sketches").query({ projectId, recordType: "rfi", recordId: rfiId }).set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].points).toEqual(points);

    const badTypeRes = await request(app)
      .post("/pdf-sketches")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, recordType: "not_a_real_type", recordId: rfiId, pageNumber: 1, points });
    expect(badTypeRes.status).toBe(400);
  });

  it("accepts a custom stroke color and rejects a stroke with fewer than two points", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const rfiId = await createRfi(token, "Confirm blocking at header");

    const createRes = await request(app)
      .post("/pdf-sketches")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        recordType: "rfi",
        recordId: rfiId,
        pageNumber: 2,
        points: [
          { x: 0.5, y: 0.5 },
          { x: 0.55, y: 0.52 },
        ],
        color: "#2563eb",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.color).toBe("#2563eb");

    const tooFewPointsRes = await request(app)
      .post("/pdf-sketches")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, recordType: "rfi", recordId: rfiId, pageNumber: 2, points: [{ x: 0.5, y: 0.5 }] });
    expect(tooFewPointsRes.status).toBe(400);
  });
});
