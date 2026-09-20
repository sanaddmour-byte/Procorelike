import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 23's rollout of the Phase 21 server-query contract (search/filter/
 * sort/pagination) to Documents, Drawings, Meetings, and Correspondence --
 * one backward-compatibility + filter/sort/pagination sweep per module,
 * mirroring phase22-list-query.test.ts. Preconditions: same seeded
 * Postgres as apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";
const MARKER = `zqxw${Date.now()}`;

interface Member {
  userId: string;
  email: string;
  companyId: string;
}

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let members: Member[];
let adminToken: string;

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  adminToken = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${adminToken}`);
  projectId = projectsRes.body[0].id as string;

  const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${adminToken}`);
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

/** Simulates "a file has already been uploaded to storage" -- see document-control.test.ts's identical helper for why this bypasses an actual S3/MinIO round-trip. */
async function createAttachment(ownerType: string, ownerId: string): Promise<string> {
  const res = await request(app)
    .post("/attachments/confirm")
    .set("authorization", `Bearer ${adminToken}`)
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

describe("GET /documents query contract (Phase 23)", () => {
  async function createDocument(title: string): Promise<{ id: string }> {
    const attachmentId = await createAttachment("document", projectId);
    const res = await request(app)
      .post("/documents")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, title, attachmentId });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of root-level documents (backward compatible)", async () => {
    const created = await createDocument(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/documents?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches title, and sort/pagination report the true total", async () => {
    const pageMarker = `${MARKER}-doc-page`;
    await createDocument(`${pageMarker}-aaa`);
    await createDocument(`${pageMarker}-bbb`);
    await createDocument(`${pageMarker}-ccc`);

    const bySearch = await request(app).get(`/documents?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}`).set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body).toHaveLength(3);

    const firstPage = await request(app)
      .get(`/documents?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=title&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].title).toBe(`${pageMarker}-aaa`);
  });
});

describe("GET /drawings query contract (Phase 23)", () => {
  async function createDrawing(sheetNumber: string, title: string, discipline = "Architectural"): Promise<{ id: string }> {
    const res = await request(app)
      .post("/drawings")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, sheetNumber, discipline, title });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createDrawing(`${MARKER}-A1`, `${MARKER} backward-compat check`);
    const res = await request(app).get(`/drawings?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches sheet number or title, and the discipline filter narrows results", async () => {
    const created = await createDrawing(`${MARKER}-M1`, `${MARKER} discipline filter`, "Mechanical");

    const bySearch = await request(app).get(`/drawings?projectId=${projectId}&search=${encodeURIComponent(MARKER)}-M1`).set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body.map((d: { id: string }) => d.id)).toContain(created.id);

    const byDiscipline = await request(app)
      .get(`/drawings?projectId=${projectId}&search=${encodeURIComponent(MARKER)}&discipline=Mechanical`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byDiscipline.body.map((d: { id: string }) => d.id)).toContain(created.id);
  });

  it("sorts by sheetNumber and paginates with the true total in X-Total-Count", async () => {
    const pageMarker = `${MARKER}-dw-page`;
    await createDrawing(`${pageMarker}-1`, "Sheet one");
    await createDrawing(`${pageMarker}-2`, "Sheet two");
    await createDrawing(`${pageMarker}-3`, "Sheet three");

    const firstPage = await request(app)
      .get(`/drawings?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=sheetNumber&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].sheetNumber).toBe(`${pageMarker}-1`);
  });
});

describe("GET /meetings query contract (Phase 23)", () => {
  async function createMeeting(title: string, occurredAt: string): Promise<{ id: string }> {
    const res = await request(app)
      .post("/meetings")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, title, occurredAt });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createMeeting(`${MARKER} backward-compat check`, "2025-01-15T10:00:00.000Z");
    const res = await request(app).get(`/meetings?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches title, and sort/pagination report the true total", async () => {
    const pageMarker = `${MARKER}-mtg-page`;
    await createMeeting(`${pageMarker}-aaa`, "2025-02-01T09:00:00.000Z");
    await createMeeting(`${pageMarker}-bbb`, "2025-02-02T09:00:00.000Z");
    await createMeeting(`${pageMarker}-ccc`, "2025-02-03T09:00:00.000Z");

    const firstPage = await request(app)
      .get(`/meetings?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=title&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].title).toBe(`${pageMarker}-aaa`);
  });
});

describe("GET /correspondence query contract (Phase 23)", () => {
  async function createCorrespondence(subject: string): Promise<{ id: string }> {
    const omar = memberByEmail("omar.nassar@siteops.test");
    const huda = memberByEmail("huda.masri@siteops.test");
    const res = await request(app)
      .post("/correspondence")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        projectId,
        direction: "outgoing",
        type: "memo",
        subject,
        body: "Phase 23 list-query test body.",
        fromCompanyId: omar.companyId,
        toCompanyId: huda.companyId,
      });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createCorrespondence(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/correspondence?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches subject or number, and the status filter narrows results", async () => {
    const created = await createCorrespondence(`${MARKER} status filter`);

    const bySearch = await request(app).get(`/correspondence?projectId=${projectId}&search=${encodeURIComponent(MARKER)}`).set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body.map((c: { id: string }) => c.id)).toContain(created.id);

    const byStatus = await request(app)
      .get(`/correspondence?projectId=${projectId}&search=${encodeURIComponent(MARKER)}&status=draft`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byStatus.body.map((c: { id: string }) => c.id)).toContain(created.id);
  });

  it("sorts by subject and paginates with the true total in X-Total-Count", async () => {
    const pageMarker = `${MARKER}-cor-page`;
    await createCorrespondence(`${pageMarker}-aaa`);
    await createCorrespondence(`${pageMarker}-bbb`);
    await createCorrespondence(`${pageMarker}-ccc`);

    const firstPage = await request(app)
      .get(`/correspondence?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=subject&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].subject).toBe(`${pageMarker}-aaa`);
  });
});
