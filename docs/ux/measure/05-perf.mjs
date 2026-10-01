// Stage 1 -- interaction latency, load metrics (FCP/LCP/long-task TBT proxy/transferred JS) for the three most-used screens.
// Two profiles, always labelled: "local" (no throttling; API + DB on localhost) and "emulated-mid-phone"
// (CDP CPU throttle 4x + network 150 ms RTT, 1.6 Mbps down / 750 kbps up). Emulation is NOT a real device.
import path from "node:path";
import fs from "node:fs";
import { launch, newContext, apiLogin, PERSONAS, WEB, save, ROOT } from "./lib.mjs";

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/ux/data/screens.json"), "utf8"));
const P = cfg.project;
const auth = await apiLogin(PERSONAS.admin);
const browser = await launch();
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const N = 5;

async function profile(page, ctx, name) {
  if (name === "local") return;
  const c = await ctx.newCDPSession(page);
  await c.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await c.send("Network.enable");
  await c.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
}

const INSTRUMENT = () => {
  window.__m = { lcp: 0, fcp: 0, longTasks: [], events: [] };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__m.fcp = e.startTime; }).observe({ type: "paint", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.longTasks.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.events.push({ n: e.name, dur: e.duration, delay: e.processingStart - e.startTime }); }).observe({ type: "event", durationThreshold: 16, buffered: true });
  // first-feedback timer for interactions
  window.__t0 = null; window.__fb = null;
  document.addEventListener("pointerdown", () => { window.__t0 = performance.now(); window.__fb = null; }, true);
  document.addEventListener("keydown", () => { window.__t0 = performance.now(); window.__fb = null; }, true);
  new MutationObserver(() => { if (window.__t0 != null && window.__fb == null) window.__fb = performance.now() - window.__t0; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
};

// ---------------- page load ----------------
const SCREENS = { "punch-list": `/en/projects/${P}/punch-list`, rfis: `/en/projects/${P}/rfis`, dashboard: `/en/projects/${P}/dashboard` };
const prev = fs.existsSync(path.join(ROOT, "docs/ux/data/perf.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "docs/ux/data/perf.json"), "utf8")) : null;
const SKIP_LOAD = process.env.PERF_ONLY === "lat" && prev;
const load = SKIP_LOAD ? prev.load : {};
for (const prof of SKIP_LOAD ? [] : ["local", "emulated-mid-phone"]) {
  for (const [name, route] of Object.entries(SCREENS)) {
    const runs = [];
    for (let i = 0; i < N; i += 1) {
      const ctx = await newContext(browser, { auth });
      const page = await ctx.newPage();
      await page.addInitScript(INSTRUMENT);
      await profile(page, ctx, prof);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      const reqs = new Map();
      let jsBytes = 0, totalBytes = 0, jsCount = 0, apiCalls = 0;
      cdp.on("Network.responseReceived", (e) => reqs.set(e.requestId, { type: e.type, url: e.response.url }));
      cdp.on("Network.loadingFinished", (e) => {
        const r = reqs.get(e.requestId);
        if (!r) return;
        totalBytes += e.encodedDataLength;
        if (r.type === "Script") { jsBytes += e.encodedDataLength; jsCount += 1; }
        if (r.url.includes(":4000/")) apiCalls += 1;
      });
      const t0 = Date.now();
      await page.goto(`${WEB}${route}`, { waitUntil: "load" });
      await page.waitForLoadState("networkidle").catch(() => {});
      const idleMs = Date.now() - t0;
      await page.waitForTimeout(600);
      const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const lt = window.__m.longTasks;
        const fcp = window.__m.fcp;
        return { fcp, lcp: window.__m.lcp, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, tbt: lt.filter(([s]) => s > fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0), lastLongTaskEnd: lt.length ? Math.max(...lt.map(([s, d]) => s + d)) : 0 };
      });
      runs.push({ ...m, idleMs, jsKB: +(jsBytes / 1024).toFixed(1), totalKB: +(totalBytes / 1024).toFixed(1), jsCount, apiCalls });
      await ctx.close();
    }
    const agg = {};
    for (const k of Object.keys(runs[0])) agg[k] = +median(runs.map((r) => r[k])).toFixed(1);
    (load[prof] ??= {})[name] = { median: agg, runs };
    console.log(prof, name, JSON.stringify(agg));
  }
}

// ---------------- interaction latency ----------------
// each: start URL, action(page) -> performs the input, then we read the time to first DOM change and to settled state
const ACTIONS = [
  ["open navigation drawer (hamburger)", `/en/projects/${P}/punch-list`, async (p) => p.locator('header button:has-text("☰")').click()],
  ["open project selector", `/en/projects/${P}/punch-list`, async (p) => p.locator('header button[aria-haspopup="listbox"]').click()],
  ["sidebar link -> RFIs (route change)", `/en/projects/${P}/punch-list`, async (p) => { await p.locator('header button:has-text("☰")').click(); await p.waitForTimeout(400); await p.evaluate(() => { window.__t0 = null; window.__fb = null; }); await p.locator('[role=dialog] a[href$="/rfis"]').click(); }],
  ["tap list row -> detail (route change)", `/en/projects/${P}/punch-list`, async (p) => { await p.locator("[role=row][tabindex='0']").first().waitFor(); await p.locator("[role=row][tabindex='0']").first().click(); }],
  ["type in list search (per keystroke, first char)", `/en/projects/${P}/punch-list`, async (p) => { await p.locator('input[type="search"]').click(); await p.evaluate(() => { window.__t0 = null; window.__fb = null; }); await p.keyboard.type("p"); }],
  ["status filter change (server refetch)", `/en/projects/${P}/punch-list`, async (p) => { await p.evaluate(() => { window.__t0 = performance.now(); window.__fb = null; }); await p.locator("main select").first().selectOption({ index: 1 }); }],
  ["Columns menu", `/en/projects/${P}/punch-list`, async (p) => { const b = p.locator('button[aria-haspopup="true"]').first(); if (await b.count()) await b.click(); }],
  ["New punch item (route change)", `/en/projects/${P}/punch-list`, async (p) => p.locator('a[href$="/punch-list/new"]').click()],
  ["Create punch item (submit)", `/en/projects/${P}/punch-list/new`, async (p) => { await p.locator("textarea").fill("latency probe"); await p.evaluate(() => { window.__t0 = null; window.__fb = null; }); await p.locator('form button[type="submit"]').click(); }],
];
const lat = {};
for (const prof of ["local", "emulated-mid-phone"]) {
  for (const [label, url, act] of ACTIONS) {
    const rows = [];
    for (let i = 0; i < 5; i += 1) {
      const ctx = await newContext(browser, { auth });
      const page = await ctx.newPage();
      await page.addInitScript(INSTRUMENT);
      await page.goto(`${WEB}${url}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      await profile(page, ctx, prof);
      await page.evaluate(() => { window.__t0 = null; window.__fb = null; window.__m.events.length = 0; });
      const t0 = Date.now();
      await act(page);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({ firstFeedbackMs: window.__fb, events: window.__m.events.slice(0, 3) }));
      rows.push({ firstFeedbackMs: r.firstFeedbackMs, settledMs: Date.now() - t0 - 500, maxEventDur: Math.max(0, ...r.events.map((e) => e.dur)) });
      await ctx.close();
    }
    const fb = rows.map((r) => r.firstFeedbackMs).filter((x) => x != null);
    (lat[prof] ??= {})[label] = { firstFeedbackMedianMs: fb.length ? +median(fb).toFixed(0) : null, firstFeedbackWorstMs: fb.length ? +Math.max(...fb).toFixed(0) : null, noFeedbackRuns: rows.length - fb.length, settledMedianMs: +median(rows.map((r) => r.settledMs)).toFixed(0), maxEventDurMs: Math.max(...rows.map((r) => r.maxEventDur)) };
    console.log(prof, label, JSON.stringify(lat[prof][label]));
  }
}
save("perf.json", { N, load, lat, note: "local = unthrottled, API/DB on localhost (understates real network); emulated-mid-phone = CDP CPU 4x + 150ms RTT 1.6/0.75 Mbps (emulation, not a device)" });
await browser.close();
