// Stage 1 measurement fixture (NOT product code): tops up the audit database so the D1 tasks have realistic
// preconditions -- a drawing register with sheet numbers, ~40 snags across locations, a daily log for today,
// RFIs whose ball is with the persona, items due today across modules, and notifications.
// Run after seed.ts + seed-demo-content.ts:  DATABASE_URL=... node docs/ux/measure/00-seed-audit-extras.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../../packages/db/package.json"));
const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

const [amman] = await sql`select id from projects where name like 'Amman%'`;
const P = amman.id;
const U = async (e) => (await sql`select id from users where email = ${e}`)[0].id;
const sara = await U("sara.haddad@siteops.test");
const khalid = await U("khalid.zoubi@siteops.test");
const huda = await U("huda.masri@siteops.test");
const ziad = await U("ziad.btoush@siteops.test");
const lina = await U("lina.kanaan@siteops.test");
const comp = await sql`select id, name from companies`;
const cid = (n) => comp.find((c) => c.name.startsWith(n)).id;
const locs = await sql`select id from locations where project_id = ${P} and parent_id is not null`;
const trades = await sql`select id from trades`;

const today = new Date();
today.setUTCHours(12, 0, 0, 0);
const iso = (d) => d.toISOString();

// 30 extra snags: 12 already assigned to Sara (some due today), 18 unassigned-to-sub for bulk-assign test
let n = 20;
for (let i = 0; i < 30; i++) {
  n++;
  await sql`
    insert into punch_items (project_id, number, description, location_id, assignee_user_id, assignee_company_id, trade_id, priority, due_date, status, created_by)
    values (${P}, ${"PL-" + String(n).padStart(3, "0")}, ${["Cracked tile", "Missing sealant", "Paint touch-up needed", "Outlet cover missing", "Door not closing", "Grout haze"][i % 6] + " -- unit " + (400 + i)},
            ${locs[i % locs.length].id}, ${i < 12 ? sara : khalid}, ${i < 12 ? cid("Al-Amal") : cid("Al-Amal")}, ${trades[i % trades.length].id},
            ${["low", "medium", "high"][i % 3]}, ${i % 4 === 0 ? iso(today) : iso(new Date(today.getTime() + (i % 9) * 86400000))}, 'open', ${khalid})`;
}

// Daily log for today (draft) with no manpower yet, plus yesterday with manpower.
const [dl] = await sql`insert into daily_logs (project_id, log_date, notes, created_by) values (${P}, ${iso(today)}, 'Pour on Level 3 slab. Weather clear.', ${khalid}) returning id`;
const [dlY] = await sql`insert into daily_logs (project_id, log_date, notes, created_by) values (${P}, ${iso(new Date(today.getTime() - 86400000))}, 'Formwork Level 4.', ${khalid}) returning id`;
await sql`insert into daily_log_manpower (daily_log_id, company_id, trade_id, headcount, hours) values (${dlY.id}, ${cid("Structura")}, ${trades[1].id}, 12, 96)`;

// RFIs with ball in Sara's court, due today
const r = await sql`select id from rfis where project_id = ${P} and status = 'open' order by number limit 3`;
for (const row of r) await sql`update rfis set ball_in_court_user_id = ${sara}, due_date = ${iso(today)} where id = ${row.id}`;

// Notifications for Sara
const rf = await sql`select id from rfis where project_id = ${P} limit 2`;
for (const row of rf)
  await sql`insert into notifications (user_id, type, payload) values (${sara}, 'rfi_assigned', ${sql.json({ entityType: "rfi", entityId: row.id, projectId: P, message: "RFI assigned to you" })})`;

const counts = await sql`select (select count(*) from punch_items where project_id=${P}) punch, (select count(*) from daily_logs where project_id=${P}) logs, (select count(*) from rfis where ball_in_court_user_id=${sara}) rfis_sara`;
console.log(counts[0]);
await sql.end();
