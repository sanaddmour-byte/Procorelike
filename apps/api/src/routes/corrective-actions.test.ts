import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Quality & Safety depth gate: OSHA 300 Log fields on safety incidents
 * (classification, injury/illness type, days away/restricted) feeding the
 * osha-log and summary endpoints, plus Corrective Actions -- a trackable,
 * assignable, due-dated action item distinct from the incident's own
 * free-text correctiveAction note.
 */

const SEED_PASSWORD = "ChangeMe123!";

interface Member {
  userId: string;
  email: string;
}

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let members: Member[];

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const token = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = projectsRes.body[0].id as string;

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

describe("OSHA 300 Log fields on safety incidents", () => {
  it("records a recordable incident's OSHA fields and surfaces them in the osha-log and summary endpoints", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const year = 2031; // far enough in the future that no other test's incidents can collide with this year's log

    const createRes = await request(app)
      .post("/safety-incidents")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        occurredAt: `${year}-03-15T10:00:00.000Z`,
        severity: "serious",
        description: "Worker slipped on wet rebar and fractured a wrist",
        oshaClassification: "days_away_from_work",
        injuryIllnessType: "injury",
        bodyPart: "Wrist",
        daysAwayFromWork: 5,
        daysJobTransferOrRestriction: 0,
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.oshaClassification).toBe("days_away_from_work");
    const incidentId = createRes.body.id as string;

    const logRes = await request(app).get(`/safety-incidents/osha-log?projectId=${projectId}&year=${year}`).set("authorization", `Bearer ${token}`);
    expect(logRes.status).toBe(200);
    const logRow = (logRes.body as { incidentId: string; bodyPart: string | null; daysAwayFromWork: number }[]).find(
      (r) => r.incidentId === incidentId,
    );
    expect(logRow).toBeDefined();
    expect(logRow?.bodyPart).toBe("Wrist");
    expect(logRow?.daysAwayFromWork).toBe(5);

    const summaryRes = await request(app).get(`/safety-incidents/summary?projectId=${projectId}`).set("authorization", `Bearer ${token}`);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.oshaRecordableCount).toBeGreaterThanOrEqual(1);
    expect(summaryRes.body.totalDaysAwayFromWork).toBeGreaterThanOrEqual(5);
  });

  it("a not-recordable incident (the default) never appears in the osha-log", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const year = 2032;

    const createRes = await request(app)
      .post("/safety-incidents")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        occurredAt: `${year}-04-01T08:00:00.000Z`,
        severity: "near_miss",
        description: "Ladder wobbled but no one was hurt",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.oshaClassification).toBe("not_recordable");

    const logRes = await request(app).get(`/safety-incidents/osha-log?projectId=${projectId}&year=${year}`).set("authorization", `Bearer ${token}`);
    expect(logRes.body.some((r: { incidentId: string }) => r.incidentId === createRes.body.id)).toBe(false);
  });
});

describe("Corrective Actions", () => {
  it("runs the full open -> in_progress -> completed -> verified lifecycle against a safety incident", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test");

    const incidentRes = await request(app)
      .post("/safety-incidents")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, occurredAt: "2030-01-10T09:00:00.000Z", severity: "minor", description: "Frayed extension cord found on site" });
    const incidentId = incidentRes.body.id as string;

    const createRes = await request(app)
      .post("/corrective-actions")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        sourceType: "safety_incident",
        sourceId: incidentId,
        description: "Replace all frayed extension cords on site",
        assignedToUserId: lina.userId,
        dueDate: "2030-01-20",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("open");
    const actionId = createRes.body.id as string;

    const listRes = await request(app)
      .get(`/corrective-actions?projectId=${projectId}&sourceType=safety_incident&sourceId=${incidentId}`)
      .set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect((listRes.body as { id: string }[]).some((a) => a.id === actionId)).toBe(true);

    const toInProgress = await request(app)
      .post(`/corrective-actions/${actionId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "in_progress" });
    expect(toInProgress.status).toBe(200);
    expect(toInProgress.body.status).toBe("in_progress");

    const toCompleted = await request(app)
      .post(`/corrective-actions/${actionId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "completed" });
    expect(toCompleted.status).toBe(200);
    expect(toCompleted.body.status).toBe("completed");
    expect(toCompleted.body.completedAt).toBeTruthy();

    const toVerified = await request(app)
      .post(`/corrective-actions/${actionId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "verified" });
    expect(toVerified.status).toBe(200);
    expect(toVerified.body.status).toBe("verified");
    expect(toVerified.body.verifiedAt).toBeTruthy();

    // A verified action is a dead end.
    const deadEndRes = await request(app)
      .post(`/corrective-actions/${actionId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "in_progress" });
    expect(deadEndRes.status).toBe(409);
  });

  it("can also attach to a safety observation, and clears completed/verified fields on reopen", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const lina = memberByEmail("lina.kanaan@siteops.test");

    const observationRes = await request(app)
      .post("/safety-observations")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, observedAt: "2030-02-01T09:00:00.000Z", category: "unsafe_condition", description: "Debris blocking fire exit" });
    const observationId = observationRes.body.id as string;

    const createRes = await request(app)
      .post("/corrective-actions")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        sourceType: "safety_observation",
        sourceId: observationId,
        description: "Clear debris from fire exit",
        assignedToUserId: lina.userId,
        dueDate: "2030-02-05",
      });
    const actionId = createRes.body.id as string;

    await request(app).post(`/corrective-actions/${actionId}/transition`).set("authorization", `Bearer ${token}`).send({ toStatus: "completed" });

    const reopenRes = await request(app)
      .post(`/corrective-actions/${actionId}/transition`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "open" });
    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.status).toBe("open");
    expect(reopenRes.body.completedAt).toBeNull();
    expect(reopenRes.body.completedBy).toBeNull();
  });

  it("rejects creating a corrective action without safety:standard", async () => {
    const token = await loginAs("karim.abughazaleh@siteops.test"); // client_viewer: read-only
    const res = await request(app)
      .post("/corrective-actions")
      .set("authorization", `Bearer ${token}`)
      .send({
        projectId,
        sourceType: "safety_incident",
        sourceId: memberByEmail("omar.nassar@siteops.test").userId, // any uuid; permission check runs first
        description: "Should be rejected",
        assignedToUserId: memberByEmail("omar.nassar@siteops.test").userId,
        dueDate: "2030-01-01",
      });
    expect(res.status).toBe(403);
  });
});
