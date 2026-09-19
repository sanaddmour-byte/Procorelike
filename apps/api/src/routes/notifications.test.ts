import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Integration tests for the notification.service.ts wiring: creating or
 * transitioning an RFI/punch item notifies the right recipients, never the
 * actor, and the notifications list/unread-count/mark-read endpoints work
 * against the caller's own notifications only (RLS: notifications_select
 * scopes to user_id). Preconditions: same seeded Postgres as
 * apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";

let app: Express;
let clients: ApiDbClients;
let projectId: string;
let khalidUserId: string;

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const omarToken = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${omarToken}`);
  projectId = projectsRes.body[0].id as string;

  const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${omarToken}`);
  const khalid = (membersRes.body as { userId: string; email: string }[]).find((m) => m.email === "khalid.zoubi@siteops.test");
  if (!khalid) throw new Error("Seed fixture missing khalid.zoubi@siteops.test on this project");
  khalidUserId = khalid.userId;
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

describe("Notifications", () => {
  it("notifies an RFI's ball-in-court user on creation, but never the creator themself", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const khalidToken = await loginAs("khalid.zoubi@siteops.test");

    const beforeCount = await request(app).get("/notifications/unread-count").set("authorization", `Bearer ${khalidToken}`);
    const beforeUnread = beforeCount.body.count as number;

    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, subject: "Notification test RFI", question: "Please advise.", ballInCourtUserId: khalidUserId });
    expect(createRes.status).toBe(201);
    const rfiId = createRes.body.id as string;

    const afterCount = await request(app).get("/notifications/unread-count").set("authorization", `Bearer ${khalidToken}`);
    expect(afterCount.body.count).toBe(beforeUnread + 1);

    const listRes = await request(app)
      .get("/notifications")
      .query({ unreadOnly: "true" })
      .set("authorization", `Bearer ${khalidToken}`);
    expect(listRes.status).toBe(200);
    const entry = listRes.body.find((n: { type: string; payload: { entityId: string } }) => n.type === "rfi_assigned" && n.payload.entityId === rfiId);
    expect(entry).toBeTruthy();
    expect(entry.readAt).toBeNull();

    // The creator (omar) is also this RFI's actor, so notifyUsers' self-notify
    // guard means he gets nothing from his own action.
    const omarListRes = await request(app).get("/notifications").set("authorization", `Bearer ${omarToken}`);
    const selfEntry = omarListRes.body.find((n: { payload: { entityId: string } }) => n.payload.entityId === rfiId);
    expect(selfEntry).toBeUndefined();

    const markRes = await request(app).post(`/notifications/${entry.id}/read`).set("authorization", `Bearer ${khalidToken}`);
    expect(markRes.status).toBe(200);
    expect(markRes.body.readAt).not.toBeNull();

    const afterReadCount = await request(app).get("/notifications/unread-count").set("authorization", `Bearer ${khalidToken}`);
    expect(afterReadCount.body.count).toBe(beforeUnread);
  });

  it("a user cannot mark another user's notification as read (RLS-scoped update)", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const khalidToken = await loginAs("khalid.zoubi@siteops.test");

    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, subject: "Cross-user notification isolation", question: "Please advise.", ballInCourtUserId: khalidUserId });
    expect(createRes.status).toBe(201);

    const khalidListRes = await request(app).get("/notifications").query({ unreadOnly: "true" }).set("authorization", `Bearer ${khalidToken}`);
    const entry = khalidListRes.body.find((n: { payload: { entityId: string } }) => n.payload.entityId === createRes.body.id);
    expect(entry).toBeTruthy();

    const res = await request(app).post(`/notifications/${entry.id}/read`).set("authorization", `Bearer ${omarToken}`);
    expect(res.status).toBe(404);
  });

  it("read-all marks every unread notification for the caller as read", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const khalidToken = await loginAs("khalid.zoubi@siteops.test");

    await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, subject: "Read-all test RFI", question: "Please advise.", ballInCourtUserId: khalidUserId });

    const readAllRes = await request(app).post("/notifications/read-all").set("authorization", `Bearer ${khalidToken}`);
    expect(readAllRes.status).toBe(204);

    const afterCount = await request(app).get("/notifications/unread-count").set("authorization", `Bearer ${khalidToken}`);
    expect(afterCount.body.count).toBe(0);
  });
});
