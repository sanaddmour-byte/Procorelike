import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";
import { dueBucketOf } from "../services/field-lookup.service";

/** UX remediation E1/E5: locations + trades lookups and the cross-module "my work" query. Same seeded-Postgres preconditions as integration.test.ts. */
const SEED_PASSWORD = "ChangeMe123!";
const MARKER = `fl${Date.now()}`;

let app: Express;
let clients: ApiDbClients;
let token: string;
let projectId: string;
let userId: string;

beforeAll(async () => {
  const env = loadEnv();
  clients = createApiDbClients(env);
  app = createApp(env, clients);
  const login = await request(app).post("/auth/login").send({ email: "omar.nassar@siteops.test", password: SEED_PASSWORD });
  token = login.body.accessToken as string;
  userId = login.body.user.id as string;
  const projects = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
  projectId = projects.body[0].id as string;
});

afterAll(async () => {
  await clients.authDb.queryClient.end();
  await clients.appDb.queryClient.end();
});

describe("dueBucketOf", () => {
  const now = new Date(2026, 8, 30, 10, 0, 0);
  it("buckets by calendar day", () => {
    expect(dueBucketOf(null, now)).toBe("none");
    expect(dueBucketOf(new Date(2026, 8, 29, 23, 0), now)).toBe("overdue");
    expect(dueBucketOf(new Date(2026, 8, 30, 23, 0), now)).toBe("today");
    expect(dueBucketOf(new Date(2026, 9, 3), now)).toBe("week");
    expect(dueBucketOf(new Date(2026, 10, 3), now)).toBe("later");
  });
});

describe("locations, trades, my-work", () => {
  it("lists locations with computed paths and creates a child with the next level type", async () => {
    const first = await request(app).get(`/projects/${projectId}/locations`).set("authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(Array.isArray(first.body)).toBe(true);
    const created = await request(app)
      .post(`/projects/${projectId}/locations`)
      .set("authorization", `Bearer ${token}`)
      .send({ name: `${MARKER}-building` });
    expect(created.status).toBe(201);
    expect(created.body.levelType).toBe("building");
    const child = await request(app)
      .post(`/projects/${projectId}/locations`)
      .set("authorization", `Bearer ${token}`)
      .send({ name: `${MARKER}-level`, parentId: created.body.id });
    expect(child.status).toBe(201);
    expect(child.body.levelType).toBe("level");
    const after = await request(app).get(`/projects/${projectId}/locations`).set("authorization", `Bearer ${token}`);
    const found = (after.body as { name: string; path: string }[]).find((l) => l.name === `${MARKER}-level`);
    expect(found?.path).toBe(`${MARKER}-building › ${MARKER}-level`);
  });

  it("lists trades", async () => {
    const res = await request(app).get(`/projects/${projectId}/trades`).set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("returns items assigned to me across modules, overdue first", async () => {
    const past = new Date(Date.now() - 3 * 86400000).toISOString();
    const item = await request(app)
      .post("/punch-items")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, description: `${MARKER}-mine`, assigneeUserId: userId, dueDate: past });
    expect(item.status).toBe(201);
    const res = await request(app).get(`/projects/${projectId}/my-work`).set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const mine = (res.body as { id: string; module: string; dueBucket: string }[]).find((i) => i.id === item.body.id);
    expect(mine?.module).toBe("punch_list");
    expect(mine?.dueBucket).toBe("overdue");
    expect((res.body as { dueBucket: string }[])[0]?.dueBucket).toBe("overdue");
  });
});
