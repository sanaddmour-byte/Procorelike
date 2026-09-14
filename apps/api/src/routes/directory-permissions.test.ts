import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createApiDbClients, type ApiDbClients } from "../db";
import { loadEnv } from "../env";

/**
 * Procore-parity Directory + Permissions gate: a directory:admin can see the
 * Companies tab, invite a new person and have them land as a real project
 * member via accept-invite, edit their own contact info, and manage
 * permission templates + per-user overrides -- while a directory:none role
 * (foreman) is refused every admin action.
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

describe("Directory (Procore parity)", () => {
  it("lists project companies for a directory:read role, distinct from the financial-gated companies picker", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const res = await request(app).get(`/projects/${projectId}/directory-companies`).set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("name");
    expect(res.body[0]).toHaveProperty("type");
  });

  it("refuses directory-companies for a directory:none role (foreman on another company)", async () => {
    const token = await loginAs("mahmoud.tarawneh@siteops.test");
    const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
    const infraProjectId = projectsRes.body[0].id as string;
    const res = await request(app).get(`/projects/${infraProjectId}/directory-companies`).set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("lets a member update their own business/mobile phone via PATCH /auth/me and surfaces it in the member list", async () => {
    const token = await loginAs("lina.kanaan@siteops.test");
    const patchRes = await request(app)
      .patch("/auth/me")
      .set("authorization", `Bearer ${token}`)
      .send({ businessPhone: "+962-6-555-0100", mobilePhone: "+962-79-555-0101" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.businessPhone).toBe("+962-6-555-0100");

    const membersRes = await request(app).get(`/projects/${projectId}/members`).set("authorization", `Bearer ${token}`);
    const lina = (membersRes.body as (Member & { businessPhone: string | null; mobilePhone: string | null })[]).find(
      (m) => m.email === "lina.kanaan@siteops.test",
    );
    expect(lina?.businessPhone).toBe("+962-6-555-0100");
    expect(lina?.mobilePhone).toBe("+962-79-555-0101");
  });

  it("full invite -> accept-invite flow lands the new person as a real project member with the invited role/company", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");
    const gc = memberByEmail("sara.haddad@siteops.test");
    // Unique per test run: this suite runs against a persistent, never-reset
    // seeded database, so a fixed email would collide with a previous run's
    // leftover user (users.email is unique).
    const newHireEmail = `new.hire.${randomUUID()}@siteops.test`;

    const inviteRes = await request(app)
      .post("/auth/invite")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ email: newHireEmail, companyId: gc.companyId, projectId, role: "consultant" });
    expect(inviteRes.status).toBe(201);
    const { inviteToken } = inviteRes.body as { inviteToken: string };
    expect(inviteToken).toBeTruthy();

    const acceptRes = await request(app)
      .post("/auth/accept-invite")
      .send({ inviteToken, name: "New Hire", password: "SuperSecret123!" });
    expect(acceptRes.status).toBe(201);
    expect(acceptRes.body.user.email).toBe(newHireEmail);

    const newMembersRes = await request(app)
      .get(`/projects/${projectId}/members`)
      .set("authorization", `Bearer ${acceptRes.body.accessToken}`);
    const newMember = (newMembersRes.body as (Member & { role: string })[]).find((m) => m.email === newHireEmail);
    expect(newMember?.role).toBe("consultant");
    expect(newMember?.companyId).toBe(gc.companyId);

    // A reused/expired invite token is refused.
    const reuseRes = await request(app)
      .post("/auth/accept-invite")
      .send({ inviteToken, name: "Someone Else", password: "AnotherSecret123!" });
    expect(reuseRes.status).toBe(400);
  });

  it("refuses to create an invite for a caller without directory:admin", async () => {
    const token = await loginAs("mahmoud.tarawneh@siteops.test");
    const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
    const infraProjectId = projectsRes.body[0].id as string;
    const res = await request(app)
      .post("/auth/invite")
      .set("authorization", `Bearer ${token}`)
      .send({ email: "someone@siteops.test", companyId: memberByEmail("sara.haddad@siteops.test").companyId, projectId: infraProjectId, role: "consultant" });
    expect(res.status).toBe(403);
  });
});

describe("Permissions (Procore parity)", () => {
  it("lets a directory:admin create, list, update, and delete a permission template", async () => {
    const token = await loginAs("omar.nassar@siteops.test");

    const createRes = await request(app)
      .post("/permission-templates")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, name: "Field QA (test)", levels: { punch_list: "admin", inspections: "standard" } });
    expect(createRes.status).toBe(201);
    const templateId = createRes.body.id as string;

    const listRes = await request(app).get(`/permission-templates?projectId=${projectId}`).set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect((listRes.body as { id: string }[]).some((t) => t.id === templateId)).toBe(true);

    const updateRes = await request(app)
      .patch(`/permission-templates/${templateId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, levels: { punch_list: "admin", inspections: "admin" } });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.levels.inspections).toBe("admin");

    const deleteRes = await request(app)
      .delete(`/permission-templates/${templateId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ projectId });
    expect(deleteRes.status).toBe(204);
  });

  it("refuses to delete a permission template that is still assigned to a project member", async () => {
    const token = await loginAs("omar.nassar@siteops.test");
    const gc = memberByEmail("sara.haddad@siteops.test");

    // A dedicated throwaway member for this test (rather than reassigning a
    // seeded user like lina.kanaan, whose template other test files rely on
    // and which run concurrently against the same database).
    const inviteRes = await request(app)
      .post("/auth/invite")
      .set("authorization", `Bearer ${token}`)
      .send({ email: `template-assignee.${randomUUID()}@siteops.test`, companyId: gc.companyId, projectId, role: "consultant" });
    const acceptRes = await request(app)
      .post("/auth/accept-invite")
      .send({ inviteToken: inviteRes.body.inviteToken, name: "Template Assignee", password: "SuperSecret123!" });
    const assigneeUserId = acceptRes.body.user.id as string;

    const createRes = await request(app)
      .post("/permission-templates")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId, name: "In-use template (test)", levels: { rfis: "read" } });
    const templateId = createRes.body.id as string;

    const assignRes = await request(app)
      .patch(`/projects/${projectId}/members/${assigneeUserId}/permission-template`)
      .set("authorization", `Bearer ${token}`)
      .send({ permissionTemplateId: templateId });
    expect(assignRes.status).toBe(204);

    const deleteRes = await request(app)
      .delete(`/permission-templates/${templateId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ projectId });
    expect(deleteRes.status).toBe(400);

    // Clean up: unassign, then the template can be deleted.
    const clearRes = await request(app)
      .patch(`/projects/${projectId}/members/${assigneeUserId}/permission-template`)
      .set("authorization", `Bearer ${token}`)
      .send({ permissionTemplateId: null });
    expect(clearRes.status).toBe(204);
    const finalDeleteRes = await request(app)
      .delete(`/permission-templates/${templateId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ projectId });
    expect(finalDeleteRes.status).toBe(204);
  });

  it("a per-user permission override wins over the assigned template, and clearing it reverts to the template default", async () => {
    const adminToken = await loginAs("omar.nassar@siteops.test");
    const yousef = memberByEmail("yousef.amer@siteops.test"); // foreman: rfis "none" by default template

    // Baseline: foreman cannot read RFIs.
    const beforeRes = await request(app).get(`/rfis?projectId=${projectId}`).set("authorization", `Bearer ${await loginAs("yousef.amer@siteops.test")}`);
    expect(beforeRes.status).toBe(403);

    const setRes = await request(app)
      .put("/permission-overrides")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ userId: yousef.userId, projectId, module: "rfis", level: "read" });
    expect(setRes.status).toBe(204);

    const afterOverrideRes = await request(app).get(`/rfis?projectId=${projectId}`).set("authorization", `Bearer ${await loginAs("yousef.amer@siteops.test")}`);
    expect(afterOverrideRes.status).toBe(200);

    const memberPermsRes = await request(app).get(`/projects/${projectId}/member-permissions`).set("authorization", `Bearer ${adminToken}`);
    const yousefPerms = (memberPermsRes.body as { userId: string; overrides: Record<string, string> }[]).find((m) => m.userId === yousef.userId);
    expect(yousefPerms?.overrides.rfis).toBe("read");

    const clearRes = await request(app)
      .delete("/permission-overrides")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ userId: yousef.userId, projectId, module: "rfis" });
    expect(clearRes.status).toBe(204);

    const afterClearRes = await request(app).get(`/rfis?projectId=${projectId}`).set("authorization", `Bearer ${await loginAs("yousef.amer@siteops.test")}`);
    expect(afterClearRes.status).toBe(403);
  });

  it("refuses permission-template management and member-permissions listing for a caller without directory:admin", async () => {
    const token = await loginAs("mahmoud.tarawneh@siteops.test");
    const projectsRes = await request(app).get("/projects").set("authorization", `Bearer ${token}`);
    const infraProjectId = projectsRes.body[0].id as string;

    const createRes = await request(app)
      .post("/permission-templates")
      .set("authorization", `Bearer ${token}`)
      .send({ projectId: infraProjectId, name: "Should fail", levels: {} });
    expect(createRes.status).toBe(403);

    const listRes = await request(app).get(`/projects/${infraProjectId}/member-permissions`).set("authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(403);
  });
});
