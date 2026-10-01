// Stage 1 -- screenshot + metric sweep over every "major" screen.
// Screenshots: 360/390/768 x en(ltr)/ar(rtl) light, plus 390 dark (emulated prefers-color-scheme) -> docs/ux/screenshots/
// Metrics (390 x 844, en + ar, light): density above the fold, touch targets < 44x44, text contrast, horizontal overflow.
// Usage: node 03-sweep.mjs [all|metrics]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { launch, newContext, apiLogin, PERSONAS, WEB, SHOTS, ROOT, save } from "./lib.mjs";

const mode = process.argv[2] ?? "all";
const require = createRequire(path.join(ROOT, "apps/web/package.json"));
// pngjs is only present as a transitive dependency in the pnpm store; load it from there (measurement tooling only).
const { PNG } = createRequire(path.join(ROOT, "node_modules/.pnpm/pngjs@3.4.0/node_modules/pngjs/package.json"))("./lib/png.js");

// ---- resolve ids straight from the audit DB ----
const postgres = createRequire(path.join(ROOT, "packages/db/package.json"))("postgres");
const sql = postgres(process.env.DATABASE_URL ?? "postgres://siteops:siteops@localhost:5432/siteops_audit", { onnotice: () => {} });
const one = async (q) => (await q)[0]?.id;
const P = await one(sql`select id from projects where name like 'Amman%'`);
const ids = {
  punch: await one(sql`select id from punch_items where project_id=${P} order by number limit 1`),
  rfi: await one(sql`select id from rfis where project_id=${P} order by number limit 1`),
  drawing: await one(sql`select id from drawings where project_id=${P} order by sheet_number limit 1`),
  log: await one(sql`select id from daily_logs where project_id=${P} order by log_date desc limit 1`),
  inspection: await one(sql`select id from inspections where project_id=${P} limit 1`),
  submittal: await one(sql`select id from submittals where project_id=${P} limit 1`),
  meeting: await one(sql`select id from meetings where project_id=${P} limit 1`),
  co: await one(sql`select id from change_orders where project_id=${P} limit 1`),
  company: await one(sql`select id from companies limit 1`),
};
await sql.end();

const p = (s) => `/projects/${P}/${s}`;
export const SCREENS = [
  ["login", "/login", false],
  ["projects", "/projects", true],
  ["companies", "/companies", true],
  ["dashboard", p("dashboard"), true],
  ["analytics", p("analytics"), true],
  ["daily-log", p("daily-log"), true],
  ["daily-log-detail", p(`daily-log/${ids.log}`), true],
  ["daily-log-new", p("daily-log/new"), true],
  ["inspections", p("inspections"), true],
  ["inspection-detail", p(`inspections/${ids.inspection}`), true],
  ["punch-list", p("punch-list"), true],
  ["punch-new", p("punch-list/new"), true],
  ["punch-detail", p(`punch-list/${ids.punch}`), true],
  ["photos", p("photos"), true],
  ["safety", p("safety"), true],
  ["tm-tickets", p("tm-tickets"), true],
  ["documents", p("documents"), true],
  ["drawings", p("drawings"), true],
  ["drawing-detail", p(`drawings/${ids.drawing}`), true],
  ["transmittals", p("transmittals"), true],
  ["rfis", p("rfis"), true],
  ["rfi-detail", p(`rfis/${ids.rfi}`), true],
  ["submittals", p("submittals"), true],
  ["submittal-detail", p(`submittals/${ids.submittal}`), true],
  ["correspondence", p("correspondence"), true],
  ["meetings", p("meetings"), true],
  ["budget", p("budget"), true],
  ["commitments", p("commitments"), true],
  ["change-orders", p("change-orders"), true],
  ["billing", p("billing"), true],
  ["schedule", p("schedule"), true],
  ["gantt", p("gantt"), true],
  ["lookahead", p("lookahead"), true],
  ["directory", p("directory"), true],
  ["permissions", p("permissions"), true],
  ["settings", p("settings"), true],
];
fs.writeFileSync(path.join(ROOT, "docs/ux/data/screens.json"), JSON.stringify({ project: P, ids, screens: SCREENS }, null, 2));

const auth = await apiLogin(PERSONAS.admin);
const browser = await launch();

// ---- in-page metric collectors ----
const collect = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && r.bottom > 0 && r.right > 0 && r.left < innerWidth; };
  const sig = (e) => `${e.tagName.toLowerCase()}${e.type ? "[" + e.type + "]" : ""}`;
  const label = (e) => (e.innerText || e.getAttribute("aria-label") || e.placeholder || e.title || "").trim().replace(/\s+/g, " ").slice(0, 40);
  const sel = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=option],[role=menuitem],[role=checkbox],[role=switch]";
  const targets = [...document.querySelectorAll(sel)].filter(vis).map((e) => {
    let r = e.getBoundingClientRect();
    // A checkbox/radio inside a <label> is tapped via the whole label: measure the larger hit area.
    const lab = e.closest("label");
    if ((e.type === "checkbox" || e.type === "radio") && lab) { const lr = lab.getBoundingClientRect(); if (lr.width * lr.height > r.width * r.height) r = lr; }
    return { sig: sig(e), label: label(e), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), cls: e.getAttribute("class") || "" };
  });
  const rows = [...document.querySelectorAll("[role=row][tabindex='0'], tbody tr, main li, main [data-row]")].filter(vis);
  const rowsAbove = rows.filter((e) => e.getBoundingClientRect().bottom <= innerHeight).length;
  const firstContentY = (() => { const m = document.querySelector("main"); const h = m && [...m.querySelectorAll("h1,h2")].find(vis); return h ? Math.round(h.getBoundingClientRect().top) : null; })();
  const headerH = Math.round((document.querySelector("header")?.getBoundingClientRect().height ?? 0));
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || !vis(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
    // skip text that is clipped or covered by another element at its centre (scroll containers, overlays)
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cx > innerWidth || cy < 0 || cy > innerHeight) continue;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || !(el.contains(hit) || hit.contains(el))) continue;
    const cs = getComputedStyle(el);
    let opAcc = 1;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) opAcc *= parseFloat(getComputedStyle(a).opacity);
    texts.push({ t: t.slice(0, 40), color: cs.color, op: +opAcc.toFixed(3), size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10), x: r.left, y: r.top, w: r.width, h: r.height, cls: el.getAttribute("class") || "" });
  }
  // placeholder text is not a DOM text node: measure it from ::placeholder, sampling the field's own background
  for (const f of document.querySelectorAll("input[placeholder],textarea[placeholder]")) {
    if (!vis(f) || f.value) continue;
    const r = f.getBoundingClientRect();
    if (r.bottom > innerHeight) continue;
    const ph = getComputedStyle(f, "::placeholder");
    let opAcc = 1;
    for (let a = f; a && a !== document.documentElement; a = a.parentElement) opAcc *= parseFloat(getComputedStyle(a).opacity);
    texts.push({ t: "[placeholder] " + f.placeholder.slice(0, 28), color: ph.color, op: +opAcc.toFixed(3) * parseFloat(ph.opacity || "1"), size: parseFloat(ph.fontSize || getComputedStyle(f).fontSize), weight: 400, x: r.left, y: r.top, w: r.width, h: r.height, inner: true, cls: f.getAttribute("class") || "" });
  }
  return {
    targets, rowsAbove, rowCount: rows.length, firstContentY, headerH,
    hOverflow: document.documentElement.scrollWidth - innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    fontSizes: [...new Set(texts.map((t) => t.size))].sort((a, b) => a - b),
    texts,
  };
};

const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const parseColor = (s) => (s.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);

function contrastOf(png, texts) {
  const out = [];
  const px = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return null;
    const i = (png.width * y + x) << 2;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };
  for (const t of texts) {
    // Background = pixels in a ring 3 px OUTSIDE the text box (container background, local to gradients); ratio = median over the ring.
    const cy = t.y + t.h / 2;
    const pts = t.inner ? [[t.x + 7, cy], [t.x + t.w - 7, cy], [t.x + 7, t.y + 7], [t.x + t.w - 7, t.y + t.h - 7]] : [[t.x - 3, cy], [t.x + t.w + 3, cy], [t.x + t.w * 0.25, t.y - 3], [t.x + t.w * 0.5, t.y - 3], [t.x + t.w * 0.75, t.y - 3], [t.x + t.w * 0.25, t.y + t.h + 3], [t.x + t.w * 0.5, t.y + t.h + 3], [t.x + t.w * 0.75, t.y + t.h + 3]];
    const fg0 = parseColor(t.color);
    const samples = pts.map(([x, y]) => px(x, y)).filter(Boolean);
    if (!samples.length) continue;
    // effective foreground = colour blended toward the background by the accumulated opacity (disabled/dimmed controls)
    const rs = samples.map((s2) => ratio(fg0.map((c, k) => c * t.op + s2[k] * (1 - t.op)), s2)).sort((a2, b2) => a2 - b2);
    const r = rs[Math.floor(rs.length / 2)];
    out.push({ t: t.t, size: t.size, weight: t.weight, fg: t.color, opacity: t.op, ratio: +r.toFixed(2), ratioMin: +rs[0].toFixed(2), large: t.size >= 24 || (t.size >= 18.66 && t.weight >= 700), cls: t.cls });
  }
  return out;
}

const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");
const metrics = {};
const hashes = {};

async function shoot(ctx, name, route, loc, w, scheme, needsAuth, wantMetrics) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${WEB}/${loc}${route}`, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) { /* keep going: capture whatever rendered */ }
  await page.waitForTimeout(900);
  const file = path.join(SHOTS, `${name}__${loc}-${w}-${scheme}.png`);
  await page.screenshot({ path: file, fullPage: false });
  hashes[`${name}__${loc}-${w}-${scheme}`] = md5(file);
  let m = null;
  if (wantMetrics) {
    const raw = await page.evaluate(collect);
    const flat = path.join(SHOTS, ".tmp-sample.png");
    await page.screenshot({ path: flat, scale: "css" });
    const png = PNG.sync.read(fs.readFileSync(flat));
    const contrast = contrastOf(png, raw.texts);
    delete raw.texts;
    m = { ...raw, url: page.url(), contrast };
  }
  await page.close();
  return m;
}

for (const loc of ["en", "ar"]) {
  for (const w of mode === "metrics" ? [390] : [360, 390, 768]) {
    const h = w === 768 ? 1024 : 844;
    const ctx = await newContext(browser, { w, h, locale: loc, scheme: "light", auth, touch: w < 500 });
    for (const [name, route, needsAuth] of SCREENS) {
      const wantMetrics = w === 390;
      const m = await shoot(ctx, name, route, loc, w, "light", needsAuth, wantMetrics);
      if (m) (metrics[name] ??= {})[loc] = m;
    }
    await ctx.close();
    console.log("done", loc, w);
  }
  if (mode === "metrics") continue;
  // dark emulation at 390
  const ctxD = await newContext(browser, { w: 390, h: 844, locale: loc, scheme: "dark", auth });
  for (const [name, route, needsAuth] of SCREENS) await shoot(ctxD, name, route, loc, 390, "dark", needsAuth, false);
  await ctxD.close();
  console.log("done dark", loc);
}
fs.rmSync(path.join(SHOTS, ".tmp-sample.png"), { force: true });
// light vs dark identical?
const darkSame = Object.keys(hashes).filter((k) => k.endsWith("-dark")).map((k) => ({ shot: k, identicalToLight: hashes[k] === hashes[k.replace("-dark", "-light")] }));
save("sweep-metrics.json", metrics);
if (mode !== "metrics") save("sweep-dark-identity.json", darkSame);
await browser.close();
console.log("dark identical to light:", darkSame.filter((d) => d.identicalToLight).length, "/", darkSame.length);
