import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Phase 20's mobile push notification wiring: POST /push-tokens registers
 * (or reassigns, via upsert on the token's own uniqueness) a device, DELETE
 * removes it, and notification.service.ts's notifyUser fans out to every
 * registered token best-effort -- a push provider being unreachable in this
 * sandbox must never affect the underlying RFI/etc. write it accompanies.
 * Preconditions: same seeded Postgres as apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";
// Obviously-invalid: Expo's real API rejects a token in this shape as
// malformed rather than "unknown but well-formed", so this never risks an
// accidental live delivery even if network egress to exp.host is open.
const FAKE_TOKEN_A = "test-fake-push-token-aaaa";
const FAKE_TOKEN_B = "test-fake-push-token-bbbb";

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
  await request(app).delete("/push-tokens").set("authorization", `Bearer ${await loginAs("omar.nassar@siteops.test")}`).send({ token: FAKE_TOKEN_A });
  await request(app).delete("/push-tokens").set("authorization", `Bearer ${await loginAs("khalid.zoubi@siteops.test")}`).send({ token: FAKE_TOKEN_A });
  await request(app).delete("/push-tokens").set("authorization", `Bearer ${await loginAs("khalid.zoubi@siteops.test")}`).send({ token: FAKE_TOKEN_B });
  await clients.authDb.queryClient.end();
  await clients.appDb.queryClient.end();
});

async function loginAs(email: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password: SEED_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe("Push tokens", () => {
  it("rejects registration without a session", async () => {
    const res = await request(app).post("/push-tokens").send({ token: FAKE_TOKEN_A, platform: "ios" });
    expect(res.status).toBe(401);
  });

  it("registers a token for the caller", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const res = await request(app).post("/push-tokens").set("authorization", `Bearer ${omarToken}`).send({ token: FAKE_TOKEN_A, platform: "ios" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBe(FAKE_TOKEN_A);
    expect(res.body.platform).toBe("ios");
  });

  it("re-registering the same token under a different user reassigns it (device changed hands)", async () => {
    const khalidToken = await loginAs("khalid.zoubi@siteops.test");
    const res = await request(app).post("/push-tokens").set("authorization", `Bearer ${khalidToken}`).send({ token: FAKE_TOKEN_A, platform: "android" });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(khalidUserId);
    expect(res.body.platform).toBe("android");
  });

  it("unregistering another user's token is a no-op, not an error", async () => {
    // FAKE_TOKEN_A now belongs to khalid; omar deleting it should not remove it.
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const res = await request(app).delete("/push-tokens").set("authorization", `Bearer ${omarToken}`).send({ token: FAKE_TOKEN_A });
    expect(res.status).toBe(204);
  });

  it("a notification to a recipient with a registered token does not fail the underlying write", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const khalidToken = await loginAs("khalid.zoubi@siteops.test");

    const registerRes = await request(app).post("/push-tokens").set("authorization", `Bearer ${khalidToken}`).send({ token: FAKE_TOKEN_B, platform: "android" });
    expect(registerRes.status).toBe(201);

    const createRes = await request(app)
      .post("/rfis")
      .set("authorization", `Bearer ${omarToken}`)
      .send({ projectId, subject: "Push dispatch smoke test", question: "Please advise.", ballInCourtUserId: khalidUserId });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get("/notifications").query({ unreadOnly: "true" }).set("authorization", `Bearer ${khalidToken}`);
    const entry = (listRes.body as { payload: { entityId: string } }[]).find((n) => n.payload.entityId === createRes.body.id);
    expect(entry).toBeTruthy();
  });
});
