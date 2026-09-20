import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 30 (Arabic PDF font/bidi fix) integration test -- the self-defined
 * gate: an RFI whose subject/question contain Arabic text no longer crashes
 * the PDF export (pdf-lib's built-in Helvetica throws `WinAnsi cannot
 * encode "X"` on any non-Latin-1 codepoint; Noto Sans Arabic is now embedded
 * instead), and the response is still a well-formed PDF. Preconditions: same
 * seeded Postgres as apps/api/src/routes/integration.test.ts.
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

describe("Phase 30: Arabic text no longer crashes PDF export", () => {
  it("exports a single-item RFI report whose subject/question contain Arabic text", async () => {
    const token = await loginAs("sara.haddad@siteops.test");

    const rfiRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        subject: "تفاصيل العزل المائي عند الحاجز — Waterproofing detail",
        question: "الرجاء تأكيد طول تراكب الغشاء العازل. Please confirm the membrane lap length.",
      });
    expect(rfiRes.status).toBe(201);

    const reportRes = await request(app)
      .get(`/rfis/${rfiRes.body.id}/report`)
      .set("authorization", `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser);
    expect(reportRes.status).toBe(200);
    expect(reportRes.headers["content-type"]).toBe("application/pdf");
    assertPdf(reportRes.body as Buffer);
  });

  it("exports an RFI register (list report) containing a row with Arabic text", async () => {
    const token = await loginAs("sara.haddad@siteops.test");

    const rfiRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, subject: "طلب معلومات بخصوص التسليح", question: "ما هو قطر حديد التسليح المطلوب؟" });
    expect(rfiRes.status).toBe(201);

    const registerRes = await request(app)
      .get("/rfis/summary-report")
      .query({ projectId, format: "pdf" })
      .set("authorization", `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser);
    expect(registerRes.status).toBe(200);
    expect(registerRes.headers["content-type"]).toBe("application/pdf");
    assertPdf(registerRes.body as Buffer);
  });

  it("exports a report whose Arabic text contains a combining diacritic (tashkeel/tanwin), not just base letters", async () => {
    // Regression test for a bug found after this phase originally shipped: Arabic
    // text containing a combining mark (tanwin, e.g. the "ً" in "وفقاً") crashed
    // pdf-lib/fontkit's automatic glyph-positioning shaping once bidi-text.ts's
    // word-reversal split the mark away from its base character -- see
    // bidi-text.test.ts's "keeps a combining diacritic ... attached" test for the
    // unit-level repro and the fix (grapheme-cluster-aware reversal).
    const token = await loginAs("sara.haddad@siteops.test");

    const rfiRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        subject: "طول التراكب المطلوب وفقاً لمواصفات المُصنّع",
        question: "الرجاء تأكيد طول التراكب المطلوب هو 150 مم كحد أدنى وفقاً لمواصفات المُصنّع.",
      });
    expect(rfiRes.status).toBe(201);

    const reportRes = await request(app)
      .get(`/rfis/${rfiRes.body.id}/report`)
      .set("authorization", `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser);
    expect(reportRes.status).toBe(200);
    expect(reportRes.headers["content-type"]).toBe("application/pdf");
    assertPdf(reportRes.body as Buffer);
  });
});
