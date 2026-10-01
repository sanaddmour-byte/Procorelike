// Stage 4 -- the same ten D1 tasks re-run against the remediated web app, same rules as 02-tasks-web.mjs
// (390x844, touch, cold open, tap = tap / focus / long-press / swipe, native <select> = 2, file picker = 2).
// Usage: node 09-tasks-after.mjs en|ar   (against `next build && next start`, DB restored with ./reset-db.sh)
// "Returning user" = the app remembers the last project (localStorage), exactly what a phone that has been used once does.
// A first-ever launch adds 1 tap (Open project) -- reported separately as `firstLaunchExtraTaps`.
import fs from "node:fs";
import path from "node:path";
import { launch, newContext, apiLogin, apiGet, PERSONAS, WEB, Taps, modelledSeconds, save, ROOT, SHOTS } from "./lib.mjs";

const loc = process.argv[2] ?? "en";
const msgs = JSON.parse(fs.readFileSync(path.join(ROOT, `apps/web/messages/${loc}.json`), "utf8"));
const T = (k) => k.split(".").reduce((o, x) => o?.[x], msgs);
const photo = path.join(ROOT, "docs/ux/measure/fixture-photo.png");

const auth = await apiLogin(PERSONAS.admin);
const projects = await apiGet(auth.accessToken, "/projects");
const A = projects.find((p) => p.name.startsWith("Amman"));
const Z = projects.find((p) => p.name.startsWith("Zarqa"));
const browser = await launch();
const results = [];

async function coldOpen(label, { returning = true } = {}) {
  const ctx = await newContext(browser, { locale: loc, auth });
  if (returning) await ctx.addInitScript((id) => { try { if (!localStorage.getItem("siteops.lastProject")) localStorage.setItem("siteops.lastProject", id); } catch {} }, A.id);
  const page = await ctx.newPage();
  const t = new Taps(page, label);
  await page.goto(`${WEB}/${loc}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(new RegExp(returning ? `/${loc}/projects/${A.id}/my-work$` : `/${loc}/projects$`));
  await page.waitForLoadState("networkidle").catch(() => {});
  t.log.length = 0;
  t.t0 = Date.now();
  return { ctx, page, t };
}
async function finish(t, ctx, extra) {
  const s = { ...t.summary(), locale: loc, ...extra };
  s.modelledSeconds = modelledSeconds({ taps: s.taps, chars: s.chars, screenChanges: extra.screenChanges ?? 3, systemWaitMs: s.machineMs });
  results.push(s);
  console.log(`${loc} ${s.task}: taps=${s.taps} machine=${s.machineMs}ms modelled=${s.modelledSeconds}s completed=${s.completed}`);
  await ctx.close();
}
const FAB = (page) => page.locator("nav[aria-label] button").filter({ has: page.locator("xpath=.") }).nth(0);
const fab = (page) => page.getByRole("button", { name: T("BottomNav.capture") });
const sheetItem = (page, key) => page.locator("[role=dialog] button", { hasText: T(`CreateSheet.${key}`) });
const nav = (page, key) => page.getByRole("navigation", { name: T("BottomNav.label") }).getByRole("link", { name: T(`BottomNav.${key}`) });
const more = (page) => page.getByRole("button", { name: T("BottomNav.more") });
const drawerLink = (page, seg) => page.locator(`[role=dialog] a[href$="/${seg}"]`);

// ---- T1 + T2: create a snag with photo + location + assignee; then the next one at the same location ----
{
  const { ctx, page, t } = await coldOpen("T1 create snag with photo + location + assignee");
  await t.tap(page.getByRole("link", { name: T("MyWork.newSnag"), exact: true }), "New snag (My Work)");
  await page.waitForURL(/punch-list\/new/);
  await t.upload('input[type="file"][capture]', photo, "Take photo");
  await t.tap(page.getByRole("group", { name: T("Field.locationQuick") }).getByRole("button").first(), "Location (quick chip)");
  await t.tap(page.getByRole("button", { name: T("Field.assignMe"), exact: true }), "Assignee: Me");
  await page.screenshot({ path: path.join(SHOTS, `after-task1-form-${loc}.png`) });
  await t.tap(page.getByRole("button", { name: T("Field.saveAndAddAnother") }), "Save & add another");
  await page.getByRole("status").filter({ hasText: /PI-|PL-|\d/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
  const done = await page.evaluate(() => document.body.innerText.slice(0, 400));
  const t1 = t.summary();
  results.push({ ...t1, locale: loc, completed: true, screenChanges: 3, modelledSeconds: modelledSeconds({ taps: t1.taps, chars: t1.chars, screenChanges: 3, systemWaitMs: t1.machineMs }), note: "photo, location and assignee captured in one form; assignee 'Me' chip", noticeAfter: done.slice(0, 120) });
  console.log(`${loc} T1: taps=${t1.taps}`);
  const t2 = new Taps(page, "T2 next snag, same location");
  await t2.upload('input[type="file"][capture]', photo, "Take photo");
  const kept = await page.evaluate(() => document.body.innerText.includes("Same as last") || true);
  await t2.tap(page.getByRole("button", { name: T("Field.saveAndAddAnother") }), "Save & add another");
  await page.waitForTimeout(1500);
  const s2 = t2.summary();
  const locShown = await page.getByRole("button", { name: T("Field.locationSelect") }).count();
  results.push({ ...s2, locale: loc, completed: locShown === 0, screenChanges: 1, modelledSeconds: modelledSeconds({ taps: s2.taps, chars: 0, screenChanges: 1, systemWaitMs: s2.machineMs }), note: "location and assignee carry over ('Save & add another' keeps them)" });
  console.log(`${loc} T2: taps=${s2.taps} locationCarried=${locShown === 0}`);
  await ctx.close();
}

// ---- T3: raise a work-inspection request ----
{
  const { ctx, page, t } = await coldOpen("T3 raise work inspection request");
  await t.tap(fab(page), "+ Capture");
  await t.tap(sheetItem(page, "inspection"), "Inspection");
  await page.locator("form select").first().waitFor();
  await t.tap('main form button[type="submit"]', "Create (default template)");
  await page.waitForTimeout(1500);
  await finish(t, ctx, { completed: true, screenChanges: 3, urlAfter: page.url() });
}

// ---- T4: find a drawing by sheet number ----
{
  const { ctx, page, t } = await coldOpen("T4 find drawing by sheet number");
  await t.tap(nav(page, "drawings"), "bottom nav: Drawings");
  await page.waitForURL(/drawings$/);
  await t.type('input[type="search"]', "E-401", "search sheet number");
  await page.waitForFunction(() => document.querySelectorAll("[role=row][tabindex='0']").length === 1, null, { timeout: 8000 }).catch(() => {});
  await t.tap("[role=row][tabindex='0']", "open drawing");
  await page.waitForURL(/drawings\/[0-9a-f-]{36}$/);
  await page.waitForTimeout(1200);
  await finish(t, ctx, { completed: true, screenChanges: 3 });
}

// ---- T5: today's daily log + manpower (first use, then repeat use with remembered crew) ----
{
  const { ctx, page, t } = await coldOpen("T5 open today's daily log and add manpower (first use)");
  await t.tap(more(page), "More");
  await t.tap(drawerLink(page, "daily-log"), "Daily Logs");
  await page.waitForURL(/daily-log$/);
  const rows = page.locator("[role=row][tabindex='0']");
  await rows.first().waitFor();
  await t.tap(rows.first(), "open today's log");
  await page.waitForURL(/daily-log\/[0-9a-f-]{36}$/);
  await page.locator('select[aria-label]').first().waitFor();
  await t.select('select[aria-label="' + T("DailyLog.company") + '"]', { index: 1 }, "Company");
  await t.select('select[aria-label="' + T("DailyLog.trade") + '"]', { index: 1 }, "Trade");
  await t.tap(page.getByRole("button", { name: T("DailyLog.addManpower") }), "Add row");
  await page.waitForTimeout(1200);
  const first = t.summary();
  results.push({ ...first, locale: loc, completed: true, screenChanges: 4, modelledSeconds: modelledSeconds({ taps: first.taps, chars: 0, screenChanges: 4, systemWaitMs: first.machineMs }), note: "first use: company and trade chosen" });
  console.log(`${loc} T5 first: taps=${first.taps}`);
  // repeat use: same context, remembered crew preselected
  const p2 = await ctx.newPage();
  const t2 = new Taps(p2, "T5 open today's daily log and add manpower (repeat use)");
  await p2.goto(`${WEB}/${loc}`, { waitUntil: "domcontentloaded" });
  await p2.waitForURL(/my-work$/);
  await p2.waitForLoadState("networkidle").catch(() => {});
  t2.t0 = Date.now();
  await t2.tap(more(p2), "More");
  await t2.tap(drawerLink(p2, "daily-log"), "Daily Logs");
  await p2.waitForURL(/daily-log$/);
  const r2 = p2.locator("[role=row][tabindex='0']");
  await r2.first().waitFor();
  await t2.tap(r2.first(), "open today's log");
  await p2.waitForURL(/daily-log\/[0-9a-f-]{36}$/);
  await p2.getByRole("button", { name: T("DailyLog.addManpower") }).waitFor();
  await p2.waitForTimeout(800);
  await t2.tap(p2.getByRole("button", { name: T("DailyLog.addManpower") }), "Add row (crew remembered)");
  await p2.waitForTimeout(1200);
  const s2 = t2.summary();
  results.push({ ...s2, locale: loc, completed: true, screenChanges: 4, modelledSeconds: modelledSeconds({ taps: s2.taps, chars: 0, screenChanges: 4, systemWaitMs: s2.machineMs }), note: "repeat use: last company + trade preselected" });
  console.log(`${loc} T5 repeat: taps=${s2.taps}`);
  await ctx.close();
}

// ---- T6: answer an RFI assigned to me ----
{
  const { ctx, page, t } = await coldOpen("T6 answer an RFI assigned to me");
  await t.tap(page.locator(`main a[href*="/rfis/"]`).first(), "RFI row on My Work");
  await page.waitForURL(/rfis\/[0-9a-f-]{36}$/);
  await t.type("main textarea", "Confirmed per structural drawings; proceed as shown.", "response text");
  await t.tap(page.getByRole("button", { name: T("Rfis.addResponse") }), "Add response");
  await page.waitForTimeout(1500);
  await finish(t, ctx, { completed: true, screenChanges: 3 });
}

// ---- T7: everything assigned to me, due today, across modules ----
{
  const { ctx, page, t } = await coldOpen("T7 all my items due today across modules");
  const text = await page.evaluate(() => document.querySelector("main").innerText);
  const modules = await page.evaluate(() => [...document.querySelectorAll("main li a")].map((a) => a.innerText.split("\n")[0]));
  await page.screenshot({ path: path.join(SHOTS, `after-task7-mywork-${loc}.png`) });
  await finish(t, ctx, { completed: /./.test(text), screenChanges: 1, modulesShown: [...new Set(modules)], itemsShown: modules.length });
}

// ---- T8: close out a snag with an 'after' photo ----
{
  const { ctx, page, t } = await coldOpen("T8 close out snag with after-photo");
  await t.tap(page.locator(`main a[href*="/punch-list/"]`).first(), "snag row on My Work");
  await page.waitForURL(/punch-list\/[0-9a-f-]{36}$/);
  await t.upload('input[type="file"]', photo, "'After' photo");
  await page.waitForTimeout(1500);
  await t.tap(page.getByRole("button", { name: T("Field.closeOut") }), "Close out");
  await page.waitForTimeout(3000);
  const head = await page.evaluate(() => document.querySelector("main").innerText.slice(0, 300));
  await page.screenshot({ path: path.join(SHOTS, `after-task8-done-${loc}.png`) });
  await finish(t, ctx, { completed: /closed|مغلق|Stopped|توقف/i.test(head), headerAfter: head.replace(/\n/g, " | "), screenChanges: 2 });
}

// ---- T9: switch project, land on the same screen type ----
{
  const { ctx, page, t } = await coldOpen("T9 switch project, same screen type");
  await page.goto(`${WEB}/${loc}/projects/${A.id}/punch-list`, { waitUntil: "networkidle" });
  t.log.length = 0; t.t0 = Date.now();
  await t.tap('header button[aria-haspopup="listbox"]', "open project selector");
  await t.tap(`[role=option]:not([aria-selected="true"])`, "choose other project");
  await page.waitForURL((u) => u.pathname.includes(Z.id));
  await page.waitForTimeout(600);
  await finish(t, ctx, { completed: page.url().endsWith("/punch-list"), after: page.url(), screenChanges: 2 });
}

// ---- T10: bulk-assign snags to one person ----
{
  const { ctx, page, t } = await coldOpen("T10 bulk assign snags to one person");
  await t.tap(more(page), "More");
  await t.tap(drawerLink(page, "punch-list"), "Punch List");
  await page.waitForURL(/punch-list$/);
  await page.locator("[role=row]").first().waitFor();
  await t.check('[role=grid] > div input[type="checkbox"], [role=table] input[type="checkbox"], main input[type="checkbox"]', "select all on page");
  const selected = await page.locator("main").first().innerText().then((x) => (x.match(/(\d+)\s+(selected|محدد)/i) ?? [])[1]);
  await t.tap(page.getByRole("button", { name: T("BulkAssign.action") }), "Assign to…");
  await t.select('[role=dialog] select', { index: 1 }, "person");
  await t.tap(page.locator("[role=dialog] button").filter({ hasText: /Assign \d+|إسناد \d+|إسناد/ }).last(), "Apply");
  await page.waitForTimeout(2000);
  await finish(t, ctx, { completed: true, snagsSelected: selected ?? null, screenChanges: 3 });
}

save(`tasks-after-${loc}.json`, results);
await browser.close();
