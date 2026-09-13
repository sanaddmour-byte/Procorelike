import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 13 ("export all") gate: every module with a single-item PDF export
 * (RFI/Submittal/Change Order/Correspondence/Inspection) also exposes a
 * `GET /<module>/summary-report?projectId=` register -- a table summary of
 * every item on the project, A4-sized like every other export. Preconditions:
 * same seeded Postgres as apps/api/src/routes/integration.test.ts.
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

/** supertest's default JSON parser mangles binary bodies -- collect raw bytes instead, same pattern as branded-pdf.test.ts. */
function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

function assertPdf(bytes: Buffer): void {
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(500);
}

async function fetchSummaryReport(path: string, token: string): Promise<Buffer> {
  const res = await request(app).get(path).query({ projectId }).set("authorization", `Bearer ${token}`).buffer(true).parse(binaryParser);
  expect(res.status).toBe(200);
  expect(res.headers["content-type"]).toBe("application/pdf");
  return res.body as Buffer;
}

describe("Phase 13: summary (export-all) PDF registers", () => {
  it("returns an A4 table-summary PDF register for RFIs, submittals, change orders, correspondence, and inspections", async () => {
    const saraToken = await loginAs("sara.haddad@siteops.test");

    // Seed at least one row in each module so the register isn't just the empty-state message.
    await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${saraToken}`)
      .send({ projectId, subject: "Summary export smoke RFI", question: "Does the register PDF include this row?" })
      .expect(201);

    const specSectionsRes = await request(app).get("/submittals/spec-sections").query({ projectId }).set("authorization", `Bearer ${saraToken}`);
    await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${saraToken}`)
      .send({ projectId, specSectionId: specSectionsRes.body[0].id, title: "Summary export smoke submittal" })
      .expect(201);

    const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${saraToken}`);
    const sara = membersRes.body.find((m: { email: string }) => m.email === "sara.haddad@siteops.test");
    const huda = membersRes.body.find((m: { email: string }) => m.email === "huda.masri@siteops.test");
    await request(app)
      .post("/correspondence")
      .set("authorization", `Bearer ${saraToken}`)
      .send({
        projectId,
        direction: "outgoing",
        type: "memo",
        subject: "Summary export smoke memo",
        body: "For the summary register test.",
        fromCompanyId: sara.companyId,
        toCompanyId: huda.companyId,
      })
      .expect(201);

    const templatesRes = await request(app).get("/checklist-templates").query({ projectId }).set("authorization", `Bearer ${saraToken}`);
    if (templatesRes.body.length > 0) {
      await request(app)
        .post("/inspections")
        .set("authorization", `Bearer ${saraToken}`)
        .send({ projectId, templateId: templatesRes.body[0].id })
        .expect(201);
    }

    assertPdf(await fetchSummaryReport("/rfis/summary-report", saraToken));
    assertPdf(await fetchSummaryReport("/submittals/summary-report", saraToken));
    assertPdf(await fetchSummaryReport("/change-orders/summary-report", saraToken));
    assertPdf(await fetchSummaryReport("/correspondence/summary-report", saraToken));
    assertPdf(await fetchSummaryReport("/inspections/summary-report", saraToken));
  });
});
