import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv, type Env } from "../env";

/**
 * Phase 19's email-to-project logging: a registered project member CCs or
 * forwards mail to their project's `<inboundEmailToken>@INBOUND_EMAIL_DOMAIN`
 * alias, and POST /internal/inbound-email (a mail provider's webhook,
 * gated by a shared secret rather than a session) logs it as an ordinary
 * "incoming" Correspondence entry -- same correspondence:standard gate
 * manual creation uses. Preconditions: same seeded Postgres as
 * apps/api/src/routes/integration.test.ts.
 */

const SEED_PASSWORD = "ChangeMe123!";

let app: Express;
let clients: ApiDbClients;
let env: Env;
let projectId: string;
let inboundToAddress: string;

beforeAll(async () => {
  env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);

  const token = await loginAs("omar.nassar@siteops.test");
  const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = projectsRes.body[0].id as string;

  const projectRes = await request(app).get(`/projects/${projectId}`).set("authorization", `Bearer ${token}`);
  const inboundEmailToken = projectRes.body.inboundEmailToken as string;
  inboundToAddress = `${inboundEmailToken}@${env.INBOUND_EMAIL_DOMAIN}`;
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

function postInboundEmail(body: Record<string, unknown>, secret = env.INBOUND_EMAIL_WEBHOOK_SECRET) {
  return request(app).post("/internal/inbound-email").set("x-inbound-email-secret", secret).send(body);
}

describe("POST /internal/inbound-email", () => {
  it("rejects a request with the wrong shared secret", async () => {
    const res = await postInboundEmail({ to: inboundToAddress, from: "omar.nassar@siteops.test", subject: "x", text: "x" }, "wrong-secret");
    expect(res.status).toBe(401);
  });

  it("reports unknown_project for a 'to' address with no matching project token", async () => {
    const res = await postInboundEmail({
      to: `not-a-real-token@${env.INBOUND_EMAIL_DOMAIN}`,
      from: "omar.nassar@siteops.test",
      subject: "x",
      text: "x",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ matched: false, reason: "unknown_project" });
  });

  it("reports unknown_sender when the From address matches no registered user", async () => {
    const res = await postInboundEmail({ to: inboundToAddress, from: "nobody@nowhere.example", subject: "x", text: "x" });
    expect(res.body).toEqual({ matched: false, reason: "unknown_sender" });
  });

  it("reports unknown_sender when the sender is a real registered user but not a member of this project", async () => {
    // seed.ts's mahmoud.tarawneh is a real user, but only on the infra project, not the building
    // project resolved via inboundToAddress -- distinct from the "no such user at all" case above.
    const res = await postInboundEmail({ to: inboundToAddress, from: "Mahmoud Tarawneh <mahmoud.tarawneh@siteops.test>", subject: "x", text: "x" });
    expect(res.body).toEqual({ matched: false, reason: "unknown_sender" });
  });

  it("logs a matched sender's email as incoming correspondence, including a display-name-wrapped From header", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");

    const res = await postInboundEmail({
      to: `Project Inbox <${inboundToAddress}>`,
      from: "Omar Nassar <omar.nassar@siteops.test>",
      subject: "Re: site access for next week",
      text: "Please confirm the crew can access the east gate starting Monday.",
    });
    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(true);
    const correspondenceId = res.body.correspondenceId as string;
    expect(correspondenceId).toBeTruthy();

    const listRes = await request(app).get(`/correspondence?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    const logged = (listRes.body as { id: string; direction: string; subject: string; body: string }[]).find((c) => c.id === correspondenceId);
    expect(logged).toBeDefined();
    expect(logged?.direction).toBe("incoming");
    expect(logged?.subject).toBe("Re: site access for next week");
    expect(logged?.body).toBe("Please confirm the crew can access the east gate starting Monday.");
  });

  it("defaults an empty subject to a placeholder rather than an empty string", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");
    const res = await postInboundEmail({ to: inboundToAddress, from: "omar.nassar@siteops.test", text: "No subject line at all." });
    expect(res.body.matched).toBe(true);

    const listRes = await request(app).get(`/correspondence?projectId=${projectId}`).set("authorization", `Bearer ${adminToken}`);
    const logged = (listRes.body as { id: string; subject: string }[]).find((c) => c.id === res.body.correspondenceId);
    expect(logged?.subject).toBe("(no subject)");
  });
});
