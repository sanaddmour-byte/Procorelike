import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 24's rollout of the Phase 21 server-query contract (search/filter/
 * sort/pagination) to Inspections, T&M Tickets, Transmittals, and Safety
 * Incidents -- one backward-compatibility + filter/sort/pagination sweep
 * per module, mirroring phase22-list-query.test.ts/phase23-list-query.test.ts.
 * Also covers the column-key/sort-key contract regression found and fixed
 * mid-phase for T&M Tickets' and Safety Incidents' joined "company" column
 * (see docs/DATA_MODEL.md §9n): neither module's sort-key enum includes a
 * "company" key, so a request for it must be rejected, not silently ignored.
 * Preconditions: same seeded Postgres as apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";
const MARKER = `p24${Date.now()}`;

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

describe("GET /inspections query contract (Phase 24)", () => {
  async function createInspection(templateTitle: string): Promise<{ id: string }> {
    const templateRes = await request(app)
      .post("/checklist-templates")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, title: templateTitle, items: [{ prompt: "Looks fine?", responseType: "pass_fail", order: 1 }] });
    expect(templateRes.status).toBe(201);

    const res = await request(app)
      .post("/inspections")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, templateId: templateRes.body.id });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createInspection(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/inspections?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches the joined checklist template title, and sort/pagination report the true total", async () => {
    const pageMarker = `${MARKER}-insp-page`;
    await createInspection(`${pageMarker}-aaa`);
    await createInspection(`${pageMarker}-bbb`);
    await createInspection(`${pageMarker}-ccc`);

    const bySearch = await request(app)
      .get(`/inspections?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body).toHaveLength(3);

    const firstPage = await request(app)
      .get(`/inspections?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=templateTitle&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
  });

  it("the status filter narrows results to scheduled inspections", async () => {
    const created = await createInspection(`${MARKER}-status-filter`);
    const byStatus = await request(app)
      .get(`/inspections?projectId=${projectId}&search=${encodeURIComponent(MARKER)}-status-filter&status=scheduled`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byStatus.body.map((i: { id: string }) => i.id)).toContain(created.id);
  });
});

describe("GET /tm-tickets query contract (Phase 24)", () => {
  async function createTicket(description: string): Promise<{ id: string }> {
    const huda = memberByEmail("huda.masri@siteops.test");
    const res = await request(app)
      .post("/tm-tickets")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, companyId: huda.companyId, workDate: "2026-03-01", description });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createTicket(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/tm-tickets?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches description or ticket number, and sort/pagination report the true total", async () => {
    const pageMarker = `${MARKER}-tm-page`;
    await createTicket(`${pageMarker}-aaa`);
    await createTicket(`${pageMarker}-bbb`);
    await createTicket(`${pageMarker}-ccc`);

    const bySearch = await request(app)
      .get(`/tm-tickets?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body).toHaveLength(3);

    const firstPage = await request(app)
      .get(`/tm-tickets?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=description&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].description).toBe(`${pageMarker}-aaa`);
  });

  it("rejects sort=company: the list page's Company column is a joined lookup, not a sortable server column", async () => {
    const res = await request(app)
      .get(`/tm-tickets?projectId=${projectId}&sort=company&direction=asc`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /transmittals query contract (Phase 24)", () => {
  async function createTransmittal(subject: string): Promise<{ id: string }> {
    const lina = memberByEmail("lina.kanaan@siteops.test");
    const attachmentRes = await request(app)
      .post("/attachments/confirm")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        projectId,
        ownerType: "document",
        ownerId: projectId,
        storageKey: `${projectId}/document/${subject}-test.pdf`,
        filename: "test.pdf",
        mime: "application/pdf",
        size: 100,
      });
    expect(attachmentRes.status).toBe(201);
    const docRes = await request(app)
      .post("/documents")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, title: `${subject} doc`, attachmentId: attachmentRes.body.id });
    expect(docRes.status).toBe(201);

    const res = await request(app)
      .post("/transmittals")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        projectId,
        subject,
        purpose: "for_review",
        items: [{ itemType: "document", itemId: docRes.body.id, description: docRes.body.title }],
        recipients: [{ userId: lina.userId }],
      });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createTransmittal(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/transmittals?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches subject or transmittal number, and sort/pagination report the true total", async () => {
    const pageMarker = `${MARKER}-tr-page`;
    await createTransmittal(`${pageMarker}-aaa`);
    await createTransmittal(`${pageMarker}-bbb`);
    await createTransmittal(`${pageMarker}-ccc`);

    const bySearch = await request(app)
      .get(`/transmittals?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body).toHaveLength(3);

    const firstPage = await request(app)
      .get(`/transmittals?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=subject&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].subject).toBe(`${pageMarker}-aaa`);
  });

  it("the status filter narrows results to draft transmittals", async () => {
    const created = await createTransmittal(`${MARKER}-status-filter`);
    const byStatus = await request(app)
      .get(`/transmittals?projectId=${projectId}&search=${encodeURIComponent(MARKER)}-status-filter&status=draft`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(byStatus.body.map((t: { id: string }) => t.id)).toContain(created.id);
  });
});

describe("GET /safety-incidents query contract (Phase 24)", () => {
  async function createIncident(description: string): Promise<{ id: string }> {
    const res = await request(app)
      .post("/safety-incidents")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, occurredAt: new Date().toISOString(), severity: "minor", description });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it("with no query params, returns a plain array of every row (backward compatible)", async () => {
    const created = await createIncident(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/safety-incidents?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: string }[]).some((r) => r.id === created.id)).toBe(true);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches description, and sort/pagination report the true total", async () => {
    const pageMarker = `${MARKER}-si-page`;
    await createIncident(`${pageMarker}-aaa`);
    await createIncident(`${pageMarker}-bbb`);
    await createIncident(`${pageMarker}-ccc`);

    const bySearch = await request(app)
      .get(`/safety-incidents?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(bySearch.body).toHaveLength(3);

    const firstPage = await request(app)
      .get(`/safety-incidents?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&sort=description&direction=asc&pageSize=2&page=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");
    expect(firstPage.body[0].description).toBe(`${pageMarker}-aaa`);
  });

  it("rejects sort=company: the list page's Involved Company column is a joined lookup, not a sortable server column", async () => {
    const res = await request(app)
      .get(`/safety-incidents?projectId=${projectId}&sort=company&direction=asc`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});
