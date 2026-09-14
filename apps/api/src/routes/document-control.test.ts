import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 3 (Document control) integration tests: document folders +
 * documents CRUD, the drawing register + revision history, and markup
 * pins — including the Phase 3 gate scenario itself (uploading a new
 * drawing revision retains the old one and moves the register's "current"
 * pointer). Preconditions: same seeded Postgres as
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
  const res = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = res.body[0].id as string;
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

/**
 * Simulates "a file has already been uploaded to storage" without an
 * actual S3/MinIO round-trip (unavailable in this sandbox — same
 * constraint noted in the Phase 1 gate report): calls /attachments/confirm
 * directly with a synthetic storage key, exercising the real
 * permission-check + DB-record code path.
 */
async function createAttachment(token: string, ownerType: string, ownerId: string): Promise<string> {
  const res = await request(app)
    .post("/attachments/confirm")
    .set("authorization", `Bearer ${token}`)
    .send({
      projectId,
      ownerType,
      ownerId,
      storageKey: `${projectId}/${ownerType}/${randomUUID()}-test.pdf`,
      filename: "test.pdf",
      mime: "application/pdf",
      size: 12345,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("Documents", () => {
  it("creates a folder and a document inside it, lists by folder, and replaces the file via PATCH", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const folderRes = await request(app)
      .post("/documents/folders")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, name: "Specifications" });
    expect(folderRes.status).toBe(201);
    const folderId = folderRes.body.id as string;

    const attachmentId = await createAttachment(token, "document", projectId);
    const docRes = await request(app)
      .post("/documents")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, folderId, title: "Div 03 - Concrete", attachmentId });
    expect(docRes.status).toBe(201);
    expect(docRes.body.currentAttachmentId).toBe(attachmentId);

    const listRes = await request(app)
      .get("/documents")
      .query({ projectId, folderId })
      .set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((d: { id: string }) => d.id === docRes.body.id)).toBe(true);

    const newAttachmentId = await createAttachment(token, "document", projectId);
    const patchRes = await request(app)
      .patch(`/documents/${docRes.body.id}`)
      .set("authorization", `Bearer ${token}`)
      .send({ attachmentId: newAttachmentId, title: "Div 03 - Concrete (rev)" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.currentAttachmentId).toBe(newAttachmentId);
    expect(patchRes.body.title).toBe("Div 03 - Concrete (rev)");

    // Downloading the current file goes through the same pre-signed URL
    // pattern as upload — permission-checked against the `documents`
    // module inferred from the attachment's ownerType, not a fixed one.
    const downloadRes = await request(app)
      .get(`/attachments/${newAttachmentId}/download`)
      .set("authorization", `Bearer ${token}`);
    expect(downloadRes.status).toBe(200);
    expect(typeof downloadRes.body.downloadUrl).toBe("string");
    expect(downloadRes.body.downloadUrl.length).toBeGreaterThan(0);
  });

  it("rejects a caller without documents write permission", async () => {
    const token = await loginAs("karim.abughazaleh@siteops.test"); // client_viewer: read-only
    const res = await request(app)
      .post("/documents/folders")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, name: "Should be rejected" });
    expect(res.status).toBe(403);
  });
});

describe("Drawings (Phase 3 gate: revision history)", () => {
  it("registers a drawing, uploads a first revision, then a second — the first is retained (supersededAt set) and the register's current pointer moves", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const drawingRes = await request(app)
      .post("/drawings")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sheetNumber: "A-101", discipline: "Architectural", title: "Level 1 Floor Plan" });
    expect(drawingRes.status).toBe(201);
    const drawingId = drawingRes.body.id as string;
    expect(drawingRes.body.currentRevisionId).toBeNull();

    const attachmentA = await createAttachment(token, "drawing_revision", drawingId);
    const revARes = await request(app)
      .post(`/drawings/${drawingId}/revisions`)
      .set("authorization", `Bearer ${token}`)
      .send({ revisionCode: "A", attachmentId: attachmentA, issuedDate: "2025-01-10" });
    expect(revARes.status).toBe(201);
    const revisionAId = revARes.body.id as string;
    expect(revARes.body.supersededAt).toBeNull();

    const afterFirstUpload = await request(app).get(`/drawings/${drawingId}`).set("authorization", `Bearer ${token}`);
    expect(afterFirstUpload.body.currentRevisionId).toBe(revisionAId);

    const attachmentB = await createAttachment(token, "drawing_revision", drawingId);
    const revBRes = await request(app)
      .post(`/drawings/${drawingId}/revisions`)
      .set("authorization", `Bearer ${token}`)
      .send({ revisionCode: "B", attachmentId: attachmentB, issuedDate: "2025-03-02" });
    expect(revBRes.status).toBe(201);
    const revisionBId = revBRes.body.id as string;

    // Register shows current: the pointer moved to the new revision.
    const afterSecondUpload = await request(app).get(`/drawings/${drawingId}`).set("authorization", `Bearer ${token}`);
    expect(afterSecondUpload.body.currentRevisionId).toBe(revisionBId);

    // The old revision is retained, not deleted or overwritten — still
    // queryable in the full history, now flagged superseded.
    const historyRes = await request(app)
      .get(`/drawings/${drawingId}/revisions`)
      .set("authorization", `Bearer ${token}`);
    expect(historyRes.status).toBe(200);
    const revisionIds = historyRes.body.map((r: { id: string }) => r.id);
    expect(revisionIds).toEqual(expect.arrayContaining([revisionAId, revisionBId]));

    const revA = historyRes.body.find((r: { id: string }) => r.id === revisionAId);
    const revB = historyRes.body.find((r: { id: string }) => r.id === revisionBId);
    expect(revA.supersededAt).not.toBeNull();
    expect(revA.attachmentId).toBe(attachmentA); // original file reference untouched
    expect(revB.supersededAt).toBeNull();
  });

  it("creates and lists a markup pin anchored to a specific revision", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const drawingRes = await request(app)
      .post("/drawings")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sheetNumber: "S-201", discipline: "Structural", title: "Foundation Plan" });
    const drawingId = drawingRes.body.id as string;

    const attachmentId = await createAttachment(token, "drawing_revision", drawingId);
    const revRes = await request(app)
      .post(`/drawings/${drawingId}/revisions`)
      .set("authorization", `Bearer ${token}`)
      .send({ revisionCode: "1", attachmentId, issuedDate: "2025-02-01" });
    const revisionId = revRes.body.id as string;

    const markupRes = await request(app)
      .post(`/drawings/revisions/${revisionId}/markups`)
      .set("authorization", `Bearer ${token}`)
      .send({ coords: { type: "pin", x: 0.42, y: 0.17 }, note: "Rebar clash here" });
    expect(markupRes.status).toBe(201);

    const listRes = await request(app)
      .get(`/drawings/revisions/${revisionId}/markups`)
      .set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].note).toBe("Rebar clash here");
  });

  it("creates and lists a freehand redline sketch anchored to a specific revision", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const drawingRes = await request(app)
      .post("/drawings")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sheetNumber: "M-301", discipline: "Mechanical", title: "Roof Plan" });
    const drawingId = drawingRes.body.id as string;

    const attachmentId = await createAttachment(token, "drawing_revision", drawingId);
    const revRes = await request(app)
      .post(`/drawings/${drawingId}/revisions`)
      .set("authorization", `Bearer ${token}`)
      .send({ revisionCode: "1", attachmentId, issuedDate: "2025-02-15" });
    const revisionId = revRes.body.id as string;

    const points: [number, number][] = [
      [0.1, 0.1],
      [0.25, 0.2],
      [0.4, 0.15],
    ];
    const sketchRes = await request(app)
      .post(`/drawings/revisions/${revisionId}/markups`)
      .set("authorization", `Bearer ${token}`)
      .send({ coords: { type: "freehand", points, color: "#2563eb" } });
    expect(sketchRes.status).toBe(201);
    expect(sketchRes.body.coords.type).toBe("freehand");
    expect(sketchRes.body.coords.points).toEqual(points);
    expect(sketchRes.body.coords.color).toBe("#2563eb");

    const listRes = await request(app)
      .get(`/drawings/revisions/${revisionId}/markups`)
      .set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].coords.points).toEqual(points);

    const tooFewPointsRes = await request(app)
      .post(`/drawings/revisions/${revisionId}/markups`)
      .set("authorization", `Bearer ${token}`)
      .send({ coords: { type: "freehand", points: [[0.5, 0.5]] } });
    expect(tooFewPointsRes.status).toBe(400);
  });

  it("supports Procore's additional markup shapes: cloud, box, ellipse, arrow, line, text, measurement", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const drawingRes = await request(app)
      .post("/drawings")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, sheetNumber: "A-401", discipline: "Architectural", title: "Enlarged Plans" });
    const drawingId = drawingRes.body.id as string;

    const attachmentId = await createAttachment(token, "drawing_revision", drawingId);
    const revRes = await request(app)
      .post(`/drawings/${drawingId}/revisions`)
      .set("authorization", `Bearer ${token}`)
      .send({ revisionCode: "1", attachmentId, issuedDate: "2025-03-01" });
    const revisionId = revRes.body.id as string;

    const shapes: Record<string, unknown>[] = [
      { type: "cloud", points: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]], color: "#dc2626" },
      { type: "box", x: 0.2, y: 0.2, width: 0.1, height: 0.05, color: "#2563eb" },
      { type: "ellipse", cx: 0.5, cy: 0.5, rx: 0.05, ry: 0.03, color: "#16a34a" },
      { type: "arrow", x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2, color: "#111827" },
      { type: "line", x1: 0.3, y1: 0.3, x2: 0.4, y2: 0.4, color: "#dc2626" },
      { type: "text", x: 0.6, y: 0.6, text: "See detail 3/A-501", color: "#111827" },
      { type: "measurement", x1: 0.15, y1: 0.15, x2: 0.35, y2: 0.15, color: "#2563eb" },
    ];

    for (const coords of shapes) {
      const res = await request(app)
        .post(`/drawings/revisions/${revisionId}/markups`)
        .set("authorization", `Bearer ${token}`)
        .send({ coords });
      expect(res.status).toBe(201);
      expect(res.body.coords.type).toBe(coords.type);
    }

    const listRes = await request(app).get(`/drawings/revisions/${revisionId}/markups`).set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(shapes.length);

    // A text markup with no text is rejected -- the shape carries the label, not the optional "note" field.
    const invalidTextRes = await request(app)
      .post(`/drawings/revisions/${revisionId}/markups`)
      .set("authorization", `Bearer ${token}`)
      .send({ coords: { type: "text", x: 0.5, y: 0.5, text: "", color: "#111827" } });
    expect(invalidTextRes.status).toBe(400);
  });
});
