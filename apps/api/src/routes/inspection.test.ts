import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 5 (Quality) integration tests: checklist templates, the inspection
 * lifecycle (scheduled → in_progress → completed), the failed-pass/fail →
 * punch-item auto-generation rule, and the response-type validation guard.
 * Preconditions: same seeded Postgres as apps/api/src/routes/integration.test.ts.
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

describe("Checklist Templates + Inspections", () => {
  it("creates a template, runs an inspection end to end, auto-generates a punch item for the failed item, and signs off completion", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const templateRes = await request(app)
      .post("/checklist-templates")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        title: "Weekly Safety Walk",
        items: [
          { prompt: "Fire extinguishers charged and accessible", responseType: "pass_fail", order: 1 },
          { prompt: "Scaffolding tagged and inspected", responseType: "pass_fail", order: 2 },
          { prompt: "Ambient temperature", responseType: "numeric", order: 3 },
        ],
      });
    expect(templateRes.status).toBe(201);
    expect(templateRes.body.items).toHaveLength(3);
    const [passItem, failItem, numericItem] = templateRes.body.items;

    const inspectionRes = await request(app)
      .post("/inspections")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, templateId: templateRes.body.id });
    expect(inspectionRes.status).toBe(201);
    expect(inspectionRes.body.status).toBe("scheduled");
    const inspectionId = inspectionRes.body.id as string;

    const startRes = await request(app)
      .post(`/inspections/${inspectionId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "in_progress" });
    expect(startRes.status).toBe(200);
    expect(startRes.body.status).toBe("in_progress");
    expect(startRes.body.performedBy).toBeTruthy();

    const answerRes = await request(app)
      .patch(`/inspections/${inspectionId}/responses`)
      .set("authorization", `Bearer ${token}`)
      .send({
        responses: [
          { templateItemId: passItem.id, value: { type: "pass_fail", passed: true } },
          { templateItemId: failItem.id, value: { type: "pass_fail", passed: false } },
          { templateItemId: numericItem.id, value: { type: "numeric", number: 24 } },
        ],
      });
    expect(answerRes.status).toBe(200);

    const failedResponse = answerRes.body.find((r: { templateItemId: string }) => r.templateItemId === failItem.id);
    const passedResponse = answerRes.body.find((r: { templateItemId: string }) => r.templateItemId === passItem.id);
    expect(failedResponse.generatedPunchItemId).toBeTruthy();
    expect(passedResponse.generatedPunchItemId).toBeNull();

    const punchItemRes = await request(app)
      .get(`/punch-items/${failedResponse.generatedPunchItemId}`)
      .set("authorization", `Bearer ${token}`);
    expect(punchItemRes.status).toBe(200);
    expect(punchItemRes.body.description).toContain("Scaffolding tagged and inspected");

    // Re-submitting a rejected-type value is caught by validation.
    const wrongTypeRes = await request(app)
      .patch(`/inspections/${inspectionId}/responses`)
      .set("authorization", `Bearer ${token}`)
      .send({ responses: [{ templateItemId: numericItem.id, value: { type: "pass_fail", passed: true } }] });
    expect(wrongTypeRes.status).toBe(400);

    const completeRes = await request(app)
      .post(`/inspections/${inspectionId}/complete`)
      .set("authorization", `Bearer ${token}`)
      .send({ signedByName: "Omar Nassar" });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe("completed");
    expect(completeRes.body.signedByName).toBe("Omar Nassar");
    expect(completeRes.body.signedAt).toBeTruthy();

    const editAfterCompleteRes = await request(app)
      .patch(`/inspections/${inspectionId}/responses`)
      .set("authorization", `Bearer ${token}`)
      .send({ responses: [{ templateItemId: passItem.id, value: { type: "pass_fail", passed: false } }] });
    expect(editAfterCompleteRes.status).toBe(400);
    expect(editAfterCompleteRes.body.error.code).toBe("inspection_completed");

    const detailRes = await request(app).get(`/inspections/${inspectionId}`).set("authorization", `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.templateTitle).toBe("Weekly Safety Walk");
    expect(detailRes.body.responses).toHaveLength(3);

    const reportRes = await request(app)
      .get(`/inspections/${inspectionId}/report`)
      .set("authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(reportRes.status).toBe(200);
    expect(reportRes.headers["content-type"]).toBe("application/pdf");
    const pdfBytes = reportRes.body as Buffer;
    expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdfBytes.length).toBeGreaterThan(500);
  });

  it("correcting a failed answer to passing does not retract the already-generated punch item", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const templateRes = await request(app)
      .post("/checklist-templates")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, title: "Single item template", items: [{ prompt: "Guardrails installed", responseType: "pass_fail", order: 1 }] });
    const itemId = templateRes.body.items[0].id as string;

    const inspectionRes = await request(app)
      .post("/inspections")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, templateId: templateRes.body.id });
    const inspectionId = inspectionRes.body.id as string;
    await request(app).post(`/inspections/${inspectionId}/transition`).set("authorization", `Bearer ${token}`).send({ toStatus: "in_progress" });

    const firstAnswer = await request(app)
      .patch(`/inspections/${inspectionId}/responses`)
      .set("authorization", `Bearer ${token}`)
      .send({ responses: [{ templateItemId: itemId, value: { type: "pass_fail", passed: false } }] });
    const generatedPunchItemId = firstAnswer.body[0].generatedPunchItemId as string;
    expect(generatedPunchItemId).toBeTruthy();

    const correctedAnswer = await request(app)
      .patch(`/inspections/${inspectionId}/responses`)
      .set("authorization", `Bearer ${token}`)
      .send({ responses: [{ templateItemId: itemId, value: { type: "pass_fail", passed: true } }] });
    expect(correctedAnswer.body[0].generatedPunchItemId).toBe(generatedPunchItemId);
  });
});

describe("Offline sync (Phase 5 gate: template-driven inspection completed offline, then synced)", () => {
  it("pushes an entire inspection — created, answered, and completed while offline — as one sync record, and the failed item still generates a punch item", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const templateRes = await request(app)
      .post("/checklist-templates")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        title: "Offline inspection template",
        items: [
          { prompt: "Handrails secure", responseType: "pass_fail", order: 1 },
          { prompt: "Notes", responseType: "numeric", order: 2 },
        ],
      });
    const [railsItem, numericItem] = templateRes.body.items;

    const localId = randomUUID();
    const pushRes = await request(app)
      .post("/sync/push")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        entityType: "inspection",
        records: [
          {
            localId,
            baseRevision: null,
            base: null,
            data: {
              templateId: templateRes.body.id,
              status: "completed",
              signedByName: "Field Inspector",
              responses: [
                { templateItemId: railsItem.id, value: { type: "pass_fail", passed: false } },
                { templateItemId: numericItem.id, value: { type: "numeric", number: 18 } },
              ],
            },
          },
        ],
      });
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.results[0].status).toBe("applied");

    const pullRes = await request(app)
      .get("/sync/pull")
      .query({ projectId, entityType: "inspection", since: 0 })
      .set("authorization", `Bearer ${token}`);
    expect(pullRes.status).toBe(200);
    const pulled = pullRes.body.records.find((r: { id: string }) => r.id === localId);
    expect(pulled).toBeTruthy();
    expect(pulled.status).toBe("completed");
    expect(pulled.signedByName).toBe("Field Inspector");

    const detailRes = await request(app).get(`/inspections/${localId}`).set("authorization", `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.responses).toHaveLength(2);
    const failedResponse = detailRes.body.responses.find((r: { templateItemId: string }) => r.templateItemId === railsItem.id);
    expect(failedResponse.generatedPunchItemId).toBeTruthy();
  });
});
