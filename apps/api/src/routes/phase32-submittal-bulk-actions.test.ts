import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 32 rolls the Phase 28/31 bulk-actions pattern out to a third
 * module: POST /submittals/bulk-close, a thin loop over the exact same
 * closeSubmittal a single-item POST already uses. Preconditions: same
 * seeded Postgres as apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";
const MARKER = `p32${Date.now()}`;

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let specSectionId: string;
let adminToken: string;
let reviewerUserId: string;

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  adminToken = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${adminToken}`);
  projectId = projectsRes.body[0].id as string;

  const specSectionsRes = await request(app).get("/submittals/spec-sections").query({ projectId }).set("authorization", `Bearer ${adminToken}`);
  specSectionId = specSectionsRes.body[0].id as string;

  const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${adminToken}`);
  const lina = (membersRes.body as { userId: string; email: string }[]).find((m) => m.email === "lina.kanaan@siteops.test");
  if (!lina) throw new Error("Seed member not found: lina.kanaan@siteops.test");
  reviewerUserId = lina.userId;
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

async function createDraftSubmittal(title: string): Promise<{ id: string; status: string }> {
  const res = await request(app).post("/submittals").set("authorization", `Bearer ${adminToken}`).send({ projectId, specSectionId, title });
  expect(res.status).toBe(201);
  return res.body as { id: string; status: string };
}

/** Drives a fresh submittal through package -> revision -> a single passing review, landing it on "approved" -- the only status closeSubmittal accepts. */
async function createApprovedSubmittal(title: string): Promise<string> {
  const submittal = await createDraftSubmittal(title);
  const packageRes = await request(app).post(`/submittals/${submittal.id}/packages`).set("authorization", `Bearer ${adminToken}`);
  expect(packageRes.status).toBe(201);

  const attachmentRes = await request(app)
    .post("/attachments/confirm")
    .set("authorization", `Bearer ${adminToken}`)
    .send({
      projectId,
      ownerType: "submittal_revision",
      ownerId: submittal.id,
      storageKey: `${projectId}/submittal_revision/${randomUUID()}-test.pdf`,
      filename: "submittal.pdf",
      mime: "application/pdf",
      size: 4096,
    });
  expect(attachmentRes.status).toBe(201);

  const revisionRes = await request(app)
    .post(`/submittals/packages/${packageRes.body.id}/revisions`)
    .set("authorization", `Bearer ${adminToken}`)
    .send({ attachmentId: attachmentRes.body.id, submittedDate: "2025-04-01", reviewers: [{ reviewerUserId, sequenceOrder: 1 }] });
  expect(revisionRes.status).toBe(201);

  const reviewerToken = await loginAs("lina.kanaan@siteops.test");
  const reviewRes = await request(app)
    .post(`/submittals/revisions/${revisionRes.body.id}/reviews`)
    .set("authorization", `Bearer ${reviewerToken}`)
    .send({ responseCode: "approved" });
  expect(reviewRes.status).toBe(200);

  const afterReview = await request(app).get(`/submittals/${submittal.id}`).set("authorization", `Bearer ${adminToken}`);
  expect(afterReview.body.status).toBe("approved");

  return submittal.id;
}

describe("POST /submittals/bulk-close (Phase 32)", () => {
  it("closes every approved submittal in the batch and reports each one ok", async () => {
    const a = await createApprovedSubmittal(`${MARKER}-a`);
    const b = await createApprovedSubmittal(`${MARKER}-b`);

    const res = await request(app).post("/submittals/bulk-close").set("authorization", `Bearer ${adminToken}`).send({ ids: [a, b] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { id: a, ok: true },
        { id: b, ok: true },
      ]),
    );

    const refetched = await request(app).get(`/submittals/${a}`).set("authorization", `Bearer ${adminToken}`);
    expect(refetched.body.status).toBe("closed");
  });

  it("reports a per-row failure without failing the rest of the batch", async () => {
    const approved = await createApprovedSubmittal(`${MARKER}-partial-approved`);
    const draft = await createDraftSubmittal(`${MARKER}-partial-draft`);

    const res = await request(app)
      .post("/submittals/bulk-close")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [approved, draft.id] });
    expect(res.status).toBe(200);
    const byId = new Map((res.body as { id: string; ok: boolean }[]).map((r) => [r.id, r.ok]));
    expect(byId.get(approved)).toBe(true);
    // A draft submittal isn't approved/approved_as_noted, so closeSubmittal rejects it.
    expect(byId.get(draft.id)).toBe(false);
  });

  it("reports a not-found id as a per-row failure rather than 404ing the whole batch", async () => {
    const approved = await createApprovedSubmittal(`${MARKER}-with-missing`);
    const missingId = "00000000-0000-0000-0000-000000000000";

    const res = await request(app)
      .post("/submittals/bulk-close")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ids: [approved, missingId] });
    expect(res.status).toBe(200);
    const byId = new Map((res.body as { id: string; ok: boolean }[]).map((r) => [r.id, r.ok]));
    expect(byId.get(approved)).toBe(true);
    expect(byId.get(missingId)).toBe(false);
  });

  it("rejects an empty ids array with a 400 (schema validation)", async () => {
    const res = await request(app).post("/submittals/bulk-close").set("authorization", `Bearer ${adminToken}`).send({ ids: [] });
    expect(res.status).toBe(400);
  });
});
