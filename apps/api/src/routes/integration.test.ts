import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Integration tests against the docker-compose Postgres, after
 * `pnpm db:migrate && pnpm db:seed` have run (see docs/ROADMAP.md /
 * package.json scripts). They exercise the hard cross-tenant isolation
 * rule from docs/DATA_MODEL.md §10 end-to-end (HTTP → permission engine →
 * RLS), not just the permission engine's unit tests in @siteops/shared.
 */

const SEED_PASSWORD = "ChangeMe123!";

let app: Express;
let clients: ApiDbClients;

beforeAll(() => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);
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

describe("auth", () => {
  it("rejects an unknown email", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@siteops.test", password: SEED_PASSWORD });
    expect(res.status).toBe(401);
  });

  it("rejects a known email with the wrong password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "sara.haddad@siteops.test", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("logs in a seeded user and returns an access + refresh token", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "sara.haddad@siteops.test", password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.email).toBe("sara.haddad@siteops.test");
  });

  it("rejects a request with no bearer token", async () => {
    const res = await request(app).get("/projects");
    expect(res.status).toBe(401);
  });
});

describe("project scoping (RLS + permission engine end-to-end)", () => {
  it("shows the owner_admin (member of both seeded projects) exactly 2 projects", async () => {
    const token = await loginAs("sara.haddad@siteops.test");
    const res = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("shows the project_manager (member of Amman Heights only) exactly 1 project", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const res = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Amman Heights Residential Tower");
  });

  it("shows a different member's foreman only their one (infrastructure) project", async () => {
    const token = await loginAs("mahmoud.tarawneh@siteops.test");
    const res = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Zarqa Wastewater Pipeline Expansion");
  });

  it("cross-tenant: a user not on a project cannot list its members", async () => {
    const omarToken = await loginAs("omar.nassar@siteops.test");
    const infraProjectRes = await request(app)
      .get("/projects")
      .set("authorization", `Bearer ${await loginAs("nadia.qutub@siteops.test")}`);
    const infraProjectId = infraProjectRes.body[0].id as string;

    const res = await request(app)
      .get(`/projects/${infraProjectId}/members`)
      .set("authorization", `Bearer ${omarToken}`);
    expect(res.status).toBe(404);
  });

  it("lets a project member list directory members for their own project", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
    const projectId = projectsRes.body[0].id as string;

    const res = await request(app)
      .get(`/projects/${projectId}/members`)
      .set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
