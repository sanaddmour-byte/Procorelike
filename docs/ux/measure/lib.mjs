// Shared measurement helpers for the Stage 1 audit. Measurement only -- no product code.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "../../..");
const require = createRequire(path.join(ROOT, "apps/web/package.json"));
export const { chromium } = require("@playwright/test");

export const WEB = process.env.WEB_URL ?? "http://localhost:3000";
export const API = process.env.API_URL ?? "http://localhost:4000";
export const PASSWORD = "ChangeMe123!";
export const SHOTS = process.env.UX_SHOTS_DIR ?? path.join(ROOT, "docs/ux/screenshots");
export const DATA = process.env.UX_DATA_DIR ?? path.join(ROOT, "docs/ux/data");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

export const PERSONAS = {
  admin: "sara.haddad@siteops.test", // owner_admin: sees every module -> used for all-screen sweeps and most tasks
  super: "khalid.zoubi@siteops.test", // superintendent: the "field" persona
  sub: "huda.masri@siteops.test", // subcontractor
};

export async function apiLogin(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login failed ${r.status}`);
  return r.json();
}
export async function apiGet(token, p) {
  const r = await fetch(`${API}${p}`, { headers: { authorization: `Bearer ${token}` } });
  return r.json();
}

export async function launch() {
  return chromium.launch();
}

/** Context with a persisted signed-in session (cold app open = new page, session already stored). */
export async function newContext(browser, { w = 390, h = 844, locale = "en", scheme = "light", auth, touch = true } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    hasTouch: touch,
    isMobile: w < 500,
    colorScheme: scheme,
    locale: locale === "ar" ? "ar-JO" : "en-US",
    acceptDownloads: true,
  });
  if (auth) await ctx.addInitScript((a) => { try { localStorage.setItem("siteops.auth", JSON.stringify(a)); } catch {} }, auth);
  return ctx;
}

/** Interaction recorder. A "tap" = tap, long-press, swipe, or keyboard field focus (per Addendum D1). */
export class Taps {
  constructor(page, label) {
    this.page = page;
    this.label = label;
    this.log = [];
    this.t0 = Date.now();
    this.waitMs = 0;
  }
  rec(kind, what) {
    this.log.push({ n: this.log.length + 1, kind, what, t: Date.now() - this.t0 });
  }
  async tap(loc, what) {
    const l = typeof loc === "string" ? this.page.locator(loc).first() : loc;
    await l.waitFor({ state: "visible", timeout: 15000 });
    this.rec("tap", what);
    await l.click();
  }
  /** Focusing a text field counts as one tap; typing itself is counted separately as characters. */
  async type(loc, text, what) {
    const l = typeof loc === "string" ? this.page.locator(loc).first() : loc;
    await l.waitFor({ state: "visible", timeout: 15000 });
    this.rec("focus", `${what} (focus)`);
    await l.click();
    await l.fill(text);
    this.chars = (this.chars ?? 0) + text.length;
    this.log[this.log.length - 1].chars = text.length;
  }
  async select(loc, value, what) {
    const l = typeof loc === "string" ? this.page.locator(loc).first() : loc;
    await l.waitFor({ state: "visible", timeout: 15000 });
    this.rec("focus", `${what} (select open)`);
    await l.selectOption(value);
    // A native <select> takes one tap to open and one to choose the option on a phone.
    this.rec("tap", `${what} (choose option)`);
  }
  async check(loc, what) {
    const l = typeof loc === "string" ? this.page.locator(loc).first() : loc;
    await l.waitFor({ state: "visible", timeout: 15000 });
    this.rec("tap", what);
    await l.check();
  }
  async upload(loc, file, what) {
    // File input: on a phone this is tap (open picker) + tap (choose source/photo) -- counted as 2.
    this.rec("tap", `${what} (open file picker)`);
    this.rec("tap", `${what} (choose file)`);
    await this.page.locator(loc).first().setInputFiles(file);
  }
  get count() {
    return this.log.length;
  }
  elapsed() {
    return Date.now() - this.t0;
  }
  summary() {
    return { task: this.label, taps: this.count, chars: this.chars ?? 0, machineMs: this.elapsed(), steps: this.log };
  }
}

/** Keystroke-level model for a phone (MODELLED, not measured): 1.0s per tap + 1.2s reading per screen change + 0.35s/char + measured system wait. */
export function modelledSeconds({ taps, chars, screenChanges, systemWaitMs }) {
  return +(taps * 1.0 + screenChanges * 1.2 + chars * 0.35 + systemWaitMs / 1000).toFixed(1);
}

export function fmt(o) {
  return JSON.stringify(o, null, 2);
}
export function save(name, obj) {
  fs.writeFileSync(path.join(DATA, name), JSON.stringify(obj, null, 2));
}
