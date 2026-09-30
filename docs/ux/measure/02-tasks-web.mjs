// Stage 1 -- D1 task walkthroughs on the WEB app at 390x844, from a cold open, counted per Addendum D1.
// Usage: node 02-tasks-web.mjs en|ar   (reset the DB first: ./reset-db.sh)
// Each step is a real interaction against the running app; nothing here is inferred from source.
// A "tap" = tap, long-press, swipe, or keyboard field focus. Choosing an option in a native <select> counts as 2
// (open + choose). A file picker counts as 2 (open + choose). Typing counts characters, not taps.
import fs from "node:fs";
import path from "node:path";
import { launch, newContext, apiLogin, apiGet, PERSONAS, WEB, Taps, modelledSeconds, save, ROOT, SHOTS } from "./lib.mjs";

const loc = process.argv[2] ?? "en";
const msgs = JSON.parse(fs.readFileSync(path.join(ROOT, `apps/web/messages/${loc}.json`), "utf8"));
const T = (key) => key.split(".").reduce((o, k) => o?.[k], msgs);

const photo = path.join(ROOT, "docs/ux/measure/fixture-photo.png");
if (!fs.existsSync(photo)) {
  const { createRequire } = await import("node:module");
  const sharp = createRequire(path.join(ROOT, "apps/web/package.json"))("sharp");
  await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 240, g: 160, b: 30 } } }).png().toFile(photo);
}

const auth = await apiLogin(PERSONAS.admin);
const projects = await apiGet(auth.accessToken, "/projects");
const A = projects.find((p) => p.name.startsWith("Amman"));
const Z = projects.find((p) => p.name.startsWith("Zarqa"));
const H = new Map((await apiGet(auth.accessToken, `/projects/${A.id}/directory`).catch(() => [])).map?.((m) => [m.email, m]) ?? []);

const browser = await launch();
const results = [];

async function coldOpen(label) {
  // New context each time = app closed and reopened; session (localStorage) persists, as on a phone.
  const ctx = await newContext(browser, { locale: loc, auth });
  const page = await ctx.newPage();
  const t = new Taps(page, label);
  await page.goto(`${WEB}/${loc}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(new RegExp(`/${loc}/projects$`));
  await page.locator('a[href$="/directory"]').first().waitFor();
  t.rec("open", "cold open -> lands on /projects (0 taps)");
  t.log.pop(); // opening is not a tap
  t.t0 = Date.now();
  return { ctx, page, t };
}
const MENU = 'header button:has-text("☰")';
async function openProject(t, page, proj = A) {
  await t.tap(page.locator(`a[href*="${proj.id}"][href$="/directory"]`), "project card -> project shell (lands on Directory)");
  await page.waitForURL(/directory/);
}
async function openModule(t, page, seg) {
  await t.tap(MENU, "hamburger (open navigation)");
  await t.tap(`[role=dialog] a[href$="/${seg}"]`, `sidebar: ${seg}`);
  await page.waitForURL(new RegExp(`/${seg}$`));
}
async function finish(t, page, ctx, extra) {
  const s = { ...t.summary(), locale: loc, ...extra };
  s.modelledSeconds = modelledSeconds({ taps: s.taps, chars: s.chars, screenChanges: extra.screenChanges ?? 4, systemWaitMs: s.machineMs });
  results.push(s);
  console.log(`${loc} ${s.task}: taps=${s.taps} machine=${s.machineMs}ms modelled=${s.modelledSeconds}s completed=${s.completed}`);
  return s;
}
const cleanUp = async (ctx) => ctx.close();

// ---------- T1: create a snag with photo + location + assignee (offline-capable) ----------
let t1ctx;
{
  const { ctx, page, t } = await coldOpen("T1 create snag with photo + location + assignee");
  t1ctx = { ctx, page };
  await openProject(t, page);
  await openModule(t, page, "punch-list");
  await t.tap(`a[href$="/punch-list/new"]`, "New punch item");
  await page.waitForURL(/punch-list\/new/);
  await t.type("textarea", "Cracked tile at lobby entrance (audit)", "description");
  // NOTE: the only <select> on this form is "Final approver", NOT an assignee -- there is no assignee control.
  await page.screenshot({ path: path.join(SHOTS, `task1-form-${loc}.png`) });
  await t.tap('form button[type="submit"]', "Create");
  await page.waitForURL(/punch-list\/[0-9a-f-]{36}$/);
  await t.upload('input[type="file"]', photo, "Upload photo");
  await page.waitForResponse((r) => r.url().includes("/attachments") && r.request().method() !== "OPTIONS").catch(() => {});
  await page.waitForTimeout(1500);
  const formFields = await page.evaluate(() => 0);
  const unmet = ["assignee: the create form and the detail page have no assignee control (the only person select is \"Final approver\"); the API create schema does accept assigneeUserId/assigneeCompanyId", "location: the create form has no location field and the item detail page does not show or edit `locationId`", "photo could only be attached AFTER creating (separate screen, +2 taps)", "offline: web has no offline queue (see AUDIT_EVIDENCE §11)"];
  await finish(t, page, ctx, { completed: false, partial: "snag created with description + photo (after creation); assignee and location impossible", unmet, screenChanges: 5 });
  await page.screenshot({ path: path.join(SHOTS, `task1-done-${loc}.png`) });
  // ---------- T2: next snag at the same location ----------
  const t2 = new Taps(page, "T2 next snag, same location");
  await t2.tap(`main a[href$="/punch-list"]`, "Back to punch list");
  await page.waitForURL(/punch-list$/);
  await t2.tap(`a[href$="/punch-list/new"]`, "New punch item");
  await t2.type("textarea", "Second snag same area (audit)", "description");
  await t2.tap('form button[type="submit"]', "Create");
  await page.waitForURL(/punch-list\/[0-9a-f-]{36}$/);
  const s2 = t2.summary();
  s2.locale = loc;
  s2.completed = false;
  s2.partial = "second snag created in 4 taps, but location cannot be set or carried over; no assignee control exists";
  s2.unmet = ["same location: no location field on web", "no state is carried from the previous snag (form is blank)"];
  s2.modelledSeconds = modelledSeconds({ taps: s2.taps, chars: s2.chars, screenChanges: 3, systemWaitMs: s2.machineMs });
  results.push(s2);
  console.log(`${loc} ${s2.task}: taps=${s2.taps} machine=${s2.machineMs}ms`);
  await ctx.close();
}

// ---------- T3: raise a work-inspection request ----------
{
  const { ctx, page, t } = await coldOpen("T3 raise work inspection request");
  await openProject(t, page);
  await openModule(t, page, "inspections");
  await t.tap(page.getByRole("button", { name: T("Inspections.newButton") }), "New inspection");
  await page.locator("form select").first().waitFor();
  await page.screenshot({ path: path.join(SHOTS, `task3-form-${loc}.png`) });
  await t.tap('main form button[type="submit"]', "Create (default template, no date)");
  await page.waitForTimeout(1200);
  const url = page.url();
  await finish(t, page, ctx, { completed: true, partial: "inspection created from the default template; no location, no note/description, no assignee/inspector field on the create form", unmet: ["location of work not capturable at request time"], screenChanges: 4, urlAfter: url });
  await ctx.close();
}

// ---------- T4: find a drawing by sheet number ----------
{
  const { ctx, page, t } = await coldOpen("T4 find drawing by sheet number");
  await openProject(t, page);
  await openModule(t, page, "drawings");
  await t.type('input[type="search"]', "E-401", "search sheet number");
  await page.locator("[role=row][tabindex='0']").first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll("[role=row][tabindex='0']").length === 1, null, { timeout: 8000 }).catch(() => {});
  await t.tap("[role=row][tabindex='0']", "open drawing row");
  await page.waitForURL(/drawings\/[0-9a-f-]{36}$/);
  await page.waitForTimeout(1500);
  await finish(t, page, ctx, { completed: true, screenChanges: 4 });
  await page.screenshot({ path: path.join(SHOTS, `task4-done-${loc}.png`) });
  await ctx.close();
}

// ---------- T5: open today's daily log + add manpower ----------
{
  const { ctx, page, t } = await coldOpen("T5 open today's daily log and add manpower");
  await openProject(t, page);
  await openModule(t, page, "daily-log");
  const rows = page.locator("[role=row][tabindex='0']");
  await rows.first().waitFor();
  await t.tap(rows.first(), "open the most recent daily log (today's)");
  await page.waitForURL(/daily-log\/[0-9a-f-]{36}$/);
  await page.waitForTimeout(800);
  const controls = await page.evaluate(() => [...document.querySelectorAll("main input,main select,main textarea,main button")].map((e) => (e.innerText || e.getAttribute("aria-label") || e.type || "").trim()).filter(Boolean));
  await page.screenshot({ path: path.join(SHOTS, `task5-detail-${loc}.png`) });
  await finish(t, page, ctx, { completed: false, partial: "daily log opened; there is nowhere to add manpower on the detail screen", unmet: ["manpower entry: no UI on daily-log detail or on /daily-log/new (API tables exist: daily_log_manpower)"], controlsOnDetail: controls, screenChanges: 4 });
  await ctx.close();
}

// ---------- T6: answer an RFI assigned to me ----------
{
  const { ctx, page, t } = await coldOpen("T6 answer an RFI assigned to me");
  await openProject(t, page);
  await openModule(t, page, "rfis");
  await t.select("main select >> nth=1", { label: "Sara Haddad" }, "filter: ball in court = me");
  await page.waitForTimeout(1200);
  const rows = page.locator("[role=row][tabindex='0']");
  await rows.first().waitFor();
  await t.tap(rows.first(), "open first RFI in my court");
  await page.waitForURL(/rfis\/[0-9a-f-]{36}$/);
  await t.type("main textarea", "Confirmed per structural drawings; proceed as shown.", "response text");
  await page.screenshot({ path: path.join(SHOTS, `task6-response-${loc}.png`) });
  await t.tap(page.getByRole("button", { name: T("Rfis.addResponse") }), "Add response");
  await page.waitForTimeout(1500);
  await finish(t, page, ctx, { completed: true, partial: "answered online; offline create-and-sync is not supported on web", unmet: ["offline: cannot answer without network"], screenChanges: 5 });
  await ctx.close();
}

// ---------- T7: everything assigned to me, due today, across modules ----------
{
  const { ctx, page, t } = await coldOpen("T7 all my items due today across modules");
  await openProject(t, page);
  await openModule(t, page, "dashboard");
  await page.waitForTimeout(1500);
  const dash = await page.evaluate(() => document.querySelector("main").innerText);
  await page.screenshot({ path: path.join(SHOTS, `task7-dashboard-${loc}.png`) });
  const hasMine = /assigned to me|my tasks|due today|مهامي|المكلف/i.test(dash);
  // best case: the two modules that have any "mine" filter
  await openModule(t, page, "rfis"); // hamburger + link
  await t.select("main select >> nth=1", { label: "Sara Haddad" }, "RFIs: ball in court = me");
  await page.waitForTimeout(800);
  await openModule(t, page, "punch-list");
  const punchFilters = await page.evaluate(() => [...document.querySelectorAll("main select")].map((s) => [...s.options].map((o) => o.textContent).join("|")));
  await finish(t, page, ctx, {
    completed: false,
    partial: "no cross-module 'assigned to me / due today' screen exists; best case reaches RFIs (filterable by ball-in-court) and stops -- punch list has no assignee filter, and 30+ other modules have no personal filter",
    unmet: ["cross-module personal list", "due-today filter", "punch list assignee filter"],
    dashboardHasPersonalOrDueTodaySection: hasMine,
    punchListFilterSelects: punchFilters,
    screenChanges: 6,
  });
  await ctx.close();
}

// ---------- T8: close out a snag with an 'after' photo ----------
{
  const { ctx, page, t } = await coldOpen("T8 close out snag with after-photo");
  await openProject(t, page);
  await openModule(t, page, "punch-list");
  const rows = page.locator("[role=row][tabindex='0']");
  await rows.first().waitFor();
  await t.tap(rows.first(), "open snag");
  await page.waitForURL(/punch-list\/[0-9a-f-]{36}$/);
  await t.upload('input[type="file"]', photo, "Upload 'after' photo");
  await page.waitForTimeout(1500);
  const trail = [];
  for (let i = 0; i < 6; i += 1) {
    const move = page.locator('main button:has-text("' + T("PunchList.moveTo") + '")').first();
    if (!(await move.count())) break;
    const label = (await move.innerText()).trim();
    trail.push(label);
    await t.tap(move, `status: ${label}`);
    await page.waitForTimeout(900);
  }
  const status = await page.evaluate(() => document.querySelector("main").innerText.split("\n").slice(0, 8).join(" | "));
  await page.screenshot({ path: path.join(SHOTS, `task8-done-${loc}.png`) });
  await finish(t, page, ctx, { completed: /closed|مغلق/i.test(status), transitionsTaken: trail, headerAfter: status, screenChanges: 4 });
  await ctx.close();
}

// ---------- T9: switch project and land on the same screen type ----------
{
  const { ctx, page, t } = await coldOpen("T9 switch project, same screen type");
  await openProject(t, page);
  await openModule(t, page, "punch-list");
  const before = page.url();
  t.log.length = 0; // T9 is measured from the moment the user is on the screen
  t.t0 = Date.now();
  await t.tap('header button[aria-haspopup="listbox"]', "open project selector");
  await t.tap(`[role=option]:not([aria-selected="true"])`, "choose other project");
  await page.waitForURL((u) => u.pathname.includes(Z.id));
  await page.waitForTimeout(600);
  const after = page.url();
  await finish(t, page, ctx, { completed: after.endsWith("/punch-list"), before, after, screenChanges: 2 });
  await ctx.close();
}

// ---------- T10: bulk-assign 10 snags to one subcontractor ----------
{
  const { ctx, page, t } = await coldOpen("T10 bulk assign 10 snags to one subcontractor");
  await openProject(t, page);
  await openModule(t, page, "punch-list");
  const rows = page.locator("[role=row][tabindex='0']");
  await rows.first().waitFor();
  // Evidence: what does the multi-select bar offer?
  await page.locator('[role=row] input[type="checkbox"]').nth(1).check();
  await page.waitForTimeout(500);
  const bar = await page.evaluate(() => [...document.querySelectorAll("main button")].map((b) => b.innerText.trim()).filter((s) => /→|Move|Close|Approve|Assign|Reassign|Submit|status/i.test(s)));
  await page.screenshot({ path: path.join(SHOTS, `task10-bulkbar-${loc}.png`) });
  await page.locator('[role=row] input[type="checkbox"]').nth(1).uncheck();
  // Is there ANY per-item way to assign? Open one snag and list every control.
  await t.tap(rows.first(), "open snag (looking for an assignee control)");
  await page.waitForURL(/punch-list\/[0-9a-f-]{36}$/);
  await page.waitForTimeout(800);
  const detailControls = await page.evaluate(() => [...document.querySelectorAll("main select,main input,main textarea,main button")].map((e) => `${e.tagName.toLowerCase()}:${(e.previousSibling?.textContent || e.closest("label")?.innerText || e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30)}`));
  const selectLabels = await page.evaluate(() => [...document.querySelectorAll("main select")].map((s) => (s.parentElement?.innerText || "").split("\n")[0].slice(0, 40)));
  await page.screenshot({ path: path.join(SHOTS, `task10-detail-${loc}.png`) });
  const done = 0;
  await finish(t, page, ctx, { completed: false, bulkBarOffers: bar, detailControls, selectLabels, note: "no assignment is possible at all: the multi-select bar only offers status transitions and the detail page has no assignee control, so 10-snag reassignment cannot be measured; taps shown are those needed to establish that", screenChanges: 4 });
  await ctx.close();
}

save(`tasks-web-${loc}.json`, results);
await browser.close();
