// Lists the API requests a cold load of a screen makes, in start order, with start/end offsets (ms) -- finds serial chains.
import path from "node:path";
import fs from "node:fs";
import { launch, newContext, apiLogin, PERSONAS, ROOT } from "./lib.mjs";
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/ux/data/screens.json"), "utf8"));
const screen = process.argv[2] ?? "punch-list";
const auth = await apiLogin(PERSONAS.admin);
const browser = await launch();
const ctx = await newContext(browser, { auth, locale: "en", width: 390 });
const page = await ctx.newPage();
const t0 = Date.now();
const rows = [];
page.on("request", (r) => { if (r.url().includes(":4000")) rows.push({ url: r.url().replace(/^.*:4000/, ""), start: Date.now() - t0, r }); });
page.on("requestfinished", (r) => { const row = rows.find((x) => x.r === r); if (row) row.end = Date.now() - t0; });
await page.goto(`http://localhost:3000/en/projects/${cfg.project}/${screen}`);
await page.waitForTimeout(3500);
for (const r of rows) console.log(String(r.start).padStart(5), String(r.end ?? "?").padStart(5), r.url.slice(0, 90));
await browser.close();
