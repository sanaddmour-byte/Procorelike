import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Document-control-depth gate: Transmittals (a numbered cover record
 * bundling documents/drawing revisions to a distribution list with a
 * tracked per-recipient acknowledgment) and Drawing Sets (publishing many
 * sheet revisions together as one named, dated bundle).
 */

const SEED_PASSWORD = "ChangeMe123!";

interface Member {
  userId: string;
  email: string;
}

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let members: Member[];

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const token = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = projectsRes.body[0].id as string;

  const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${token}`);
  members = membersRes.body as Member[];
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

function memberByEmail(email: string): Member {
  const member = members.find((m) => m.email === email);
  if (!member) throw new Error(`Seed member not found: ${email}`);
  return member;
}

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

async function createDocument(token: string): Promise<{ id: string; title: string }> {
  const attachmentId = await createAttachment(token, "document", projectId);
  const title = `Spec ${randomUUID()}`;
  const res = await request(app).post("/documents").set("authorization", `Bearer ${token}`).send({ projectId, title, attachmentId });
  expect(res.status).toBe(201);
  return { id: res.body.id as string, title };
}

async function createDrawingWithRevision(token: string): Promise<{ drawingId: string; revisionId: string }> {
  const drawingRes = await request(app)
    .post("/drawings")
    .set("authorization", `Bearer ${token}`)
    .send({ projectId, sheetNumber: `A-${randomUUID().slice(0, 4)}`, discipline: "Architectural", title: "Floor Plan" });
  expect(drawingRes.status).toBe(201);
  const drawingId = drawingRes.body.id as string;

  const attachmentId = await createAttachment(token, "drawing_revision", drawingId);
  const revisionRes = await request(app)
    .post(`/drawings/${drawingId}/revisions`)
    .set("authorization", `Bearer ${token}`)
    .send({ revisionCode: "A", attachmentId, issuedDate: "2026-01-15" });
  expect(revisionRes.status).toBe(201);
  return { drawingId, revisionId: revisionRes.body.id as string };
}

describe("Transmittals", () => {
  it("creates a transmittal bundling a document and a drawing revision, sends it, and lets a named recipient acknowledge it", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const doc = await createDocument(token);
    const { revisionId } = await createDrawingWithRevision(token);
    const lina = memberByEmail("lina.kanaan@siteops.test");

    const createRes = await request(app)
      .post("/transmittals")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        subject: "Issued for Review",
        purpose: "for_review",
        message: "Please review and comment.",
        items: [
          { itemType: "document", itemId: doc.id, description: doc.title },
          { itemType: "drawing_revision", itemId: revisionId, description: "A-0001 — Floor Plan" },
        ],
        recipients: [{ userId: lina.userId }],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.transmittalNumber).toMatch(/^TR-\d{4}$/);
    expect(createRes.body.status).toBe("draft");
    expect(createRes.body.items).toHaveLength(2);
    const transmittalId = createRes.body.id as string;

    const listRes = await request(app).get(`/transmittals?projectId=${projectId}`).set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect((listRes.body as { id: string }[]).some((t) => t.id === transmittalId)).toBe(true);

    const sendRes = await request(app).post(`/transmittals/${transmittalId}/send`).set("authorization", `Bearer ${token}`);
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.status).toBe("sent");
    expect(sendRes.body.sentAt).toBeTruthy();

    // Sending twice is refused.
    const resendRes = await request(app).post(`/transmittals/${transmittalId}/send`).set("authorization", `Bearer ${token}`);
    expect(resendRes.status).toBe(409);

    const linaToken = await loginAs("lina.kanaan@siteops.test");
    const ackRes = await request(app).post(`/transmittals/${transmittalId}/acknowledge`).set("authorization", `Bearer ${linaToken}`);
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.acknowledgedAt).toBeTruthy();

    const detailRes = await request(app).get(`/transmittals/${transmittalId}`).set("authorization", `Bearer ${token}`);
    const recipient = (detailRes.body.recipients as { userId: string; acknowledgedAt: string | null }[]).find((r) => r.userId === lina.userId);
    expect(recipient?.acknowledgedAt).toBeTruthy();

    // A user not named as a recipient cannot acknowledge on someone else's behalf.
    const otherToken = await loginAs("rana.odeh@siteops.test");
    const foreignAckRes = await request(app).post(`/transmittals/${transmittalId}/acknowledge`).set("authorization", `Bearer ${otherToken}`);
    expect(foreignAckRes.status).toBe(404);
  });

  it("rejects creating a transmittal without documents:standard", async () => {
    const token = await loginAs("mahmoud.tarawneh@siteops.test"); // foreman: documents "read"
    const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
    const infraProjectId = projectsRes.body[0].id as string;
    const res = await request(app)
      .post("/transmittals")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId: infraProjectId,
        subject: "Should fail",
        purpose: "for_information",
        items: [{ itemType: "document", itemId: randomUUID(), description: "x" }],
        recipients: [{ companyId: randomUUID() }],
      });
    expect(res.status).toBe(403);
  });
});

describe("Drawing Sets", () => {
  it("publishes a named, dated bundle of sheet revisions", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const first = await createDrawingWithRevision(token);
    const second = await createDrawingWithRevision(token);

    const createRes = await request(app)
      .post("/drawing-sets")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        name: "Issued for Construction — Set 1",
        publishedDate: "2026-02-01",
        drawingRevisionIds: [first.revisionId, second.revisionId],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.drawingRevisionIds).toHaveLength(2);
    const drawingSetId = createRes.body.id as string;

    const listRes = await request(app).get(`/drawing-sets?projectId=${projectId}`).set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const listed = (listRes.body as { id: string; drawingRevisionIds: string[] }[]).find((s) => s.id === drawingSetId);
    expect(listed).toBeDefined();
    expect(listed?.drawingRevisionIds).toHaveLength(2);

    const getRes = await request(app).get(`/drawing-sets/${drawingSetId}`).set("authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.name).toBe("Issued for Construction — Set 1");
    expect(getRes.body.drawingRevisionIds.sort()).toEqual([first.revisionId, second.revisionId].sort());
  });
});
