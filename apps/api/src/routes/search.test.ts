import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * The global search endpoint backing the web app's Cmd/Ctrl+K palette --
 * "Modern Construction Workspace" UI/UX pass.
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

describe("Global search", () => {
  it("finds a project by name with no projectId scope", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const res = await request(app).get("/search").query({ q: "Amman" }).set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.some((r: { type: string; title: string }) => r.type === "project" && r.title.includes("Amman"))).toBe(true);
  });

  it("finds an RFI by number when scoped to its project, and omits it when unscoped", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const scoped = await request(app).get("/search").query({ q: "RFI-0001", projectId }).set("authorization", `Bearer ${token}`);
    expect(scoped.status).toBe(200);
    expect(scoped.body.some((r: { type: string }) => r.type === "rfi")).toBe(true);

    const unscoped = await request(app).get("/search").query({ q: "RFI-0001" }).set("authorization", `Bearer ${token}`);
    expect(unscoped.status).toBe(200);
    expect(unscoped.body.some((r: { type: string }) => r.type === "rfi")).toBe(false);
  });

  it("degrades gracefully instead of erroring when projectId isn't a real membership", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const res = await request(app).get("/search").query({ q: "Amman", projectId: "00000000-0000-0000-0000-000000000000" }).set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("returns nothing for a query under 2 characters", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const res = await request(app).get("/search").query({ q: "a" }).set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/search").query({ q: "Amman" });
    expect(res.status).toBe(401);
  });
});
