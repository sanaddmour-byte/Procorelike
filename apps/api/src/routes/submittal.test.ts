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
  companyId: string;
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
    // Lina's "approved as noted" is the worst outcome among the two passing reviews, so it wins the aggregate.
    expect(afterBoth.body.status).toBe("approved_as_noted");
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
    // One reviewer asked for a revision, which is the worst outcome, so it wins the aggregate.
    expect(finalRes.body.status).toBe("revise_resubmit");
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

  it("assigns a ball-in-court user at creation and allows reassigning it via PATCH", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test");
    const rana = memberByEmail("rana.odeh@siteops.test");

    const submittalRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, specSectionId, title: "Elevator shop drawings", ballInCourtUserId: lina.userId });
    expect(submittalRes.status).toBe(201);
    expect(submittalRes.body.ballInCourtUserId).toBe(lina.userId);
    const submittalId = submittalRes.body.id as string;

    const reassignRes = await request(app)
      .patch(`/submittals/${submittalId}`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ ballInCourtUserId: rana.userId });
    expect(reassignRes.status).toBe(200);
    expect(reassignRes.body.ballInCourtUserId).toBe(rana.userId);

    const detailRes = await request(app).get(`/submittals/${submittalId}`).set("authorization", `Bearer ${omarToken}`);
    expect(detailRes.body.ballInCourtUserId).toBe(rana.userId);
  });

  it("records additional distribution personnel at creation and returns them, plus a navigable spec section, on GET", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test");
    const rana = memberByEmail("rana.odeh@siteops.test");

    const submittalRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, specSectionId, title: "Curtain wall shop drawings", distributionUserIds: [lina.userId, rana.userId] });
    expect(submittalRes.status).toBe(201);

    const detailRes = await request(app).get(`/submittals/${submittalRes.body.id}`).set("authorization", `Bearer ${omarToken}`);
    expect(detailRes.status).toBe(200);
    const distributedUserIds = detailRes.body.distribution.map((d: { userId: string | null }) => d.userId);
    expect(distributedUserIds).toEqual(expect.arrayContaining([lina.userId, rana.userId]));
    expect(detailRes.body.specSection.id).toBe(specSectionId);
  });

  it("supports type, responsible contractor, location, received from, due date, and Procore-style Private visibility", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test"); // project_manager
    const rana = memberByEmail("rana.odeh@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test"); // project_engineer: "standard" on submittals, not admin

    const createRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${omarToken}`)
      .send({
        projectId,
        specSectionId,
        title: "Private submittal: curtain wall glazing",
        submittalType: "product_data",
        responsibleContractorCompanyId: rana.companyId,
        location: "Level 4 curtain wall",
        receivedFrom: "Glazing Sub",
        dueDate: "2030-01-01",
        ballInCourtUserId: rana.userId,
        isPrivate: true,
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.submittalType).toBe("product_data");
    expect(createRes.body.responsibleContractorCompanyId).toBe(rana.companyId);
    expect(createRes.body.location).toBe("Level 4 curtain wall");
    expect(createRes.body.receivedFrom).toBe("Glazing Sub");
    expect(createRes.body.isPrivate).toBe(true);
    const submittalId = createRes.body.id as string;

    // A default submittal's type defaults to "shop_drawings" and isPrivate to false.
    const plainRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, specSectionId, title: "Plain submittal" });
    expect(plainRes.body.submittalType).toBe("shop_drawings");
    expect(plainRes.body.isPrivate).toBe(false);

    // Lina has "standard" (non-admin) submittals permission and isn't the creator,
    // ball-in-court, or distributed -- Private hides it from her specifically.
    const linaToken = await loginAs("lina.kanaan@siteops.test");
    const linaSeesIt = await request(app).get(`/submittals/${submittalId}`).set("authorization", `Bearer ${linaToken}`);
    expect(linaSeesIt.status).toBe(404);
    const linaList = await request(app).get("/submittals").query({ projectId }).set("authorization", `Bearer ${linaToken}`);
    expect(linaList.body.some((s: { id: string }) => s.id === submittalId)).toBe(false);

    // Sara has admin-level submittals permission (owner_admin), so Private doesn't hide it from her.
    const saraToken = await loginAs("sara.haddad@siteops.test");
    const saraSeesIt = await request(app).get(`/submittals/${submittalId}`).set("authorization", `Bearer ${saraToken}`);
    expect(saraSeesIt.status).toBe(200);

    // Rana is the ball-in-court user, so she can see it despite not being an admin.
    const ranaToken = await loginAs("rana.odeh@siteops.test");
    const ranaSeesIt = await request(app).get(`/submittals/${submittalId}`).set("authorization", `Bearer ${ranaToken}`);
    expect(ranaSeesIt.status).toBe(200);

    // Adding Lina to the distribution list (via a second private submittal) grants her visibility.
    const distributedRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${omarToken}`)
      .send({
        projectId,
        specSectionId,
        title: "Private submittal with Lina distributed",
        isPrivate: true,
        distributionUserIds: [lina.userId],
      });
    const distributedSubmittalId = distributedRes.body.id as string;
    const linaSeesDistributed = await request(app).get(`/submittals/${distributedSubmittalId}`).set("authorization", `Bearer ${linaToken}`);
    expect(linaSeesDistributed.status).toBe(200);
  });

  it("computes isOverdue from status + dueDate rather than storing it", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const pastDueDate = "2020-01-01";

    const createRes = await request(app)
      .post("/submittals")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, specSectionId, title: "Overdue test submittal", dueDate: pastDueDate });
    const submittalId = createRes.body.id as string;
    expect(createRes.body.isOverdue).toBe(false); // still draft, not in_review yet

    const packageRes = await request(app).post(`/submittals/${submittalId}/packages`).set("authorization", `Bearer ${omarToken}`);
    const packageId = packageRes.body.id as string;
    const attachmentId = await createAttachment(omarToken, submittalId);
    const lina = memberByEmail("lina.kanaan@siteops.test");
    await request(app)
      .post(`/submittals/packages/${packageId}/revisions`)
      .set("authorization", `Bearer ${omarToken}`)
      .send({ attachmentId, submittedDate: "2025-04-01", reviewers: [{ reviewerUserId: lina.userId, sequenceOrder: 1 }] });

    const detailRes = await request(app).get(`/submittals/${submittalId}`).set("authorization", `Bearer ${omarToken}`);
    expect(detailRes.body.status).toBe("in_review");
    expect(detailRes.body.isOverdue).toBe(true);

    const listRes = await request(app).get("/submittals").query({ projectId }).set("authorization", `Bearer ${omarToken}`);
    const listed = listRes.body.find((s: { id: string }) => s.id === submittalId);
    expect(listed.isOverdue).toBe(true);
  });
});
