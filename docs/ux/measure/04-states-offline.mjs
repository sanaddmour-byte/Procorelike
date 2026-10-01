// Stage 1 -- state coverage (loading / empty / error / offline / populated) and offline behaviour, observed on the running web app at 390x844 (en).
// Empty = a real, newly created project with no records. Loading = API responses delayed 2.5 s. Error = API answers 500. Offline = CDP offline.
import fs from "node:fs";
import path from "node:path";
import { launch, newContext, apiLogin, PERSONAS, WEB, API, SHOTS, save, ROOT } from "./lib.mjs";

const screensCfg = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/ux/data/screens.json"), "utf8"));
const P = screensCfg.project;
const auth = await apiLogin(PERSONAS.admin);

// a truly empty project. POST /projects returns 500 here (RLS violation on the projects insert, see AUDIT_EVIDENCE), so it is inserted directly.
import { createRequire } from "node:module";
const postgres = createRequire(path.join(ROOT, "packages/db/package.json"))("postgres");
const sql = postgres(process.env.DATABASE_URL ?? "postgres://siteops:siteops@localhost:5432/siteops_audit", { onnotice: () => {} });
const [sara] = await sql`select id from users where email = ${PERSONAS.admin}`;
const [pu] = await sql`select company_id, permission_template_id, role from project_users where user_id = ${sara.id} and project_id = ${P} limit 1`;
const [emptyProj] = await sql`insert into projects (name, created_by) values ('Empty audit project', ${sara.id}) returning id`;
await sql`insert into project_users (project_id, user_id, company_id, role, permission_template_id) values (${emptyProj.id}, ${sara.id}, ${pu.company_id}, ${pu.role}, ${pu.permission_template_id})`;
await sql`insert into project_companies (project_id, company_id) select ${emptyProj.id}, company_id from project_companies where project_id = ${P} and company_id = ${pu.company_id}`.catch(() => {});
await sql.end();
const E = emptyProj.id;

const LISTS = ["daily-log", "inspections", "punch-list", "photos", "safety", "tm-tickets", "documents", "drawings", "transmittals", "rfis", "submittals", "correspondence", "meetings", "budget", "commitments", "change-orders", "direct-costs", "billing", "schedule", "lookahead", "directory"];

const LOADING_RX = /loading|جارٍ|جاري|تحميل/i;
const ERROR_RX = /something went wrong|error|failed|حدث خطأ|خطأ|فشل/i;
const EMPTY_RX = /no .* yet|nothing|empty|none|no results|لا يوجد|لا توجد|فارغ/i;

const browser = await launch();
const out = { emptyProject: E, states: {}, offline: {} };

async function snapshot(page, file) {
  await page.screenshot({ path: path.join(SHOTS, file) });
  return page.evaluate(() => {
    const m = document.querySelector("main");
    const txt = (m?.innerText ?? document.body.innerText).trim();
    const full = txt.replace(/\s+/g, " ");
    return {
      full,
      text: full.slice(0, 220),
      spinner: !!document.querySelector('[role=progressbar],[role=status],.animate-spin,.animate-pulse,[aria-busy="true"],[class*=skeleton]'),
      buttons: [...(m ?? document.body).querySelectorAll("button,a")].map((b) => b.innerText.trim()).filter(Boolean).slice(0, 12),
    };
  });
}

for (const seg of LISTS) {
  const s = (out.states[seg] = {});
  // ---- populated (reference) ----
  {
    const ctx = await newContext(browser, { auth });
    const page = await ctx.newPage();
    await page.goto(`${WEB}/en/projects/${P}/${seg}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(500);
    s.populated = await snapshot(page, `state-populated__${seg}.png`);
    await ctx.close();
  }
  // ---- empty ----
  {
    const ctx = await newContext(browser, { auth });
    const page = await ctx.newPage();
    await page.goto(`${WEB}/en/projects/${E}/${seg}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(500);
    s.empty = await snapshot(page, `state-empty__${seg}.png`);
    s.empty.hasEmptyMessage = EMPTY_RX.test(s.empty.full);
    s.empty.hasErrorInstead = ERROR_RX.test(s.empty.full);
    await ctx.close();
  }
  // ---- loading (responses delayed) ----
  {
    const ctx = await newContext(browser, { auth });
    const page = await ctx.newPage();
    await page.route(`${API}/**`, async (route) => {
      if (route.request().method() === "OPTIONS") return route.continue();
      await new Promise((r) => setTimeout(r, 2500));
      route.continue().catch(() => {});
    });
    await page.goto(`${WEB}/en/projects/${P}/${seg}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(900);
    s.loading = await snapshot(page, `state-loading__${seg}.png`);
    s.loading.hasLoadingIndicator = s.loading.spinner || LOADING_RX.test(s.loading.full);
    await ctx.close();
  }
  // ---- error (API 500) ----
  {
    const ctx = await newContext(browser, { auth });
    const page = await ctx.newPage();
    await page.route(`${API}/**`, (route) => {
      if (route.request().method() === "OPTIONS") return route.continue();
      const u = route.request().url();
      if (u.includes("/auth/")) return route.continue();
      route.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": WEB }, body: JSON.stringify({ error: { message: "boom", code: "internal_error" } }) });
    });
    await page.goto(`${WEB}/en/projects/${P}/${seg}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(700);
    s.error = await snapshot(page, `state-error__${seg}.png`);
    s.error.hasErrorMessage = ERROR_RX.test(s.error.full);
    s.error.hasRetry = s.error.buttons.some((b) => /retry|try again|إعادة/i.test(b));
    await ctx.close();
  }
  console.log("states", seg, JSON.stringify({ empty: s.empty.hasEmptyMessage, loading: s.loading.hasLoadingIndicator, error: s.error.hasErrorMessage, retry: s.error.hasRetry }));
}

// ---------- offline ----------
// A) client-side navigation while offline (click a sidebar link)  B) hard reload while offline  C) a write while offline
async function classify(page) {
  await page.waitForTimeout(8000);
  return page.evaluate(() => {
    const txt = document.body.innerText.trim().replace(/\s+/g, " ");
    return { url: location.pathname.split("/").slice(-2).join("/"), drawerStillOpen: !!document.querySelector("[role=dialog]"), alerts: [...document.querySelectorAll('[role=alert],[class*="maroon-"]')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 3), text: txt.slice(0, 160), spinnerVisible: !!document.querySelector('.animate-spin,[role=progressbar]'), loadingText: /loading|جار/i.test(txt), chromeError: /ERR_INTERNET_DISCONNECTED|No internet|This site can.t be reached/i.test(txt) };
  });
}
for (const seg of LISTS.slice(0, 12)) {
  const ctx = await newContext(browser, { auth });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/en/projects/${P}/punch-list`, { waitUntil: "networkidle" }).catch(() => {});
  await ctx.setOffline(true);
  await page.evaluate(() => { document.querySelector('header button')?.click(); });
  const link = page.locator(`[role=dialog] a[href$="/${seg}"], aside a[href$="/${seg}"]`).first();
  await link.click({ timeout: 4000 }).catch(() => {});
  const a = await classify(page);
  await page.screenshot({ path: path.join(SHOTS, `offline-nav__${seg}.png`) });
  out.offline[seg] = { clientNav: a };
  await ctx.close();
}
for (const seg of ["punch-list", "rfis", "daily-log"]) {
  const ctx = await newContext(browser, { auth });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/en/projects/${P}/${seg}`, { waitUntil: "networkidle" }).catch(() => {});
  await ctx.setOffline(true);
  let reload = "ok";
  try { await page.reload({ timeout: 8000 }); } catch (e) { reload = String(e.message).split("\n")[0]; }
  await page.screenshot({ path: path.join(SHOTS, `offline-reload__${seg}.png`) });
  (out.offline[seg] ??= {}).reload = reload;
  await ctx.close();
}
// C) writes while offline: create punch item, add RFI response
{
  const ctx = await newContext(browser, { auth });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/en/projects/${P}/punch-list/new`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("Offline test snag");
  await ctx.setOffline(true);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(6000);
  const after = await page.evaluate(() => ({ url: location.pathname, alerts: [...document.querySelectorAll('[role=alert],[class*="maroon-"]')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 3), buttonText: document.querySelector('form button[type="submit"]')?.innerText, descriptionKept: document.querySelector("textarea")?.value }));
  await page.screenshot({ path: path.join(SHOTS, `offline-write__punch-create.png`) });
  out.offline.writePunchCreate = after;
  await ctx.setOffline(false);
  await ctx.close();
}
{
  const ctx = await newContext(browser, { auth });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/en/projects/${P}/rfis`, { waitUntil: "networkidle" });
  await page.locator("[role=row][tabindex='0']").first().click();
  await page.waitForURL(/rfis\/[0-9a-f-]{36}/);
  await page.waitForTimeout(800);
  await page.locator("main textarea").fill("Offline response");
  await ctx.setOffline(true);
  await page.getByRole("button", { name: "Add response" }).click();
  await page.waitForTimeout(6000);
  const after = await page.evaluate(() => ({ alerts: [...document.querySelectorAll('[role=alert],[class*="maroon-"]')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 3), kept: document.querySelector("main textarea")?.value }));
  await page.screenshot({ path: path.join(SHOTS, `offline-write__rfi-response.png`) });
  out.offline.writeRfiResponse = after;
  await ctx.close();
}
save("states-offline.json", out);
await browser.close();
console.log("done");
