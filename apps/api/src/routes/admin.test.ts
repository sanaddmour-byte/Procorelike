import { randomUUID } from "node:crypto";
import http, { type Server } from "node:http";
import { schema } from "@siteops/db";
import { signWebhookPayload } from "@siteops/shared/server";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Admin layer (item 6/6 of the Procore-parity roadmap): company-scoped API
 * keys + webhooks (the honest stand-in for SSO/ERP integration), the
 * cross-project Company Dashboard, and CSV/IIF exports.
 */

const SEED_PASSWORD = "ChangeMe123!";

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let companyId: string;

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const loginRes = await request(app).post("/auth/login").send({ email: "omar.nassar@siteops.test", password: SEED_PASSWORD });
  expect(loginRes.status).toBe(200);
  const token = loginRes.body.accessToken as string;
  const omarUserId = loginRes.body.user.id as string;

  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = projectsRes.body[0].id as string;

  // Resolved via authDb, not the /companies list -- that list also
  // includes companies omar merely shares a project with
  // (is_company_visible), and only an actual user_companies membership
  // (is_company_member) can manage this company's API keys/webhooks.
  const [membership] = await clients.authDb.db.select().from(schema.userCompanies).where(eq(schema.userCompanies.userId, omarUserId)).limit(1);
  if (!membership) throw new Error("Seed user omar.nassar has no company membership");
  companyId = membership.companyId;
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

async function seedCostCodeId(): Promise<string> {
  const [costCode] = await clients.authDb.db.select().from(schema.costCodes).where(eq(schema.costCodes.projectId, projectId)).limit(1);
  if (!costCode) throw new Error("Seed cost code not found");
  return costCode.id;
}

describe("API keys (Admin Console)", () => {
  it("creates a key, authenticates the external API as its creator, and revokes it", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const createRes = await request(app)
      .post("/admin/api-keys")
      .set("authorization", `Bearer ${token}`)
      .send({ companyId, name: `Test key ${randomUUID()}` });
    expect(createRes.status).toBe(201);
    expect(createRes.body.plaintext).toMatch(/^sk_live_/);
    expect(createRes.body.keyHash).toBeUndefined();
    const plaintext = createRes.body.plaintext as string;
    const keyId = createRes.body.id as string;

    // Authenticates as omar (the key's creator) -- same projects list as omar's own JWT.
    const externalProjectsRes = await request(app).get("/external/v1/projects").set("x-api-key", plaintext);
    expect(externalProjectsRes.status).toBe(200);
    expect(externalProjectsRes.body.some((p: { id: string }) => p.id === projectId)).toBe(true);

    const listRes = await request(app).get(`/admin/companies/${companyId}/api-keys`).set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((k: { id: string; keyPrefix: string }) => k.id === keyId && k.keyPrefix.startsWith("sk_live_"))).toBe(true);

    const revokeRes = await request(app).post(`/admin/companies/${companyId}/api-keys/${keyId}/revoke`).set("authorization", `Bearer ${token}`);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.revokedAt).not.toBeNull();

    const revokedAuthRes = await request(app).get("/external/v1/projects").set("x-api-key", plaintext);
    expect(revokedAuthRes.status).toBe(401);
  });

  it("rejects a missing or garbage API key", async () => {
    const noKeyRes = await request(app).get("/external/v1/projects");
    expect(noKeyRes.status).toBe(401);

    const badKeyRes = await request(app).get("/external/v1/projects").set("x-api-key", "sk_live_not_a_real_key");
    expect(badKeyRes.status).toBe(401);
  });

  it("a non-member cannot create an API key for a company they don't belong to", async () => {
    const outsiderToken = await loginAs("huda.masri@siteops.test");

    const otherCompanyId = randomUUID();
    await clients.authDb.db.insert(schema.companies).values({ id: otherCompanyId, name: `Outsider co ${randomUUID()}`, type: "sub" });

    const res = await request(app)
      .post("/admin/api-keys")
      .set("authorization", `Bearer ${outsiderToken}`)
      .send({ companyId: otherCompanyId, name: "Should fail" });
    expect(res.status).toBe(403);
  });
});

describe("Webhooks (Admin Console) + real dispatch", () => {
  let server: Server;
  let receivedBodies: { body: string; signature: string }[] = [];
  let webhookUrl: string;

  beforeAll(async () => {
    receivedBodies = [];
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        receivedBodies.push({ body: Buffer.concat(chunks).toString("utf8"), signature: String(req.headers["x-siteops-signature"] ?? "") });
        res.writeHead(200);
        res.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Failed to bind test webhook server");
    webhookUrl = `http://127.0.0.1:${address.port}/hook`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("fires rfi.closed to a subscribed webhook, signed with its own secret, and logs the delivery", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const subRes = await request(app)
      .post("/admin/webhooks")
      .set("authorization", `Bearer ${token}`)
      .send({ companyId, url: webhookUrl, eventTypes: ["rfi.closed"] });
    expect(subRes.status).toBe(201);
    expect(subRes.body.secret).toMatch(/^whsec_/);
    const secret = subRes.body.secret as string;
    const subscriptionId = subRes.body.id as string;

    const rfiRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, subject: `Webhook test RFI ${randomUUID()}`, question: "Does the dispatch fire?" });
    expect(rfiRes.status).toBe(201);
    const rfiId = rfiRes.body.id as string;

    await request(app).post(`/rfis/${rfiId}/transition`).set("authorization", `Bearer ${token}`).send({ toStatus: "open" }).expect(200);
    await request(app).post(`/rfis/${rfiId}/transition`).set("authorization", `Bearer ${token}`).send({ toStatus: "closed" }).expect(200);

    // Dispatch is fire-and-forget from the route handler -- give it a moment to land.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(receivedBodies.length).toBeGreaterThan(0);
    const delivery = receivedBodies[receivedBodies.length - 1];
    if (!delivery) throw new Error("No delivery received");
    expect(delivery.signature).toBe(signWebhookPayload(secret, delivery.body));
    const parsed = JSON.parse(delivery.body) as { eventType: string; payload: { rfiId: string } };
    expect(parsed.eventType).toBe("rfi.closed");
    expect(parsed.payload.rfiId).toBe(rfiId);

    const deliveriesRes = await request(app).get(`/admin/webhooks/${subscriptionId}/deliveries`).set("authorization", `Bearer ${token}`);
    expect(deliveriesRes.status).toBe(200);
    expect(deliveriesRes.body.some((d: { eventType: string; statusCode: number }) => d.eventType === "rfi.closed" && d.statusCode === 200)).toBe(true);

    await request(app).delete(`/admin/companies/${companyId}/webhooks/${subscriptionId}`).set("authorization", `Bearer ${token}`).expect(204);
  });
});

describe("Company Dashboard", () => {
  it("aggregates project dashboards for every project the company participates in", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const res = await request(app).get(`/admin/companies/${companyId}/dashboard`).set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((row: { projectId: string }) => row.projectId === projectId)).toBe(true);
  });

  it("rejects a caller who isn't a member of the company", async () => {
    const otherCompanyId = randomUUID();
    await clients.authDb.db.insert(schema.companies).values({ id: otherCompanyId, name: `Isolated co ${randomUUID()}`, type: "sub" });
    const token = await loginAs("omar.nassar@siteops.test");
    const res = await request(app).get(`/admin/companies/${otherCompanyId}/dashboard`).set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("Exports", () => {
  it("exports the budget as CSV including committed and direct costs", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const costCodeId = await seedCostCodeId();
    await request(app).post("/budget-line-items").set("authorization", `Bearer ${token}`).send({ projectId, costCodeId, originalAmount: 50000 }).expect(201);

    const res = await request(app).get(`/admin/projects/${projectId}/exports/budget.csv`).set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Cost Code");
    expect(res.text.split("\r\n").length).toBeGreaterThan(1);
  });

  it("exports commitments as a valid IIF transaction file", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const companiesRes = await request(app).get(`/projects/${projectId}/companies`).set("authorization", `Bearer ${token}`);
    const vendorCompanyId = companiesRes.body[0].companyId as string;
    const costCodeId = await seedCostCodeId();

    const commitmentRes = await request(app)
      .post("/commitments")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, title: `IIF export test ${randomUUID()}`, companyId: vendorCompanyId, type: "subcontract" });
    expect(commitmentRes.status).toBe(201);
    const commitmentId = commitmentRes.body.id as string;

    await request(app)
      .post(`/commitments/${commitmentId}/line-items`)
      .set("authorization", `Bearer ${token}`)
      .send({ costCodeId, description: "Test line", scheduleOfValuesAmount: 1000 })
      .expect(201);

    const res = await request(app).get(`/admin/projects/${projectId}/exports/commitments.iif`).set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("!TRNS");
    expect(res.text).toContain("PURCHORD");
    expect(res.text).toContain("ENDTRNS");
  });
});
