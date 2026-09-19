import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 21's server-query contract (search/status/assignee filter/sort/
 * pagination), proven end-to-end on GET /rfis. Every case here also
 * doubles as the backward-compatibility check: a request with none of
 * these query params (the shape every pre-existing caller, including the
 * mobile app, already sends) must come back exactly as it did before this
 * phase -- a plain array, every visible row, no pagination applied.
 * Preconditions: same seeded Postgres as apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";
// A random-ish marker per test file run so searches/counts are scoped to rows this
// file created, robust against the many other RFIs other test files leave behind
// on this same shared, persistent seeded project.
const MARKER = `zqxw${Date.now()}`;

interface Member {
  userId: string;
  email: string;
}

interface RfiRow {
  id: string;
  number: string;
  subject: string;
  status: string;
  ballInCourtUserId: string | null;
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

async function createRfi(subject: string, ballInCourtUserId?: string): Promise<RfiRow> {
  const res = await request(app)
    .post("/rfis")
    .set("authorization", `Bearer ${adminToken}`)
    .send({ projectId, subject, question: "Please advise.", ballInCourtUserId });
  expect(res.status).toBe(201);
  return res.body as RfiRow;
}

describe("GET /rfis query contract (Phase 21)", () => {
  it("with no query params, returns a plain array of every visible row (backward compatible)", async () => {
    const created = await createRfi(`${MARKER} backward-compat check`);
    const res = await request(app).get(`/rfis?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as RfiRow[]).some((r) => r.id === created.id)).toBe(true);
    // X-Total-Count is purely additive -- present, but callers that don't read it are unaffected.
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  it("search matches subject or number", async () => {
    const created = await createRfi(`${MARKER} waterproofing at level 4`);
    const bySubject = await request(app).get(`/rfis?projectId=${projectId}&search=${encodeURIComponent(MARKER)}`).set("authorization", `Bearer ${adminToken}`);
    expect(bySubject.body.map((r: RfiRow) => r.id)).toContain(created.id);

    const byNumber = await request(app).get(`/rfis?projectId=${projectId}&search=${encodeURIComponent(created.number)}`).set("authorization", `Bearer ${adminToken}`);
    expect(byNumber.body.map((r: RfiRow) => r.id)).toContain(created.id);
  });

  it("filters by status and by assignee", async () => {
    const khalid = memberByEmail("khalid.zoubi@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test");
    const forKhalid = await createRfi(`${MARKER} assignee filter khalid`, khalid.userId);
    const forLina = await createRfi(`${MARKER} assignee filter lina`, lina.userId);

    const assigneeRes = await request(app)
      .get(`/rfis?projectId=${projectId}&search=${encodeURIComponent(MARKER)} assignee filter&assigneeUserId=${khalid.userId}`)
      .set("authorization", `Bearer ${adminToken}`);
    const assigneeIds = (assigneeRes.body as RfiRow[]).map((r) => r.id);
    expect(assigneeIds).toContain(forKhalid.id);
    expect(assigneeIds).not.toContain(forLina.id);

    const statusRes = await request(app)
      .get(`/rfis?projectId=${projectId}&search=${encodeURIComponent(MARKER)} assignee filter&status=draft`)
      .set("authorization", `Bearer ${adminToken}`);
    // Both were just created, so both are still "draft" -- confirms the status filter passes through rather than excluding everything.
    const statusIds = (statusRes.body as RfiRow[]).map((r) => r.id);
    expect(statusIds).toContain(forKhalid.id);
    expect(statusIds).toContain(forLina.id);
  });

  it("sorts by subject in either direction", async () => {
    await createRfi(`${MARKER}-sort-aaa-first`);
    await createRfi(`${MARKER}-sort-zzz-last`);

    const asc = await request(app)
      .get(`/rfis?projectId=${projectId}&search=${encodeURIComponent(MARKER)}-sort&sort=subject&direction=asc`)
      .set("authorization", `Bearer ${adminToken}`);
    const ascSubjects = (asc.body as RfiRow[]).map((r) => r.subject);
    expect(ascSubjects.indexOf(`${MARKER}-sort-aaa-first`)).toBeLessThan(ascSubjects.indexOf(`${MARKER}-sort-zzz-last`));

    const desc = await request(app)
      .get(`/rfis?projectId=${projectId}&search=${encodeURIComponent(MARKER)}-sort&sort=subject&direction=desc`)
      .set("authorization", `Bearer ${adminToken}`);
    const descSubjects = (desc.body as RfiRow[]).map((r) => r.subject);
    expect(descSubjects.indexOf(`${MARKER}-sort-zzz-last`)).toBeLessThan(descSubjects.indexOf(`${MARKER}-sort-aaa-first`));
  });

  it("paginates and reports the true total via X-Total-Count, independent of the page size", async () => {
    const pageMarker = `${MARKER}-page`;
    await createRfi(`${pageMarker}-1`);
    await createRfi(`${pageMarker}-2`);
    await createRfi(`${pageMarker}-3`);

    const firstPage = await request(app)
      .get(`/rfis?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&pageSize=2&page=1&sort=subject&direction=asc`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.headers["x-total-count"]).toBe("3");

    const secondPage = await request(app)
      .get(`/rfis?projectId=${projectId}&search=${encodeURIComponent(pageMarker)}&pageSize=2&page=2&sort=subject&direction=asc`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(secondPage.body).toHaveLength(1);
    expect(secondPage.headers["x-total-count"]).toBe("3");

    // No overlap between pages.
    const firstIds = new Set(firstPage.body.map((r: RfiRow) => r.id));
    for (const row of secondPage.body as RfiRow[]) expect(firstIds.has(row.id)).toBe(false);
  });

  it("excludes a private RFI from both the results and the total count for a caller with no access to it", async () => {
    const privateMarker = `${MARKER}-private`;
    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ projectId, subject: privateMarker, question: "Confidential.", isPrivate: true });
    expect(createRes.status).toBe(201);

    const outsiderToken = await loginAs("karim.abughazaleh@siteops.test");
    const asOutsider = await request(app)
      .get(`/rfis?projectId=${projectId}&search=${encodeURIComponent(privateMarker)}`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(asOutsider.body).toHaveLength(0);
    expect(asOutsider.headers["x-total-count"]).toBe("0");

    const asCreator = await request(app)
      .get(`/rfis?projectId=${projectId}&search=${encodeURIComponent(privateMarker)}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(asCreator.body).toHaveLength(1);
    expect(asCreator.headers["x-total-count"]).toBe("1");
  });
});
