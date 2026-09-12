import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 7 gate (Meetings half): log a meeting with action items, carry an
 * unresolved item forward to a new meeting, and convert another straight
 * into a punch item.
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
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = projectsRes.body[0].id as string;
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

describe("Meetings (Phase 7 gate)", () => {
  it("logs a meeting with action items, carries one forward, and converts another to a punch item", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const meeting1Res = await request(app)
      .post("/meetings")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, title: "Weekly OAC meeting", occurredAt: "2026-01-05T09:00:00.000Z" });
    expect(meeting1Res.status).toBe(201);
    const meeting1Id = meeting1Res.body.id as string;

    const item1Res = await request(app)
      .post(`/meetings/${meeting1Id}/items`)
      .set("authorization", `Bearer ${token}`)
      .send({ description: "Confirm elevator shaft dimensions with structural" });
    expect(item1Res.status).toBe(201);
    expect(item1Res.body.status).toBe("open");
    const item1Id = item1Res.body.id as string;

    const item2Res = await request(app)
      .post(`/meetings/${meeting1Id}/items`)
      .set("authorization", `Bearer ${token}`)
      .send({ description: "Touch up paint in the lobby before owner walkthrough" });
    const item2Id = item2Res.body.id as string;

    // Item 1 is still unresolved at the next meeting -- carry it forward.
    const meeting2Res = await request(app)
      .post("/meetings")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, title: "Weekly OAC meeting (follow-up)", occurredAt: "2026-01-12T09:00:00.000Z" });
    const meeting2Id = meeting2Res.body.id as string;

    const carryForwardRes = await request(app)
      .post(`/meeting-items/${item1Id}/carry-forward`)
      .set("authorization", `Bearer ${token}`)
      .send({ toMeetingId: meeting2Id });
    expect(carryForwardRes.status).toBe(201);
    expect(carryForwardRes.body.meetingId).toBe(meeting2Id);
    expect(carryForwardRes.body.carriedForwardFromItemId).toBe(item1Id);
    expect(carryForwardRes.body.status).toBe("open");

    // The original item is untouched by carrying it forward.
    const meeting1Detail = await request(app).get(`/meetings/${meeting1Id}`).set("authorization", `Bearer ${token}`);
    const originalItem = meeting1Detail.body.items.find((i: { id: string }) => i.id === item1Id);
    expect(originalItem.status).toBe("open");

    // Item 2 becomes a real punch item.
    const convertRes = await request(app)
      .post(`/meeting-items/${item2Id}/convert-to-punch-item`)
      .set("authorization", `Bearer ${token}`);
    expect(convertRes.status).toBe(200);
    expect(convertRes.body.status).toBe("converted");
    expect(convertRes.body.convertedToType).toBe("punch_item");
    const punchItemId = convertRes.body.convertedToId as string;
    expect(punchItemId).toBeTruthy();

    const punchItemRes = await request(app).get(`/punch-items/${punchItemId}`).set("authorization", `Bearer ${token}`);
    expect(punchItemRes.status).toBe(200);
    expect(punchItemRes.body.description).toBe("Touch up paint in the lobby before owner walkthrough");

    // A meeting item can be closed directly too, without carrying forward or converting.
    const closeRes = await request(app)
      .patch(`/meeting-items/${item1Id}`)
      .set("authorization", `Bearer ${token}`)
      .send({ toStatus: "closed" });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.status).toBe("closed");
  });
});
