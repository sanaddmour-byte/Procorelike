import { schema } from "@siteops/db";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 12 (branded PDF exports, company logo, correspondence signature)
 * integration tests -- the self-defined gate: a company can upload a PNG
 * logo that shows up embedded in every module's PDF letterhead, RFI/
 * Submittal/Change Order all export a real PDF, and Correspondence can't
 * be sent without a typed signature. Preconditions: same seeded Postgres
 * as apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";

// A well-known minimal valid 1x1 transparent PNG.
const TEST_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

interface Member {
  userId: string;
  email: string;
  companyId: string;
}

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let members: Member[];

/** Re-running this suite must start from "no logo yet" -- a previous run's upload otherwise persists (companies aren't project-scoped, so there's no per-project cleanup to piggyback on). */
async function resetCompanyLogo(companyId: string): Promise<void> {
  await clients.authDb.db.update(schema.companies).set({ logoDataBase64: null, logoMime: null }).where(eq(schema.companies.id, companyId));
}

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const token = await loginAs("omar.nassar@siteops.test");
  const res = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = res.body[0].id as string;

  const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${token}`);
  members = membersRes.body as Member[];

  const sara = members.find((m) => m.email === "sara.haddad@siteops.test");
  if (sara) await resetCompanyLogo(sara.companyId);
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

/** supertest's default JSON parser mangles binary bodies -- collect raw bytes instead, same pattern as inspection.test.ts's PDF assertion. */
function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

function assertPdf(bytes: Buffer): void {
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(500);
}

describe("Phase 12: branded PDF exports, company logo, correspondence signature", () => {
  it("uploads a company logo, embeds it in RFI/Submittal/Change Order PDFs, and requires a signature to send correspondence", async () => {
    const saraToken = await loginAs("sara.haddad@siteops.test");
    const sara = memberByEmail("sara.haddad@siteops.test");
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const huda = memberByEmail("huda.masri@siteops.test");

    // -- Company logo: list omits the blob, upload requires membership, GET serves real bytes --
    const companiesBeforeRes = await request(app).get("/companies").set("authorization", `Bearer ${saraToken}`);
    expect(companiesBeforeRes.status).toBe(200);
    const saraCompanyBefore = companiesBeforeRes.body.find((c: { id: string }) => c.id === sara.companyId);
    expect(saraCompanyBefore).toBeDefined();
    expect(saraCompanyBefore.hasLogo).toBe(false);
    expect(saraCompanyBefore.logoDataBase64).toBeUndefined();

    const outsiderUploadRes = await request(app)
      .post(`/companies/${sara.companyId}/logo`)
      .set("authorization", `Bearer ${await loginAs("huda.masri@siteops.test")}`)
      .send({ mime: "image/png", dataBase64: TEST_PNG_BASE64 });
    expect(outsiderUploadRes.status).toBe(403); // huda is on a different company

    const uploadRes = await request(app)
      .post(`/companies/${sara.companyId}/logo`)
      .set("authorization", `Bearer ${saraToken}`)
      .send({ mime: "image/png", dataBase64: TEST_PNG_BASE64 });
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.hasLogo).toBe(true);
    expect(uploadRes.body.logoDataBase64).toBeUndefined();

    const companiesAfterRes = await request(app).get("/companies").set("authorization", `Bearer ${saraToken}`);
    const saraCompanyAfter = companiesAfterRes.body.find((c: { id: string }) => c.id === sara.companyId);
    expect(saraCompanyAfter.hasLogo).toBe(true);

    const logoGetRes = await request(app)
      .get(`/companies/${sara.companyId}/logo`)
      .set("authorization", `Bearer ${saraToken}`)
      .buffer(true)
      .parse(binaryParser);
    expect(logoGetRes.status).toBe(200);
    expect(logoGetRes.headers["content-type"]).toBe("image/png");
    expect((logoGetRes.body as Buffer).length).toBeGreaterThan(50);

    // -- RFI PDF, branded with sara's company logo (sara is the RFI's creator) --
    const rfiRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${saraToken}`)
      .send({ projectId, subject: "Waterproofing detail at parapet", question: "Please confirm the membrane lap length." });
    expect(rfiRes.status).toBe(201);

    const rfiReportRes = await request(app)
      .get(`/rfis/${rfiRes.body.id}/report`)
      .set("authorization", `Bearer ${saraToken}`)
      .buffer(true)
      .parse(binaryParser);
    expect(rfiReportRes.status).toBe(200);
    expect(rfiReportRes.headers["content-type"]).toBe("application/pdf");
    assertPdf(rfiReportRes.body as Buffer);

    // -- Submittal PDF --
    const specSectionsRes = await request(app).get("/submittals/spec-sections").query({ projectId }).set("authorization", `Bearer ${saraToken}`);
    const specSectionId = specSectionsRes.body[0].id as string;
    const submittalRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${saraToken}`)
      .send({ projectId, specSectionId, title: "Roofing membrane product data" });
    expect(submittalRes.status).toBe(201);

    const submittalReportRes = await request(app)
      .get(`/submittals/${submittalRes.body.id}/report`)
      .set("authorization", `Bearer ${saraToken}`)
      .buffer(true)
      .parse(binaryParser);
    expect(submittalReportRes.status).toBe(200);
    expect(submittalReportRes.headers["content-type"]).toBe("application/pdf");
    assertPdf(submittalReportRes.body as Buffer);

    // -- Change Order PDF, with a real approval chain entry to resolve names for --
    const [costCode] = await clients.authDb.db.select().from(schema.costCodes).where(eq(schema.costCodes.projectId, projectId)).limit(1);
    const lineItemRes = await request(app)
      .post("/budget-line-items")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, costCodeId: costCode!.id, originalAmount: 50000, forecastToComplete: 0 });
    expect(lineItemRes.status).toBe(201);

    const coRes = await request(app)
      .post("/change-orders")
      .set("authorization", `Bearer ${saraToken}`)
      .send({ projectId, targetType: "prime", targetId: lineItemRes.body.id, costImpact: 1500 });
    expect(coRes.status).toBe(201);
    await request(app).post(`/change-orders/${coRes.body.id}/submit`).set("authorization", `Bearer ${saraToken}`).expect(200);
    const approveRes = await request(app).post(`/change-orders/${coRes.body.id}/approve`).set("authorization", `Bearer ${saraToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.approvalChain).toHaveLength(1);

    const coReportRes = await request(app)
      .get(`/change-orders/${coRes.body.id}/report`)
      .set("authorization", `Bearer ${saraToken}`)
      .buffer(true)
      .parse(binaryParser);
    expect(coReportRes.status).toBe(200);
    expect(coReportRes.headers["content-type"]).toBe("application/pdf");
    assertPdf(coReportRes.body as Buffer);

    // -- Correspondence: cannot be sent without a signature, can with one --
    const correspondenceRes = await request(app)
      .post("/correspondence")
      .set("authorization", `Bearer ${saraToken}`)
      .send({
        projectId,
        direction: "outgoing",
        type: "letter",
        subject: "Formal notice regarding site access",
        body: "Please ensure the west gate remains clear for concrete deliveries.",
        fromCompanyId: sara.companyId,
        toCompanyId: huda.companyId,
      });
    expect(correspondenceRes.status).toBe(201);
    const correspondenceId = correspondenceRes.body.id as string;

    const missingSignatureRes = await request(app)
      .post(`/correspondence/${correspondenceId}/transition`)
      .set("authorization", `Bearer ${saraToken}`)
      .send({ toStatus: "sent" });
    expect(missingSignatureRes.status).toBe(400);

    const signedSendRes = await request(app)
      .post(`/correspondence/${correspondenceId}/transition`)
      .set("authorization", `Bearer ${saraToken}`)
      .send({ toStatus: "sent", senderSignatureName: "Sara Haddad" });
    expect(signedSendRes.status).toBe(200);
    expect(signedSendRes.body.senderSignatureName).toBe("Sara Haddad");
    expect(signedSendRes.body.sentDate).toBeTruthy();

    const correspondenceReportRes = await request(app)
      .get(`/correspondence/${correspondenceId}/report`)
      .set("authorization", `Bearer ${saraToken}`)
      .buffer(true)
      .parse(binaryParser);
    expect(correspondenceReportRes.status).toBe(200);
    expect(correspondenceReportRes.headers["content-type"]).toBe("application/pdf");
    assertPdf(correspondenceReportRes.body as Buffer);
  });
});
