import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 4 (Workflow core) integration tests for Submittals: sequential
 * reviewer ordering (a later reviewer can't jump the queue), the
 * aggregate approve/reject outcome once every assigned reviewer has
 * responded, and parallel reviewers not blocking on order. Preconditions:
 * same seeded Postgres as apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";

interface Member {
  userId: string;
  email: string;
}

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let specSectionId: string;
let members: Member[];

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

async function createAttachment(token: string, ownerId: string): Promise<string> {
  const res = await request(app)
    .post("/attachments/confirm")
    .set("authorization", `Bearer ${token}`)
    .send({
      projectId,
      ownerType: "submittal_revision",
      ownerId,
      storageKey: `${projectId}/submittal_revision/${randomUUID()}-test.pdf`,
      filename: "submittal.pdf",
      mime: "application/pdf",
      size: 4096,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("Submittals", () => {
  it("blocks an out-of-order sequential reviewer, then approves once every reviewer passes", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const omar = memberByEmail("omar.nassar@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test");
    const rana = memberByEmail("rana.odeh@siteops.test");

    const submittalRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, specSectionId, title: "Concrete mix design submittal" });
    expect(submittalRes.status).toBe(201);
    expect(submittalRes.body.number).toMatch(/^SUB-03\.30\.00-\d{3}$/);
    const submittalId = submittalRes.body.id as string;

    const packageRes = await request(app)
      .post(`/submittals/${submittalId}/packages`)
      .set("authorization", `Bearer ${omarToken}`);
    expect(packageRes.status).toBe(201);
    const packageId = packageRes.body.id as string;

    const attachmentId = await createAttachment(omarToken, submittalId);
    const revisionRes = await request(app)
      .post(`/submittals/packages/${packageId}/revisions`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({
        attachmentId,
        submittedDate: "2025-04-01",
        reviewers: [
          { reviewerUserId: lina.userId, sequenceOrder: 1, isParallel: false },
          { reviewerUserId: rana.userId, sequenceOrder: 2, isParallel: false },
        ],
      });
    expect(revisionRes.status).toBe(201);
    const revisionId = revisionRes.body.id as string;

    const afterRevision = await request(app).get(`/submittals/${submittalId}`).set("authorization", `Bearer ${omarToken}`);
    expect(afterRevision.body.status).toBe("in_review");
    expect(afterRevision.body.ballInCourtUserId).toBe(lina.userId); // sequence 1 goes first

    // Rana (sequence 2) tries to jump the queue before Lina has reviewed.
    const ranaToken = await loginAs("rana.odeh@siteops.test");
    const outOfOrderRes = await request(app)
      .post(`/submittals/revisions/${revisionId}/reviews`)
      .set("authorization", `Bearer ${ranaToken}`)
      .send({ responseCode: "approved" });
    expect(outOfOrderRes.status).toBe(400);
    expect(outOfOrderRes.body.error.code).toBe("out_of_sequence");

    // Lina reviews first, as she must.
    const linaToken = await loginAs("lina.kanaan@siteops.test");
    const linaReviewRes = await request(app)
      .post(`/submittals/revisions/${revisionId}/reviews`)
      .set("authorization", `Bearer ${linaToken}`)
      .send({ responseCode: "approved_as_noted" });
    expect(linaReviewRes.status).toBe(200);

    const afterLina = await request(app).get(`/submittals/${submittalId}`).set("authorization", `Bearer ${omarToken}`);
    expect(afterLina.body.status).toBe("in_review"); // still pending Rana
    expect(afterLina.body.ballInCourtUserId).toBe(rana.userId); // now Rana's turn

    // Rana now succeeds since Lina has reviewed.
    const ranaReviewRes = await request(app)
      .post(`/submittals/revisions/${revisionId}/reviews`)
      .set("authorization", `Bearer ${ranaToken}`)
      .send({ responseCode: "approved" });
    expect(ranaReviewRes.status).toBe(200);

    const afterBoth = await request(app).get(`/submittals/${submittalId}`).set("authorization", `Bearer ${omarToken}`);
    expect(afterBoth.body.status).toBe("approved");
    expect(afterBoth.body.ballInCourtUserId).toBe(omar.userId);

    const closeRes = await request(app).post(`/submittals/${submittalId}/close`).set("authorization", `Bearer ${omarToken}`);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.status).toBe("closed");
  });

  it("parallel reviewers don't block on order, and any rejection keeps the submittal in review", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test");
    const rana = memberByEmail("rana.odeh@siteops.test");

    const submittalRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, specSectionId, title: "Concrete admixture data sheet" });
    const submittalId = submittalRes.body.id as string;

    const packageRes = await request(app).post(`/submittals/${submittalId}/packages`).set("authorization", `Bearer ${omarToken}`);
    const packageId = packageRes.body.id as string;

    const attachmentId = await createAttachment(omarToken, submittalId);
    const revisionRes = await request(app)
      .post(`/submittals/packages/${packageId}/revisions`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({
        attachmentId,
        submittedDate: "2025-04-05",
        reviewers: [
          { reviewerUserId: lina.userId, sequenceOrder: 1, isParallel: true },
          { reviewerUserId: rana.userId, sequenceOrder: 1, isParallel: true },
        ],
      });
    const revisionId = revisionRes.body.id as string;

    // Rana reviews first even though both are "sequenceOrder: 1" — parallel means no blocking.
    const ranaToken = await loginAs("rana.odeh@siteops.test");
    const ranaReviewRes = await request(app)
      .post(`/submittals/revisions/${revisionId}/reviews`)
      .set("authorization", `Bearer ${ranaToken}`)
      .send({ responseCode: "revise_resubmit" });
    expect(ranaReviewRes.status).toBe(200);

    const linaToken = await loginAs("lina.kanaan@siteops.test");
    const linaReviewRes = await request(app)
      .post(`/submittals/revisions/${revisionId}/reviews`)
      .set("authorization", `Bearer ${linaToken}`)
      .send({ responseCode: "approved" });
    expect(linaReviewRes.status).toBe(200);

    const finalRes = await request(app).get(`/submittals/${submittalId}`).set("authorization", `Bearer ${omarToken}`);
    // One reviewer asked for a revision, so the whole submittal isn't approved yet.
    expect(finalRes.body.status).toBe("in_review");
  });

  it("rejects a caller who isn't an assigned reviewer on the revision", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test");

    const submittalRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, specSectionId, title: "Rebar shop drawings" });
    const submittalId = submittalRes.body.id as string;
    const packageRes = await request(app).post(`/submittals/${submittalId}/packages`).set("authorization", `Bearer ${omarToken}`);
    const packageId = packageRes.body.id as string;
    const attachmentId = await createAttachment(omarToken, submittalId);
    const revisionRes = await request(app)
      .post(`/submittals/packages/${packageId}/revisions`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ attachmentId, submittedDate: "2025-04-10", reviewers: [{ reviewerUserId: lina.userId, sequenceOrder: 1 }] });
    const revisionId = revisionRes.body.id as string;

    const unrelatedToken = await loginAs("sara.haddad@siteops.test");
    const res = await request(app)
      .post(`/submittals/revisions/${revisionId}/reviews`)
      .set("authorization", `Bearer ${unrelatedToken}`)
      .send({ responseCode: "approved" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("not_a_reviewer");
  });
});
