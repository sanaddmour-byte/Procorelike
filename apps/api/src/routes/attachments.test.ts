import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Integration tests for generic file attachments directly on RFIs and
 * Submittals, and photo attachments on Punch Items -- all three reuse the
 * same polymorphic /attachments pipeline (presign/confirm/download) that
 * document-control.test.ts already exercises for documents and drawing
 * revisions, plus the new GET /attachments list-by-owner endpoint.
 * Preconditions: same seeded Postgres as
 * apps/api/src/routes/integration.test.ts.
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

  const specSectionsRes = await request(app)
    .get("/submittals/spec-sections")
    .query({ projectId })
    .set("authorization", `Bearer ${token}`);
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

async function confirmAttachment(token: string, ownerType: string, ownerId: string, filename = "test.pdf", mime = "application/pdf"): Promise<string> {
  const res = await request(app)
    .post("/attachments/confirm")
    .set("authorization", `Bearer ${token}`)
    .send({
      projectId,
      ownerType,
      ownerId,
      storageKey: `${projectId}/${ownerType}/${randomUUID()}-${filename}`,
      filename,
      mime,
      size: 4096,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function listAttachments(token: string, ownerType: string, ownerId: string) {
  return request(app).get("/attachments").query({ projectId, ownerType, ownerId }).set("authorization", `Bearer ${token}`);
}

describe("Generic attachments on RFIs, Submittals, and Punch Items", () => {
  it("attaches a file directly to an RFI and lists it back by owner", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const rfiRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, subject: "Attachment test RFI", question: "Does this support attachments?" });
    expect(rfiRes.status).toBe(201);
    const rfiId = rfiRes.body.id as string;

    const emptyList = await listAttachments(token, "rfi", rfiId);
    expect(emptyList.status).toBe(200);
    expect(emptyList.body).toHaveLength(0);

    const attachmentId = await confirmAttachment(token, "rfi", rfiId, "spec-cutsheet.pdf");
    const listRes = await listAttachments(token, "rfi", rfiId);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(attachmentId);
    expect(listRes.body[0].filename).toBe("spec-cutsheet.pdf");
  });

  it("attaches a file directly to a Submittal (independent of any revision) and lists it back by owner", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const submittalRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, specSectionId, title: "Attachment test submittal" });
    expect(submittalRes.status).toBe(201);
    const submittalId = submittalRes.body.id as string;

    const attachmentId = await confirmAttachment(token, "submittal", submittalId, "product-data.pdf");
    const listRes = await listAttachments(token, "submittal", submittalId);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(attachmentId);
  });

  it("attaches a photo to a Punch Item and lists it back by owner", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const punchRes = await request(app)
      .post("/punch-items")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, description: "Touch up paint, unit 4B", priority: "low" });
    expect(punchRes.status).toBe(201);
    const punchItemId = punchRes.body.id as string;

    const attachmentId = await confirmAttachment(token, "punch_item", punchItemId, "defect.jpg", "image/jpeg");
    const listRes = await listAttachments(token, "punch_item", punchItemId);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(attachmentId);
    expect(listRes.body[0].mime).toBe("image/jpeg");

    // A different punch item's owner scope stays empty -- listing is scoped per owner, not per project.
    const otherPunchRes = await request(app)
      .post("/punch-items")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, description: "Unrelated punch item", priority: "low" });
    const otherListRes = await listAttachments(token, "punch_item", otherPunchRes.body.id as string);
    expect(otherListRes.status).toBe(200);
    expect(otherListRes.body).toHaveLength(0);
  });

  it("rejects an unregistered ownerType", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const res = await request(app)
      .post("/attachments/presign")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, ownerType: "not_a_real_type", ownerId: randomUUID(), filename: "x.pdf", mime: "application/pdf", size: 10 });
    expect(res.status).toBe(400);
  });
});
