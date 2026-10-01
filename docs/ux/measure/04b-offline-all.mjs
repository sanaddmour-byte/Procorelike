// Stage 1 -- offline behaviour for EVERY screen in the sweep (390x844, en).
//  (a) cold: the device is offline when the screen is opened from a fresh page  -> what does the user see?
//  (b) mid-session: screen loaded online, connection drops, the user changes a list filter / re-triggers a fetch -> spinner forever, error, or silent stale data?
// P0 per Addendum D: spinner-forever or unhandled error.
import fs from "node:fs";
import path from "node:path";
import { launch, newContext, apiLogin, PERSONAS, WEB, save, ROOT } from "./lib.mjs";

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/ux/data/screens.json"), "utf8"));
const auth = await apiLogin(PERSONAS.admin);
const browser = await launch();
const out = {};

const readState = (page) =>
  page.evaluate(() => {
    const txt = document.body.innerText.replace(/\s+/g, " ").trim();
    const main = (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " ").trim();
    return {
      mainText: main.slice(0, 140),
      mainEmpty: main.length === 0,
      spinner: !!document.querySelector(".animate-spin,[role=progressbar],[aria-busy=true]"),
      loadingText: /loading|جار/i.test(main),
      errorText: /something went wrong|failed|error|unknown_error|حدث خطأ|خطأ/i.test(main),
      retryButton: [...document.querySelectorAll("main button")].some((b) => /retry|try again|إعادة/i.test(b.innerText)),
      browserErrorPage: /ERR_INTERNET_DISCONNECTED|No internet/i.test(txt),
    };
  });

for (const [name, route] of cfg.screens) {
  const r = (out[name] = {});
  // (a) cold offline
  {
    const ctx = await newContext(browser, { auth });
    const page = await ctx.newPage();
    await ctx.setOffline(true);
    let navErr = null;
    await page.goto(`${WEB}/en${route}`, { timeout: 8000 }).catch((e) => (navErr = String(e.message).split("\n")[0]));
    r.cold = { navigationError: navErr };
    await ctx.close();
  }
  // (b) mid-session
  {
    const ctx = await newContext(browser, { auth });
    const page = await ctx.newPage();
    await page.goto(`${WEB}/en${route}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(500);
    await ctx.setOffline(true);
    const sel = page.locator("main select").first();
    const search = page.locator('main input[type="search"]').first();
    let action = "none available";
    if (await sel.count()) {
      const n = await sel.locator("option").count();
      if (n > 1) { await sel.selectOption({ index: 1 }).catch(() => {}); action = "changed first filter"; }
    } else if (await search.count()) {
      await search.fill("x").catch(() => {});
      action = "typed in search";
    } else {
      const btn = page.locator("main a[href], main button").first();
      if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => {}); action = "clicked first control"; }
    }
    await page.waitForTimeout(8000);
    r.mid = { action, ...(await readState(page)) };
    r.mid.p0 = (r.mid.spinner || r.mid.loadingText) && !r.mid.errorText;
    await ctx.close();
  }
  console.log(name, JSON.stringify({ cold: r.cold.navigationError ? "browser error page" : "rendered", mid: r.mid.action, spinner: r.mid.spinner || r.mid.loadingText, error: r.mid.errorText, retry: r.mid.retryButton }));
}
save("offline-all.json", out);
await browser.close();
