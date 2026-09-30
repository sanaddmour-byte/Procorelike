// Stage 1 -- horizontal overflow / forced zoom-out check at 360 and 390 px, en + ar.
// A page wider than the viewport makes a mobile browser shrink-to-fit (visualViewport.scale < 1) or scroll sideways.
import fs from "node:fs";
import path from "node:path";
import { launch, newContext, apiLogin, PERSONAS, WEB, save, ROOT } from "./lib.mjs";

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/ux/data/screens.json"), "utf8"));
const auth = await apiLogin(PERSONAS.admin);
const browser = await launch();
const out = [];
for (const loc of ["en", "ar"]) {
  for (const w of [360, 390]) {
    const ctx = await newContext(browser, { w, h: 844, locale: loc, auth });
    for (const [name, route] of cfg.screens) {
      const page = await ctx.newPage();
      await page.goto(`${WEB}/${loc}${route}`, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(600);
      const m = await page.evaluate((vw) => {
        const de = document.documentElement;
        const worst = [...document.querySelectorAll("main *, header *")]
          .map((e) => ({ e, r: e.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.right > vw + 1 || r.left < -1))
          .sort((a, b) => Math.max(b.r.right - vw, -b.r.left) - Math.max(a.r.right - vw, -a.r.left))
          .slice(0, 3)
          .map(({ e, r }) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.split(" ").slice(0, 3).join(".") : ""} [${Math.round(r.left)}..${Math.round(r.right)}]`);
        return { innerWidth, scrollWidth: de.scrollWidth, visualScale: window.visualViewport?.scale ?? 1, worst };
      }, w);
      out.push({ screen: name, locale: loc, width: w, ...m, overflow: m.scrollWidth > w + 1 || m.innerWidth > w + 1 || m.visualScale < 0.99 });
      await page.close();
    }
    await ctx.close();
    console.log("done", loc, w, out.filter((o) => o.locale === loc && o.width === w && o.overflow).length, "overflowing");
  }
}
save("overflow.json", out);
await browser.close();
