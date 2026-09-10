import { DEFAULT_ROLE_TEMPLATE_LEVELS, defaultTemplateNameForRole } from "@siteops/shared";
import type { ProjectRole } from "@siteops/shared";
import { hashPassword } from "@siteops/shared/server";
import { createDbClient } from "./client";
import {
  companies,
  costCodes,
  locations,
  permissionTemplates,
  projectCompanies,
  projects,
  projectUsers,
  specificationsSections,
  trades,
  userCompanies,
  users,
} from "./schema";

const SEED_PASSWORD = "ChangeMe123!";

interface SeedUser {
  key: string;
  name: string;
  email: string;
  companyKey: "gc" | "sub1" | "sub2" | "consultant" | "owner";
  role: ProjectRole;
}

const SEED_USERS: SeedUser[] = [
  { key: "sara", name: "Sara Haddad", email: "sara.haddad@siteops.test", companyKey: "gc", role: "owner_admin" },
  { key: "omar", name: "Omar Nassar", email: "omar.nassar@siteops.test", companyKey: "gc", role: "project_manager" },
  { key: "lina", name: "Lina Kanaan", email: "lina.kanaan@siteops.test", companyKey: "gc", role: "project_engineer" },
  { key: "khalid", name: "Khalid Zu'bi", email: "khalid.zoubi@siteops.test", companyKey: "gc", role: "superintendent" },
  { key: "yousef", name: "Yousef Amer", email: "yousef.amer@siteops.test", companyKey: "gc", role: "foreman" },
  { key: "mahmoud", name: "Mahmoud Tarawneh", email: "mahmoud.tarawneh@siteops.test", companyKey: "sub2", role: "foreman" },
  { key: "rana", name: "Rana Odeh", email: "rana.odeh@siteops.test", companyKey: "gc", role: "qa_qc" },
  { key: "fadi", name: "Fadi Salameh", email: "fadi.salameh@siteops.test", companyKey: "gc", role: "safety_officer" },
  { key: "huda", name: "Huda Masri", email: "huda.masri@siteops.test", companyKey: "sub1", role: "subcontractor" },
  { key: "ziad", name: "Ziad Btoush", email: "ziad.btoush@siteops.test", companyKey: "sub2", role: "subcontractor" },
  { key: "nadia", name: "Nadia Qutub", email: "nadia.qutub@siteops.test", companyKey: "consultant", role: "consultant" },
  { key: "karim", name: "Karim Abu-Ghazaleh", email: "karim.abughazaleh@siteops.test", companyKey: "owner", role: "client_viewer" },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const { db, queryClient } = createDbClient(connectionString);

  console.warn("Seeding companies...");
  const [gc] = await db
    .insert(companies)
    .values({ name: "Al-Amal General Contracting", type: "gc" })
    .returning();
  const [sub1] = await db
    .insert(companies)
    .values({ name: "Rawafed Electrical Works", type: "sub" })
    .returning();
  const [sub2] = await db
    .insert(companies)
    .values({ name: "Structura Concrete Co.", type: "sub" })
    .returning();
  const [consultant] = await db
    .insert(companies)
    .values({ name: "Amman Engineering Consultants", type: "consultant" })
    .returning();
  const [owner] = await db
    .insert(companies)
    .values({ name: "Petra Development Holdings", type: "owner" })
    .returning();
  if (!gc || !sub1 || !sub2 || !consultant || !owner) throw new Error("company seed failed");
  const companyByKey = { gc, sub1, sub2, consultant, owner };

  console.warn("Seeding permission templates...");
  const templateIdByRole = new Map<ProjectRole, string>();
  const templateEntries = Object.entries(DEFAULT_ROLE_TEMPLATE_LEVELS) as unknown as [
    ProjectRole,
    Record<string, string>,
  ][];
  for (const [role, levels] of templateEntries) {
    const [row] = await db
      .insert(permissionTemplates)
      .values({ name: defaultTemplateNameForRole(role), levels })
      .returning();
    if (!row) throw new Error(`permission template seed failed for ${role}`);
    templateIdByRole.set(role, row.id);
  }

  console.warn("Seeding users...");
  const passwordHash = await hashPassword(SEED_PASSWORD);
  const userByKey = new Map<string, typeof users.$inferSelect>();
  for (const u of SEED_USERS) {
    const [row] = await db
      .insert(users)
      .values({
        email: u.email,
        passwordHash,
        name: u.name,
        localePref: u.role === "consultant" || u.role === "client_viewer" ? "ar" : "en",
      })
      .returning();
    if (!row) throw new Error(`user seed failed for ${u.email}`);
    userByKey.set(u.key, row);
    await db.insert(userCompanies).values({
      userId: row.id,
      companyId: companyByKey[u.companyKey].id,
      title: u.role.replace(/_/g, " "),
    });
  }

  console.warn("Seeding projects...");
  const admin = userByKey.get("sara");
  if (!admin) throw new Error("admin seed user missing");
  const [buildingProject] = await db
    .insert(projects)
    .values({
      name: "Amman Heights Residential Tower",
      address: "King Abdullah II St, Amman, Jordan",
      lat: "31.963158",
      lng: "35.930359",
      localeDefault: "en",
      timezone: "Asia/Amman",
      createdBy: admin.id,
    })
    .returning();
  const [infraProject] = await db
    .insert(projects)
    .values({
      name: "Zarqa Wastewater Pipeline Expansion",
      address: "طريق الأمير محمد، الزرقاء، الأردن",
      lat: "32.072281",
      lng: "36.088692",
      localeDefault: "ar",
      timezone: "Asia/Amman",
      createdBy: admin.id,
    })
    .returning();
  if (!buildingProject || !infraProject) throw new Error("project seed failed");

  console.warn("Seeding project_companies...");
  await db.insert(projectCompanies).values([
    { projectId: buildingProject.id, companyId: gc.id, roleOnProject: "General Contractor" },
    { projectId: buildingProject.id, companyId: sub1.id, roleOnProject: "Electrical Subcontractor" },
    { projectId: buildingProject.id, companyId: sub2.id, roleOnProject: "Concrete Subcontractor" },
    { projectId: buildingProject.id, companyId: owner.id, roleOnProject: "Owner" },
    { projectId: infraProject.id, companyId: gc.id, roleOnProject: "General Contractor" },
    { projectId: infraProject.id, companyId: sub2.id, roleOnProject: "Concrete Subcontractor" },
    { projectId: infraProject.id, companyId: consultant.id, roleOnProject: "Design Consultant" },
    { projectId: infraProject.id, companyId: owner.id, roleOnProject: "Owner" },
  ]);

  console.warn("Seeding project_users...");
  const buildingMembers: SeedUser["key"][] = [
    "sara", "omar", "lina", "khalid", "yousef", "rana", "fadi", "huda", "ziad", "karim",
  ];
  const infraMembers: SeedUser["key"][] = ["sara", "rana", "mahmoud", "ziad", "nadia"];

  for (const key of buildingMembers) {
    const seedUser = SEED_USERS.find((u) => u.key === key);
    const row = userByKey.get(key);
    if (!seedUser || !row) continue;
    await db.insert(projectUsers).values({
      projectId: buildingProject.id,
      userId: row.id,
      companyId: companyByKey[seedUser.companyKey].id,
      role: seedUser.role,
      permissionTemplateId: templateIdByRole.get(seedUser.role),
    });
  }
  for (const key of infraMembers) {
    const seedUser = SEED_USERS.find((u) => u.key === key);
    const row = userByKey.get(key);
    if (!seedUser || !row) continue;
    await db.insert(projectUsers).values({
      projectId: infraProject.id,
      userId: row.id,
      companyId: companyByKey[seedUser.companyKey].id,
      role: seedUser.role,
      permissionTemplateId: templateIdByRole.get(seedUser.role),
    });
  }

  console.warn("Seeding locations (Amman Heights: 12 levels x 4 zones)...");
  const [buildingNode] = await db
    .insert(locations)
    .values({ projectId: buildingProject.id, levelType: "building", name: "Tower A" })
    .returning();
  if (!buildingNode) throw new Error("building location seed failed");
  for (let level = 1; level <= 12; level += 1) {
    const [levelNode] = await db
      .insert(locations)
      .values({
        projectId: buildingProject.id,
        parentId: buildingNode.id,
        levelType: "level",
        name: `Level ${level}`,
      })
      .returning();
    if (!levelNode) continue;
    for (const zone of ["A", "B", "C", "D"]) {
      await db.insert(locations).values({
        projectId: buildingProject.id,
        parentId: levelNode.id,
        levelType: "zone",
        name: `Zone ${zone}`,
      });
    }
  }

  console.warn("Seeding cost codes and spec sections...");
  await db.insert(costCodes).values([
    { projectId: buildingProject.id, code: "03-300", description: "Cast-in-Place Concrete" },
    { projectId: buildingProject.id, code: "07-200", description: "Thermal Protection" },
    { projectId: buildingProject.id, code: "09-900", description: "Painting and Coating" },
    { projectId: buildingProject.id, code: "26-000", description: "Electrical" },
    { projectId: infraProject.id, code: "33-100", description: "Water/Wastewater Utilities" },
    { projectId: infraProject.id, code: "31-230", description: "Excavation and Fill" },
  ]);
  await db.insert(specificationsSections).values([
    { projectId: buildingProject.id, csiCode: "03.30.00", title: "Cast-in-Place Concrete" },
    { projectId: buildingProject.id, csiCode: "26.00.00", title: "Electrical" },
    { projectId: infraProject.id, csiCode: "33.10.00", title: "Water Utilities" },
  ]);

  console.warn("Seeding trades...");
  await db.insert(trades).values([
    { name: "Electrical" },
    { name: "Concrete" },
    { name: "Carpentry" },
    { name: "Plumbing" },
    { name: "HVAC" },
    { name: "Painting" },
    { name: "Steel Erection" },
    { name: "Masonry" },
  ]);

  await queryClient.end();

  console.warn("\nSeed complete. Login as any seeded user with password: " + SEED_PASSWORD);
  console.warn("Examples:");
  console.warn("  owner_admin   sara.haddad@siteops.test        (sees both projects)");
  console.warn("  project_manager omar.nassar@siteops.test      (sees Amman Heights only)");
  console.warn("  client_viewer karim.abughazaleh@siteops.test  (sees Amman Heights, no financial data)");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
