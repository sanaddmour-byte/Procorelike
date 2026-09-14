import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Integration tests for pinned comments on the in-app PDF previewer
 * (PdfViewerModal): posting a comment on a specific page/spot of an RFI's
 * generated report, listing them back, and linking a comment (on any
 * record's PDF) to an RFI in both directions. Preconditions: same seeded
 * Postgres as apps/api/src/routes/integration.test.ts.
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

describe("PDF comments", () => {
  it("posts a pinned comment on an RFI's report, lists it back by page, and rejects an unregistered record type", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const rfiId = await createRfi(token, "Clarify slab edge detail");

    const createRes = await request(app)
      .post("/pdf-comments")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, recordType: "rfi", recordId: rfiId, pageNumber: 1, x: 0.42, y: 0.15, commentText: "See marked-up detail here." });
    expect(createRes.status).toBe(201);
    expect(createRes.body.pageNumber).toBe(1);

    const listRes = await request(app).get("/pdf-comments").query({ projectId, recordType: "rfi", recordId: rfiId }).set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].commentText).toBe("See marked-up detail here.");

    const badTypeRes = await request(app)
      .post("/pdf-comments")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, recordType: "not_a_real_type", recordId: rfiId, pageNumber: 1, x: 0.1, y: 0.1, commentText: "x" });
    expect(badTypeRes.status).toBe(400);
  });

  it("links a comment (posted on one RFI's report) to a different RFI, and that RFI's reciprocal listing finds it", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const sourceRfiId = await createRfi(token, "Report carrying the comment");
    const targetRfiId = await createRfi(token, "RFI the comment refers to");

    const createRes = await request(app)
      .post("/pdf-comments")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, recordType: "rfi", recordId: sourceRfiId, pageNumber: 1, x: 0.5, y: 0.5, commentText: "Related to the other RFI." });
    expect(createRes.status).toBe(201);
    const commentId = createRes.body.id as string;
    expect(createRes.body.linkedRfiId).toBeNull();

    const linkRes = await request(app)
      .patch(`/pdf-comments/${commentId}/link`)
      .query({ projectId })
      .set("authorization", `Bearer ${token}`)
      .send({ linkedRfiId: targetRfiId });
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.linkedRfiId).toBe(targetRfiId);

    const reciprocalRes = await request(app)
      .get("/pdf-comments/linked-to-rfi")
      .query({ projectId, rfiId: targetRfiId })
      .set("authorization", `Bearer ${token}`);
    expect(reciprocalRes.status).toBe(200);
    expect(reciprocalRes.body).toHaveLength(1);
    expect(reciprocalRes.body[0].id).toBe(commentId);
    expect(reciprocalRes.body[0].recordId).toBe(sourceRfiId);

    const unlinkRes = await request(app)
      .patch(`/pdf-comments/${commentId}/link`)
      .query({ projectId })
      .set("authorization", `Bearer ${token}`)
      .send({ linkedRfiId: null });
    expect(unlinkRes.status).toBe(200);
    expect(unlinkRes.body.linkedRfiId).toBeNull();

    const afterUnlinkRes = await request(app)
      .get("/pdf-comments/linked-to-rfi")
      .query({ projectId, rfiId: targetRfiId })
      .set("authorization", `Bearer ${token}`);
    expect(afterUnlinkRes.body).toHaveLength(0);
  });
});
